#!/usr/bin/env python3
"""
SCADA Temperature & Humidity Modbus Poller
Reads ALL data from HMI Haiwell D4 holding registers and coils:
  - Sensor name, temp, hum, calibration, threshold (per sensor)
  - Alarm coils per sensor + global alarm/connection status
  - Room average temp/hum, room name, room detail (per HMI)
Syncs sensor names and room info to DB on every cycle.
Writes sensor readings to PostgreSQL via UPSERT — no HTTP/Laravel calls.

PENTING: SENSOR_MAP dan COIL_MAP harus sinkron dengan konstanta
di resources/js/pages/rooms/devices.tsx (atau sensor-map.ts).
Jika register map berubah, update KEDUA file sekaligus.
"""

import logging
import math
import os
import struct
import sys
import time
from datetime import datetime, timedelta, timezone

import psycopg2
from dotenv import load_dotenv
from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ConnectionException, ModbusException

# ─── Configuration ────────────────────────────────────────────────────────────

load_dotenv()

DB_CONFIG: dict = {
    "host":     os.environ.get("DB_HOST", "127.0.0.1"),
    "port":     int(os.environ.get("DB_PORT", 5432)),
    "user":     os.environ.get("DB_USERNAME", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_DATABASE", "scada_db"),
}

MODBUS_TIMEOUT = 3   # seconds
POLL_INTERVAL  = 5   # seconds per cycle
DECIMAL_MIN    = -999.99
DECIMAL_MAX    = 999.99
STRING_BYTE_ORDER = os.environ.get("STRING_BYTE_ORDER", "auto").lower()
DEBUG_RAW_REGISTERS = os.environ.get("DEBUG_RAW_REGISTERS", "false").lower() in {
    "1", "true", "yes", "on"
}
DIAGNOSTIC_SCAN = os.environ.get("DIAGNOSTIC_SCAN", "false").lower() in {
    "1", "true", "yes", "on"
}
ALLOW_FC_FALLBACK = os.environ.get("ALLOW_FC_FALLBACK", "false").lower() in {
    "1", "true", "yes", "on"
}
NUMERIC_REGISTER_FORMAT = os.environ.get("NUMERIC_REGISTER_FORMAT", "float32").lower()
NUMERIC_FLOAT_WORD_ORDER = os.environ.get("NUMERIC_FLOAT_WORD_ORDER", "ba").lower()

_numeric_offset_tokens = [
    token.strip()
    for token in os.environ.get("NUMERIC_ADDRESS_OFFSETS", "0").split(",")
]
NUMERIC_ADDRESS_OFFSETS: list[int] = []
for token in _numeric_offset_tokens:
    if not token:
        continue
    try:
        parsed_offset = int(token)
    except ValueError:
        continue
    if parsed_offset not in NUMERIC_ADDRESS_OFFSETS:
        NUMERIC_ADDRESS_OFFSETS.append(parsed_offset)

if not NUMERIC_ADDRESS_OFFSETS:
    NUMERIC_ADDRESS_OFFSETS = [0]

if 0 in NUMERIC_ADDRESS_OFFSETS:
    NUMERIC_ADDRESS_OFFSETS = [0] + [
        offset for offset in NUMERIC_ADDRESS_OFFSETS if offset != 0
    ]
else:
    NUMERIC_ADDRESS_OFFSETS = [0] + NUMERIC_ADDRESS_OFFSETS

# String register: 16 karakter max = 8 register (big-endian ASCII, 2 char/register)
STRING_REGISTER_COUNT = 8

# ─── Register Map ─────────────────────────────────────────────────────────────

# Holding register 4X (FC03) per sensor — identik untuk semua HMI Haiwell D4.
# Key = posisi sensor (1-based, sesuai ORDER BY id ASC per hmi_id di DB).
# Nilai temp/hum/calibrate/threshold sudah dalam satuan aktual — tidak perlu scaling.
SENSOR_MAP = {
    1: {
        "name":           1,   # string, 8 register (16 char max)
        "temp":           9,
        "hum":            11,
        "calibrate_temp": 13,
        "calibrate_hum":  15,
        "over_temp":      17,
        "under_temp":     19,
        "over_hum":       21,
        "under_hum":      23,
    },
    2: {
        "name":           25,
        "temp":           33,
        "hum":            35,
        "calibrate_temp": 37,
        "calibrate_hum":  39,
        "over_temp":      41,
        "under_temp":     43,
        "over_hum":       45,
        "under_hum":      47,
    },
    3: {
        "name":           49,
        "temp":           57,
        "hum":            59,
        "calibrate_temp": 61,
        "calibrate_hum":  63,
        "over_temp":      65,
        "under_temp":     67,
        "over_hum":       69,
        "under_hum":      71,
    },
    4: {
        "name":           73,
        "temp":           81,
        "hum":            83,
        "calibrate_temp": 85,
        "calibrate_hum":  87,
        "over_temp":      89,
        "under_temp":     91,
        "over_hum":       93,
        "under_hum":      95,
    },
}

# Holding register HMI-level (per HMI, bukan per sensor)
HMI_REGISTERS = {
    "avg_temp":    97,   # rata-rata suhu 4 sensor, dihitung HMI
    "avg_hum":     99,   # rata-rata hum 4 sensor, dihitung HMI
    "room_name":   101,  # nama ruangan, string 8 register
    "room_detail": 107,  # detail lokasi, string 8 register
}

# Coil 0X (FC01) per sensor — identik untuk semua HMI Haiwell D4.
# Haiwell alamat coil 1-based — di-offset -1 saat read_coils().
COIL_MAP = {
    1: {"alarm_temp": 1,  "alarm_hum": 2,  "connection": 10},
    2: {"alarm_temp": 3,  "alarm_hum": 4,  "connection": 11},
    3: {"alarm_temp": 5,  "alarm_hum": 6,  "connection": 12},
    4: {"alarm_temp": 7,  "alarm_hum": 8,  "connection": 13},
}

# Coil global — enable/disable semua alarm
COIL_ALARM_STATUS      = 9   # True = Data Alarm enabled
COIL_CONNECTION_STATUS = 14  # True = Connection Alarm enabled

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


def normalize_decimal_5_2(value: float, field_name: str, context: str) -> float:
    """
    Pastikan nilai aman untuk kolom DECIMAL(5,2) PostgreSQL.
    Raise ValueError agar caller menandai sensor/HMI gagal baca untuk siklus ini.
    """
    if not math.isfinite(value):
        raise ValueError(f"{context}: {field_name} is not a finite number")

    rounded = round(value, 2)
    if rounded < DECIMAL_MIN or rounded > DECIMAL_MAX:
        raise ValueError(
            f"{context}: {field_name} out of DECIMAL(5,2) range ({rounded})"
        )

    return rounded


def signed_to_raw_word(value: float) -> int:
    """Convert signed 16-bit interpreted value back to raw register word (0..65535)."""
    as_int = int(value)
    if as_int < 0:
        return as_int + 0x10000
    return as_int


def get_func_candidates(primary_func: str) -> list[str]:
    """Return candidate function codes for a read attempt, with optional fallback."""
    if primary_func not in {"03", "04"}:
        return [primary_func]

    if not ALLOW_FC_FALLBACK:
        return [primary_func]

    fallback = "04" if primary_func == "03" else "03"
    return [primary_func, fallback]


def get_numeric_func_candidates(primary_func: str) -> list[str]:
    """
    Untuk data numerik, CSV mendefinisikan 4X (holding register),
    jadi FC03 diprioritaskan. FC04 dipakai sebagai fallback opsional.
    """
    candidates = ["03"]

    if primary_func in {"03", "04"} and primary_func not in candidates:
        candidates.append(primary_func)

    if ALLOW_FC_FALLBACK and "04" not in candidates:
        candidates.append("04")

    return candidates


def get_numeric_address_candidates(address: int) -> list[int]:
    """Bangun kandidat alamat baca numerik berdasarkan offset dari env."""
    candidates: list[int] = []

    for offset in NUMERIC_ADDRESS_OFFSETS:
        candidate = address + offset
        if candidate < 0:
            continue
        if candidate not in candidates:
            candidates.append(candidate)

    if address not in candidates:
        candidates.append(address)

    return candidates


def read_register_block(
    client: ModbusTcpClient,
    address: int,
    count: int,
    unit_id: int,
    func: str,
) -> list[int]:
    """Read register block for FC03/FC04 and return raw register words."""
    if func == "03":
        result = client.read_holding_registers(
            address=address, count=count, device_id=unit_id
        )
    elif func == "04":
        result = client.read_input_registers(
            address=address, count=count, device_id=unit_id
        )
    else:
        raise ModbusException(f"Function code '{func}' tidak didukung")

    if result.isError():
        raise ModbusException(
            f"Slave {unit_id} FC{func} register {address} returned error"
        )

    return [int(register) for register in result.registers]


def decode_float32_value(register_a: int, register_b: int, word_order: str) -> float:
    """Decode float32 dari dua register 16-bit."""
    first, second = (register_a, register_b) if word_order == "ab" else (register_b, register_a)
    packed = struct.pack(">HH", first, second)
    return struct.unpack(">f", packed)[0]


def pick_float32_value(register_a: int, register_b: int) -> float | None:
    """Pilih nilai float32 valid sesuai word order yang dikonfigurasi."""
    if NUMERIC_FLOAT_WORD_ORDER == "ab":
        orders = ["ab"]
    elif NUMERIC_FLOAT_WORD_ORDER == "ba":
        orders = ["ba"]
    else:
        orders = ["ab", "ba"]

    candidates: list[tuple[float, int]] = []
    for index, order in enumerate(orders):
        value = decode_float32_value(register_a, register_b, order)
        if math.isfinite(value) and DECIMAL_MIN <= value <= DECIMAL_MAX:
            # Prioritaskan nilai yang bukan near-zero jika ada kandidat lain.
            is_near_zero = abs(value) < 0.001
            score = 0 if is_near_zero else 10
            score += max(0, 5 - index)
            candidates.append((value, score))

    if candidates:
        candidates.sort(key=lambda item: item[1], reverse=True)
        return candidates[0][0]

    for order in orders:
        value = decode_float32_value(register_a, register_b, order)
        if math.isfinite(value):
            return value

    return None


def _decode_text_by_order(registers: list[int], order: str) -> str:
    chars = []
    for reg in registers:
        high = (reg >> 8) & 0xFF
        low = reg & 0xFF

        pair = (low, high) if order == "low-high" else (high, low)
        for byte in pair:
            if byte == 0x00:
                return "".join(chars).strip()
            chars.append(chr(byte))

    return "".join(chars).strip()


def _text_readability_score(text: str) -> int:
    if not text:
        return 0

    readable = sum(ch.isalnum() or ch in " -_./" for ch in text)
    return readable * 10 - abs(len(text) - len(text.strip()))


def decode_string_registers(registers: list[int]) -> str | None:
    """
    Decode string register dengan byte-order yang bisa dikonfigurasi:
    - auto: pilih decoding paling readable antara low-high vs high-low
    - low-high / high-low: pakai urutan eksplisit
    """
    if not registers:
        return None

    if STRING_BYTE_ORDER in {"low-high", "high-low"}:
        text = _decode_text_by_order(registers, STRING_BYTE_ORDER)
        return text if text else None

    low_high = _decode_text_by_order(registers, "low-high")
    high_low = _decode_text_by_order(registers, "high-low")

    picked = low_high if _text_readability_score(low_high) >= _text_readability_score(high_low) else high_low
    return picked if picked else None


def log_sensor_register_snapshot(
    client: ModbusTcpClient,
    regs: dict,
    unit_id: int,
    func: str,
    context: str,
) -> None:
    """Log nilai register mentah (unsigned/signed) untuk bantu diagnosis data outlier."""
    for key in [
        "temp",
        "hum",
        "calibrate_temp",
        "calibrate_hum",
        "over_temp",
        "under_temp",
        "over_hum",
        "under_hum",
    ]:
        address = regs.get(key)
        if address is None:
            continue

        try:
            raw_unsigned = read_data_register(client, address, unit_id, func, signed=False)
            raw_signed = read_data_register(client, address, unit_id, func, signed=True)
            log.warning(
                "RAW REG SNAPSHOT %s field=%s addr=%d unsigned=%.0f signed=%.0f",
                context,
                key,
                address,
                raw_unsigned,
                raw_signed,
            )
        except (ModbusException, OSError):
            log.warning(
                "RAW REG SNAPSHOT %s field=%s addr=%d read-failed",
                context,
                key,
                address,
            )


# ─── Alarm Computation ────────────────────────────────────────────────────────

def compute_alarms(
    temp: float,
    hum: float,
    over_temp: float,
    under_temp: float,
    over_hum: float,
    under_hum: float,
    alarm_temp_coil: bool | None,
    alarm_hum_coil: bool | None,
    alarm_disconnect: bool | None,
) -> dict:
    """
    Hitung 3 alarm boolean + status final.

    Prioritas:
    1. Disconnect → langsung OFFLINE, reset alarm lain ke False
    2. Coil HMI   → pakai jika berhasil dibaca (native alarm dari HMI)
    3. Fallback   → inferensi dari nilai vs threshold HMI jika coil gagal

    Threshold bawah (under) ikut dievaluasi karena tersedia dari HMI.
    Status CRITICAL jika temp/hum melebihi 2x batas atas.
    """
    if alarm_disconnect:
        return {
            "alarm_temp":       False,
            "alarm_hum":        False,
            "alarm_disconnect": True,
            "status":           "OFFLINE",
        }

    threshold_alarm_temp = temp > over_temp or temp < under_temp
    threshold_alarm_hum  = hum  > over_hum  or hum  < under_hum

    # Gunakan OR antara coil dan threshold agar mismatch pembacaan coil
    # tidak menutupi alarm real dari nilai sensor.
    final_alarm_temp = threshold_alarm_temp if alarm_temp_coil is None \
                       else (alarm_temp_coil or threshold_alarm_temp)
    final_alarm_hum  = threshold_alarm_hum if alarm_hum_coil is None \
                       else (alarm_hum_coil or threshold_alarm_hum)

    if temp > over_temp * 2 or hum > over_hum * 2:
        status = "CRITICAL"
    elif final_alarm_temp or final_alarm_hum:
        status = "WARNING"
    else:
        status = "NORMAL"

    return {
        "alarm_temp":       final_alarm_temp,
        "alarm_hum":        final_alarm_hum,
        "alarm_disconnect": False,
        "status":           status,
    }


# ─── Database Helpers ─────────────────────────────────────────────────────────

def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def load_hmis(cursor) -> list[dict]:
    """
    Load HMI aktif + preview + sensor dari DB.

    Query mencakup is_active=TRUE dan is_preview=TRUE agar HMI
    dalam mode preview tetap dibaca poller untuk keperluan UI preview.
    ORDER BY sensors.id ASC menjamin posisi konsisten dengan Device_1..4 di HMI.
    """
    cursor.execute("""
        SELECT
            h.id               AS hmi_id,
            h.ip_address,
            h.port,
            h.register_function,
            h.is_preview,
            h.room_id
        FROM hmis h
        WHERE h.is_active IS TRUE
           OR h.is_preview IS TRUE
    """)
    rows = cursor.fetchall()
    if not rows:
        return []

    hmis: dict[int, dict] = {
        row[0]: {
            "hmi_id":            row[0],
            "ip_address":        row[1],
            "port":              row[2],
            "register_function": row[3] or "04",
            "is_preview":        row[4],
            "room_id":           row[5],
            "sensors":           [],
        }
        for row in rows
    }

    placeholders = ", ".join(["%s"] * len(hmis))
    cursor.execute(
        f"""
        SELECT id, hmi_id, name, unit_id
        FROM sensors
        WHERE hmi_id IN ({placeholders})
        ORDER BY id ASC
        """,
        list(hmis.keys()),
    )
    for sensor_id, hmi_id, sensor_name, unit_id in cursor.fetchall():
        position = len(hmis[hmi_id]["sensors"]) + 1
        hmis[hmi_id]["sensors"].append({
            "sensor_id": sensor_id,
            "name":      sensor_name,
            "unit_id":   unit_id,
            "position":  position,
        })

    return [h for h in hmis.values() if h["sensors"]]


def upsert_sensor_data(cursor, rows: list[tuple]) -> None:
    """Bulk UPSERT ke sensor_latest_data — 1 query untuk semua sensor dalam 1 HMI."""
    cursor.executemany(
        """
        INSERT INTO sensor_latest_data
            (sensor_id, temperature, humidity, status,
             alarm_temp, alarm_hum, alarm_disconnect,
             calibrate_temp, calibrate_hum,
             last_read_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (sensor_id) DO UPDATE SET
            temperature      = EXCLUDED.temperature,
            humidity         = EXCLUDED.humidity,
            status           = EXCLUDED.status,
            alarm_temp       = EXCLUDED.alarm_temp,
            alarm_hum        = EXCLUDED.alarm_hum,
            alarm_disconnect = EXCLUDED.alarm_disconnect,
            calibrate_temp   = EXCLUDED.calibrate_temp,
            calibrate_hum    = EXCLUDED.calibrate_hum,
            last_read_at     = EXCLUDED.last_read_at,
            updated_at       = EXCLUDED.updated_at
        """,
        rows,
    )


def upsert_hmi_average(
    cursor, hmi_id: int, avg_temp: float, avg_hum: float, now
) -> None:
    """
    UPSERT average suhu/hum dari HMI ke tabel hmi_latest_data.
    Dipakai sebagai cross-check terhadap kalkulasi rata-rata di Laravel.
    """
    cursor.execute(
        """
        INSERT INTO hmi_latest_data
            (hmi_id, avg_temp, avg_hum, last_read_at, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (hmi_id) DO UPDATE SET
            avg_temp     = EXCLUDED.avg_temp,
            avg_hum      = EXCLUDED.avg_hum,
            last_read_at = EXCLUDED.last_read_at,
            updated_at   = EXCLUDED.updated_at
        """,
        (hmi_id, avg_temp, avg_hum, now, now),
    )


def sync_room_info(
    cursor, room_id: int, name: str | None, detail: str | None
) -> None:
    """
    Sync nama dan detail ruangan dari HMI ke tabel rooms.
    HMI adalah sumber kebenaran utama — DB mengikuti HMI setiap siklus.
    Hanya update field yang tidak None dan tidak kosong.
    """
    fields, values = [], []
    if name:
        fields.append("name = %s")
        values.append(name)
    if detail:
        fields.append("location = %s")
        values.append(detail)
    if not fields:
        return
    values.append(room_id)
    cursor.execute(
        f"UPDATE rooms SET {', '.join(fields)} WHERE id = %s",
        values,
    )


def sync_sensor_name(cursor, sensor_id: int, name: str) -> None:
    """
    Sync nama sensor dari HMI ke tabel sensors.
    HMI adalah sumber kebenaran utama — nama di DB selalu mengikuti HMI.
    Perubahan nama harus dilakukan dari HMI, bukan dari dashboard.
    """
    cursor.execute(
        "UPDATE sensors SET name = %s WHERE id = %s",
        (name, sensor_id),
    )


def sync_alarm_events(
    cursor,
    sensor_id: int,
    now,
    temperature: float | None,
    humidity: float | None,
    over_temp: float | None,
    under_temp: float | None,
    over_hum: float | None,
    under_hum: float | None,
    alarm_temp: bool,
    alarm_hum: bool,
    alarm_disconnect: bool,
) -> None:
    """
    Sinkron event alarm historis per sensor.
    - Satu event aktif per kombinasi sensor_id + alarm_type.
    - Saat alarm masih aktif: update current_value + updated_at.
    - Saat alarm nonaktif: tutup event aktif via cleared_at.
    """
    temp_high_active = bool(
        alarm_temp
        and temperature is not None
        and over_temp is not None
        and temperature > over_temp
    )
    temp_low_active = bool(
        alarm_temp
        and temperature is not None
        and under_temp is not None
        and temperature < under_temp
    )
    hum_high_active = bool(
        alarm_hum
        and humidity is not None
        and over_hum is not None
        and humidity > over_hum
    )
    hum_low_active = bool(
        alarm_hum
        and humidity is not None
        and under_hum is not None
        and humidity < under_hum
    )

    # Guard untuk data coil=true tetapi nilai tepat di boundary.
    if alarm_temp and not temp_high_active and not temp_low_active:
        if temperature is not None and over_temp is not None and temperature >= over_temp:
            temp_high_active = True
        elif temperature is not None and under_temp is not None:
            temp_low_active = True

    if alarm_hum and not hum_high_active and not hum_low_active:
        if humidity is not None and over_hum is not None and humidity >= over_hum:
            hum_high_active = True
        elif humidity is not None and under_hum is not None:
            hum_low_active = True

    desired_states = {
        "temp_high": (temp_high_active, temperature),
        "temp_low": (temp_low_active, temperature),
        "hum_high": (hum_high_active, humidity),
        "hum_low": (hum_low_active, humidity),
        "disconnect": (alarm_disconnect, 0.0 if alarm_disconnect else 1.0),
    }

    for alarm_type, (is_active, current_value) in desired_states.items():
        if is_active:
            cursor.execute(
                """
                SELECT id
                FROM alarm_events
                WHERE sensor_id = %s
                  AND alarm_type = %s
                  AND cleared_at IS NULL
                ORDER BY id DESC
                LIMIT 1
                """,
                (sensor_id, alarm_type),
            )
            row = cursor.fetchone()

            if row:
                cursor.execute(
                    """
                    UPDATE alarm_events
                    SET current_value = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (current_value, now, row[0]),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO alarm_events
                        (sensor_id, alarm_type, current_value, occurred_at, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (sensor_id, alarm_type, current_value, now, now, now),
                )
        else:
            cursor.execute(
                """
                UPDATE alarm_events
                SET cleared_at = %s,
                    updated_at = %s
                WHERE sensor_id = %s
                  AND alarm_type = %s
                  AND cleared_at IS NULL
                """,
                (now, now, sensor_id, alarm_type),
            )

    # Tutup event legacy yang memakai tipe lama temp/hum.
    cursor.execute(
        """
        UPDATE alarm_events
        SET cleared_at = %s,
            updated_at = %s
        WHERE sensor_id = %s
          AND alarm_type IN ('temp', 'hum')
          AND cleared_at IS NULL
        """,
        (now, now, sensor_id),
    )


def mark_hmi_offline_alarm_events(cursor, hmi_id: int, now) -> None:
    """
    Saat koneksi HMI putus total:
    - tutup event temp/hum yang masih aktif
    - buka/pertahankan disconnect event aktif untuk semua sensor di HMI ini
    """
    cursor.execute(
        """
        UPDATE alarm_events ae
        SET cleared_at = %s,
            updated_at = %s
        FROM sensors s
        WHERE ae.sensor_id = s.id
          AND s.hmi_id = %s
                    AND ae.alarm_type IN ('temp', 'hum', 'temp_high', 'temp_low', 'hum_high', 'hum_low')
          AND ae.cleared_at IS NULL
        """,
        (now, now, hmi_id),
    )

    cursor.execute(
        """
        INSERT INTO alarm_events
            (sensor_id, alarm_type, current_value, occurred_at, created_at, updated_at)
        SELECT s.id, 'disconnect', 0, %s, %s, %s
        FROM sensors s
        WHERE s.hmi_id = %s
          AND NOT EXISTS (
              SELECT 1
              FROM alarm_events ae
              WHERE ae.sensor_id = s.id
                AND ae.alarm_type = 'disconnect'
                AND ae.cleared_at IS NULL
          )
        """,
        (now, now, now, hmi_id),
    )

    cursor.execute(
        """
        UPDATE alarm_events ae
        SET current_value = 0,
            updated_at = %s
        FROM sensors s
        WHERE ae.sensor_id = s.id
          AND s.hmi_id = %s
          AND ae.alarm_type = 'disconnect'
          AND ae.cleared_at IS NULL
        """,
        (now, hmi_id),
    )


def mark_hmi_offline(cursor, hmi_id: int, now) -> None:
    """
    Bulk UPDATE semua sensor HMI ini ke OFFLINE.
    Skip sensor yang sudah OFFLINE untuk mencegah write-amplification.
    Reset alarm_temp/hum ke FALSE — nilai lama tidak valid saat disconnect.
    """
    cursor.execute(
        """
        UPDATE sensor_latest_data sld
        SET status           = 'OFFLINE',
            alarm_disconnect = TRUE,
            alarm_temp       = FALSE,
            alarm_hum        = FALSE,
            updated_at       = %s
        FROM sensors s
        WHERE s.id     = sld.sensor_id
          AND s.hmi_id = %s
          AND sld.status != 'OFFLINE'
        """,
        (now, hmi_id),
    )


# ─── Modbus Helpers ───────────────────────────────────────────────────────────

def read_data_register(
    client: ModbusTcpClient,
    address: int,
    unit_id: int,
    func: str = "04",
    signed: bool = False,
) -> float:
    """
    Baca 1 data register dari HMI.
    func='04' → FC04 Input Register (default Haiwell D4)
    func='03' → FC03 Holding Register
    Nilai sudah dalam satuan aktual — tidak perlu scaling.
    Raise ModbusException jika gagal → sensor OFFLINE di poll_hmi().
    """
    last_error: Exception | None = None
    format_mode = NUMERIC_REGISTER_FORMAT if NUMERIC_REGISTER_FORMAT in {
        "auto", "int16", "float32"
    } else "auto"

    for candidate_func in get_numeric_func_candidates(func):
        for candidate_address in get_numeric_address_candidates(address):
            if format_mode in {"auto", "float32"}:
                try:
                    registers = read_register_block(
                        client,
                        candidate_address,
                        2,
                        unit_id,
                        candidate_func,
                    )

                    float_value = pick_float32_value(registers[0], registers[1])
                    if float_value is None:
                        last_error = ValueError(
                            f"Float32 decode gagal untuk addr {candidate_address}"
                        )
                        continue

                    if DEBUG_RAW_REGISTERS and (
                        candidate_func != func or candidate_address != address
                    ):
                        log.warning(
                            "NUMERIC fallback dipakai unit_id=%d addr=%d->%d fc=%s->%s mode=float32",
                            unit_id,
                            address,
                            candidate_address,
                            func,
                            candidate_func,
                        )

                    return float(float_value)
                except (ModbusException, OSError, struct.error, ValueError) as exc:
                    last_error = exc

            try:
                if format_mode in {"auto", "int16"}:
                    registers = read_register_block(
                        client,
                        candidate_address,
                        1,
                        unit_id,
                        candidate_func,
                    )
                    raw = registers[0]
                    if signed and raw >= 0x8000:
                        raw -= 0x10000

                    int16_value = float(raw)

                    # Untuk mode auto: pakai int16 hanya jika nilainya masuk range DECIMAL.
                    if format_mode == "int16" or not signed or (
                        DECIMAL_MIN <= int16_value <= DECIMAL_MAX
                    ):
                        if DEBUG_RAW_REGISTERS and (
                            candidate_func != func or candidate_address != address
                        ):
                            log.warning(
                                "NUMERIC fallback dipakai unit_id=%d addr=%d->%d fc=%s->%s mode=int16",
                                unit_id,
                                address,
                                candidate_address,
                                func,
                                candidate_func,
                            )
                        return int16_value
            except (ModbusException, OSError) as exc:
                last_error = exc

    raise ModbusException(
        "Slave "
        f"{unit_id} register {address} gagal dibaca numerik "
        f"(func candidates={get_numeric_func_candidates(func)} "
        f"offsets={NUMERIC_ADDRESS_OFFSETS} format={format_mode})"
    ) from last_error


def read_string_register(
    client: ModbusTcpClient,
    address: int,
    unit_id: int,
    func: str = "04",
    count: int = STRING_REGISTER_COUNT,
) -> str | None:
    """
    Baca string dari holding register Haiwell D4.

    Format: ASCII 2 karakter per register (16-bit).
    Pada perangkat Haiwell di lapangan ini, urutan byte efektif
    terbaca low-byte lalu high-byte per register.
    String diakhiri null byte (0x00) atau habis register.
    Max karakter = count * 2 (default: 8 register = 16 karakter).

    Return string yang sudah di-strip, atau None jika gagal/kosong.
    """
    try:
        for candidate in get_func_candidates(func):
            if candidate == "03":
                result = client.read_holding_registers(
                    address=address, count=count, device_id=unit_id
                )
            elif candidate == "04":
                result = client.read_input_registers(
                    address=address, count=count, device_id=unit_id
                )
            else:
                continue

            if result.isError():
                continue

            if candidate != func and DEBUG_RAW_REGISTERS:
                log.warning(
                    "FC fallback string dipakai untuk unit_id=%d addr=%d: primary=%s -> used=%s",
                    unit_id,
                    address,
                    func,
                    candidate,
                )

            text = decode_string_registers(result.registers)
            if text:
                return text

        return None

    except (ModbusException, OSError):
        return None


def read_coil(
    client: ModbusTcpClient,
    address: int,
    unit_id: int,
) -> bool | None:
    """
    Baca 1 coil dari HMI via FC01 read_coils().
    Haiwell alamat coil 1-based, pymodbus 0-based — wajib address - 1.
    Return None jika gagal — alarm fallback ke inferensi threshold.
    """
    try:
        result = client.read_coils(
            address=address - 1, count=1, device_id=unit_id
        )
        if result.isError():
            return None
        return bool(result.bits[0])
    except (ModbusException, OSError):
        return None


def read_coils_snapshot(
    client: ModbusTcpClient,
    start_address: int,
    end_address: int,
    unit_id: int,
) -> dict[int, bool] | None:
    """
    Baca snapshot coil dalam satu request FC01.
    Return map alamat coil 1-based -> bool.
    Return None jika gagal.
    """
    if end_address < start_address:
        return None

    try:
        count = end_address - start_address + 1
        result = client.read_coils(
            address=start_address - 1,
            count=count,
            device_id=unit_id,
        )

        if result.isError():
            return None

        return {
            coil_address: bool(result.bits[index])
            for index, coil_address in enumerate(range(start_address, end_address + 1))
        }
    except (ModbusException, OSError):
        return None




def scan_registers(
    client: ModbusTcpClient,
    start: int,
    count: int,
    unit_id: int,
    func: str,
    label: str,
) -> None:
    """
    Scan dan print nilai mentah register dalam range tertentu.
    Dipakai untuk diagnosa alamat register yang tidak diketahui.
    Aktif hanya jika DIAGNOSTIC_SCAN=true di .env.
    """
    try:
        if func == "04":
            result = client.read_input_registers(
                address=start, count=count, device_id=unit_id
            )
        elif func == "03":
            result = client.read_holding_registers(
                address=start, count=count, device_id=unit_id
            )
        else:
            # Fallback to input registers if func is neither "03" nor "04"
            result = client.read_input_registers(
                address=start, count=count, device_id=unit_id
            )
        if result.isError():
            log.warning("SCAN %s unit_id=%d addr=%d-%d ERROR", label, unit_id, start, start+count-1)
            return

        import struct
        log.warning("=== SCAN %s unit_id=%d addr=%d-%d ===", label, unit_id, start, start+count-1)
        for i, raw in enumerate(result.registers):
            addr = start + i
            signed = raw - 0x10000 if raw >= 0x8000 else raw
            # Coba decode sebagai 2 char ASCII
            hi = (raw >> 8) & 0xFF
            lo = raw & 0xFF
            ch_be = f"{chr(hi) if 32<=hi<127 else '.'}{chr(lo) if 32<=lo<127 else '.'}"
            ch_le = f"{chr(lo) if 32<=lo<127 else '.'}{chr(hi) if 32<=hi<127 else '.'}"
            # Coba decode sebagai float32 dengan register berikutnya
            float_val = None
            if i + 1 < len(result.registers):
                try:
                    packed = struct.pack('>HH', raw, result.registers[i+1])
                    float_val = struct.unpack('>f', packed)[0]
                    if not (-999 < float_val < 9999):
                        float_val = None
                except:
                    pass
            float_str = f" | float32={float_val:.2f}" if float_val is not None else ""
            log.warning(
                "  addr=%d raw=%d signed=%d hex=0x%04X be='%s' le='%s'%s",
                addr, raw, signed, raw, ch_be, ch_le, float_str,
            )
    except (ModbusException, OSError) as exc:
        log.warning("SCAN %s FAILED — %s", label, exc)

# ─── Modbus Polling ───────────────────────────────────────────────────────────

def poll_hmi(hmi: dict, cursor, now) -> None:
    """
    Poll 1 HMI: baca semua data dari register HMI.

    Data yang dibaca per siklus:
    - HMI-level : avg_temp, avg_hum, room_name, room_detail
    - Per sensor : name, temp, hum, calibrate_temp, calibrate_hum,
                   over_temp, under_temp, over_hum, under_hum,
                   alarm coil (temp, hum, connection)

    Sync nama sensor dan room ke DB jika berubah dari HMI.
    Sukses → UPSERT. Gagal connect → mark semua sensor OFFLINE.
    """
    func = hmi["register_function"]

    client = ModbusTcpClient(
        host=hmi["ip_address"],
        port=hmi["port"],
        timeout=MODBUS_TIMEOUT,
    )
    try:
        if not client.connect():
            raise ConnectionException(
                f"Cannot connect to {hmi['ip_address']}:{hmi['port']}"
            )

        # ── Data HMI-level ─────────────────────────────────────────────────

        # Diagnostic scan — aktif jika DIAGNOSTIC_SCAN=true di .env
        # Scan register 1-120 per unit_id untuk temukan lokasi nilai suhu aktual
        if DIAGNOSTIC_SCAN:
            for scan_uid in range(1, 5):
                scan_registers(client, 1, 120, scan_uid, func,
                               f"unit_id={scan_uid}")

        # Average suhu/hum dari HMI (cross-check terhadap kalkulasi Laravel)
        try:
            avg_temp = read_data_register(
                client, HMI_REGISTERS["avg_temp"], 1, func, signed=True
            )
            avg_hum = read_data_register(
                client, HMI_REGISTERS["avg_hum"], 1, func, signed=True
            )

            avg_temp = normalize_decimal_5_2(
                avg_temp, "avg_temp", f"hmi_id={hmi['hmi_id']}"
            )
            avg_hum = normalize_decimal_5_2(
                avg_hum, "avg_hum", f"hmi_id={hmi['hmi_id']}"
            )
            upsert_hmi_average(cursor, hmi["hmi_id"], avg_temp, avg_hum, now)
        except (ModbusException, OSError, ValueError) as exc:
            log.warning(
                "HMI %d (%s) gagal baca average — %s",
                hmi["hmi_id"], hmi["ip_address"], exc,
            )

        # Nama dan detail room — sync ke DB jika berubah dari HMI
        room_name   = read_string_register(client, HMI_REGISTERS["room_name"],   1, func)
        room_detail = read_string_register(client, HMI_REGISTERS["room_detail"], 1, func)
        if room_name or room_detail:
            sync_room_info(cursor, hmi["room_id"], room_name, room_detail)
            log.debug(
                "HMI %d room sync — name='%s' detail='%s'",
                hmi["hmi_id"], room_name, room_detail,
            )
        elif DEBUG_RAW_REGISTERS:
            log.warning(
                "HMI %d room register kosong/tidak terbaca (addr_name=%d addr_detail=%d)",
                hmi["hmi_id"],
                HMI_REGISTERS["room_name"],
                HMI_REGISTERS["room_detail"],
            )

        # ── Snapshot coil untuk seluruh alarm/connection ────────────────────
        # Menghindari mismatch antar pembacaan coil satu-per-satu.
        all_coils_snapshot = read_coils_snapshot(client, 1, 14, 1)

        # Jika snapshot gagal, fallback ke pembacaan coil tunggal seperti sebelumnya.
        if all_coils_snapshot is not None:
            alarm_enabled = all_coils_snapshot.get(COIL_ALARM_STATUS)
            connection_enabled = all_coils_snapshot.get(COIL_CONNECTION_STATUS)

            if DEBUG_RAW_REGISTERS:
                log.warning(
                    "COIL SNAPSHOT hmi_id=%d addr1..14=%s",
                    hmi["hmi_id"],
                    ", ".join(
                        f"{addr}:{int(val)}" for addr, val in all_coils_snapshot.items()
                    ),
                )
        else:
            alarm_enabled = read_coil(client, COIL_ALARM_STATUS, 1)
            connection_enabled = read_coil(client, COIL_CONNECTION_STATUS, 1)

        # ── Data per sensor ─────────────────────────────────────────────────
        ok_rows     = []
        offline_ids = []

        for sensor in hmi["sensors"]:
            # Semua Device_1..4 register ada di SATU slave HMI Haiwell D4.
            # unit_id di DB dipakai untuk identifikasi sensor, bukan Modbus slave.
            # Slave ID selalu 1 karena HMI mengekspos semua sensor di satu slave.
            unit_id  = 1
            position = sensor["position"]
            regs     = SENSOR_MAP.get(position)
            coils    = COIL_MAP.get(position)

            if regs is None:
                log.warning(
                    "HMI %d sensor '%s' posisi %d tidak ada di SENSOR_MAP — skip",
                    hmi["hmi_id"], sensor["name"], position,
                )
                continue

            try:
                # ── Nama sensor dari HMI — sync ke DB jika berubah ──
                sensor_name_hmi = read_string_register(
                    client, regs["name"], unit_id, func
                )
                if sensor_name_hmi and sensor_name_hmi.strip() and sensor_name_hmi != sensor["name"]:
                    sync_sensor_name(cursor, sensor["sensor_id"], sensor_name_hmi)
                    log.info(
                        "HMI %d sensor pos=%d nama diperbarui: '%s' → '%s'",
                        hmi["hmi_id"], position, sensor["name"], sensor_name_hmi,
                    )
                    sensor["name"] = sensor_name_hmi  # update local cache

                # ── Suhu & hum aktual ──
                temp = read_data_register(
                    client, regs["temp"], unit_id, func, signed=True
                )
                hum = read_data_register(
                    client, regs["hum"], unit_id, func, signed=True
                )

                # ── Kalibrasi ──
                calibrate_temp = read_data_register(
                    client, regs["calibrate_temp"], unit_id, func, signed=True
                )
                calibrate_hum = read_data_register(
                    client, regs["calibrate_hum"], unit_id, func, signed=True
                )

                # ── Threshold ──
                over_temp = read_data_register(
                    client, regs["over_temp"], unit_id, func, signed=True
                )
                under_temp = read_data_register(
                    client, regs["under_temp"], unit_id, func, signed=True
                )
                over_hum = read_data_register(
                    client, regs["over_hum"], unit_id, func, signed=True
                )
                under_hum = read_data_register(
                    client, regs["under_hum"], unit_id, func, signed=True
                )

                context = (
                    f"hmi_id={hmi['hmi_id']} sensor_id={sensor['sensor_id']} "
                    f"pos={position} unit_id={unit_id}"
                )

                if DEBUG_RAW_REGISTERS:
                    log.warning(
                        "RAW SENSOR %s temp_raw=%d temp_signed=%.0f "
                        "hum_raw=%d hum_signed=%.0f cal_t_raw=%d cal_t_signed=%.0f "
                        "cal_h_raw=%d cal_h_signed=%.0f",
                        context,
                        signed_to_raw_word(temp),
                        temp,
                        signed_to_raw_word(hum),
                        hum,
                        signed_to_raw_word(calibrate_temp),
                        calibrate_temp,
                        signed_to_raw_word(calibrate_hum),
                        calibrate_hum,
                    )

                temp = normalize_decimal_5_2(temp, "temperature", context)
                hum = normalize_decimal_5_2(hum, "humidity", context)
                calibrate_temp = normalize_decimal_5_2(
                    calibrate_temp, "calibrate_temp", context
                )
                calibrate_hum = normalize_decimal_5_2(
                    calibrate_hum, "calibrate_hum", context
                )

                # ── Coil alarm ──
                alarm_temp_coil = None
                alarm_hum_coil = None
                if coils and alarm_enabled:
                    if all_coils_snapshot is not None:
                        alarm_temp_coil = all_coils_snapshot.get(coils["alarm_temp"])
                        alarm_hum_coil = all_coils_snapshot.get(coils["alarm_hum"])
                    else:
                        alarm_temp_coil = read_coil(client, coils["alarm_temp"], unit_id)
                        alarm_hum_coil = read_coil(client, coils["alarm_hum"], unit_id)

                # ── Coil connection ──
                connected = None
                if coils and connection_enabled:
                    if all_coils_snapshot is not None:
                        connected = all_coils_snapshot.get(coils["connection"])
                    else:
                        connected = read_coil(client, coils["connection"], unit_id)
                # Invert: coil True = connected → alarm_disconnect True = terputus
                alarm_disconnect = (not connected) if connected is not None else None

                alarms = compute_alarms(
                    temp, hum,
                    over_temp, under_temp,
                    over_hum, under_hum,
                    alarm_temp_coil, alarm_hum_coil,
                    alarm_disconnect,
                )

                ok_rows.append((
                    sensor["sensor_id"],
                    temp,
                    hum,
                    alarms["status"],
                    alarms["alarm_temp"],
                    alarms["alarm_hum"],
                    alarms["alarm_disconnect"],
                    calibrate_temp,
                    calibrate_hum,
                    now,
                    now,
                ))

                sync_alarm_events(
                    cursor,
                    sensor_id=sensor["sensor_id"],
                    now=now,
                    temperature=temp,
                    humidity=hum,
                    over_temp=over_temp,
                    under_temp=under_temp,
                    over_hum=over_hum,
                    under_hum=under_hum,
                    alarm_temp=alarms["alarm_temp"],
                    alarm_hum=alarms["alarm_hum"],
                    alarm_disconnect=alarms["alarm_disconnect"],
                )

                log.debug(
                    "HMI %d sensor '%s' (pos=%d) — "
                    "temp=%.1f hum=%.1f cal_t=%.2f cal_h=%.2f | "
                    "over_t=%.1f under_t=%.1f over_h=%.1f under_h=%.1f | "
                    "alarm_temp=%s alarm_hum=%s disconnect=%s status=%s",
                    hmi["hmi_id"], sensor["name"], position,
                    temp, hum, calibrate_temp, calibrate_hum,
                    over_temp, under_temp, over_hum, under_hum,
                    alarms["alarm_temp"], alarms["alarm_hum"],
                    alarms["alarm_disconnect"], alarms["status"],
                )

            except (ModbusException, OSError, ValueError) as exc:
                log.warning(
                    "HMI %d sensor '%s' (pos=%d unit_id=%d) OFFLINE — %s",
                    hmi["hmi_id"], sensor["name"], position, unit_id, exc,
                )
                if DEBUG_RAW_REGISTERS and isinstance(exc, ValueError):
                    context = (
                        f"hmi_id={hmi['hmi_id']} sensor_id={sensor['sensor_id']} "
                        f"pos={position} unit_id={unit_id}"
                    )
                    log_sensor_register_snapshot(client, regs, unit_id, func, context)
                offline_ids.append(sensor["sensor_id"])

        if ok_rows:
            upsert_sensor_data(cursor, ok_rows)

        if offline_ids:
            offline_rows = [
                (
                    sensor_id,
                    None,
                    None,
                    'OFFLINE',
                    False,
                    False,
                    True,
                    None,
                    None,
                    now,
                    now,
                )
                for sensor_id in offline_ids
            ]
            upsert_sensor_data(cursor, offline_rows)

            for sensor_id in offline_ids:
                sync_alarm_events(
                    cursor,
                    sensor_id=sensor_id,
                    now=now,
                    temperature=None,
                    humidity=None,
                    over_temp=None,
                    under_temp=None,
                    over_hum=None,
                    under_hum=None,
                    alarm_temp=False,
                    alarm_hum=False,
                    alarm_disconnect=True,
                )

        preview_label = " [PREVIEW]" if hmi.get("is_preview") else ""
        log.info(
            "HMI %d (%s)%s — %d OK  %d OFFLINE",
            hmi["hmi_id"], hmi["ip_address"], preview_label,
            len(ok_rows), len(offline_ids),
        )

    except (ConnectionException, ModbusException, OSError) as exc:
        log.warning(
            "HMI %d (%s) OFFLINE — %s",
            hmi["hmi_id"], hmi["ip_address"], exc,
        )
        mark_hmi_offline(cursor, hmi["hmi_id"], now)
        mark_hmi_offline_alarm_events(cursor, hmi["hmi_id"], now)

    finally:
        client.close()


# ─── Main Loop ────────────────────────────────────────────────────────────────

def main() -> None:
    log.info(
        "Starting SCADA Modbus poller  (poll_interval=%ss  modbus_timeout=%ss)",
        POLL_INTERVAL, MODBUS_TIMEOUT,
    )

    db = get_connection()
    log.info("PostgreSQL connected → %s/%s", DB_CONFIG["host"], DB_CONFIG["database"])

    try:
        while True:
            try:
                with db.cursor() as cursor:
                    hmis = load_hmis(cursor)

                    if not hmis:
                        log.warning("No active HMIs found — sleeping %ss", POLL_INTERVAL)
                    else:
                        wib = timezone(timedelta(hours=7))
                        now = datetime.now(wib).strftime('%Y-%m-%d %H:%M:%S')

                        for hmi in hmis:
                            poll_hmi(hmi, cursor, now)

                        try:
                            db.commit()
                            log.info("Cycle committed — %d HMI(s)", len(hmis))
                        except psycopg2.Error as exc:
                            db.rollback()
                            log.error(
                                "Commit FAILED, rolled back — %s", exc
                            )

            except psycopg2.OperationalError as exc:
                log.error("PostgreSQL connection lost, reconnecting — %s", exc)
                try:
                    db = get_connection()
                except Exception as e:
                    log.error("Gagal menyambung ulang ke PostgreSQL: %s", e)
            except psycopg2.Error as exc:
                db.rollback()
                log.error("PostgreSQL query error, transaction rolled back — %s", exc)

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        log.info("Poller stopped by user (KeyboardInterrupt)")

    finally:
        db.close()
        log.info("PostgreSQL connection closed")


if __name__ == "__main__":
    main()