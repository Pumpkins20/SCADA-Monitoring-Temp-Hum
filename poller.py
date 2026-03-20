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
import os
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

    final_alarm_temp = alarm_temp_coil if alarm_temp_coil is not None \
                       else threshold_alarm_temp
    final_alarm_hum  = alarm_hum_coil  if alarm_hum_coil  is not None \
                       else threshold_alarm_hum

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
            "register_function": row[3] or "03",
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
        (hmi_id, round(avg_temp, 2), round(avg_hum, 2), now, now),
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
    func: str = "03",
) -> float:
    """
    Baca 1 data register dari HMI.
    func='03' → FC03 Holding Register (default Haiwell D4)
    func='04' → FC04 Input Register
    Nilai sudah dalam satuan aktual — tidak perlu scaling.
    Raise ModbusException jika gagal → sensor OFFLINE di poll_hmi().
    """
    if func == "03":
        result = client.read_holding_registers(
            address=address, count=1, device_id=unit_id
        )
    elif func == "04":
        result = client.read_input_registers(
            address=address, count=1, device_id=unit_id
        )
    else:
        raise ModbusException(f"Function code '{func}' tidak didukung")

    if result.isError():
        raise ModbusException(
            f"Slave {unit_id} FC{func} register {address} returned error"
        )
    return float(result.registers[0])


def read_string_register(
    client: ModbusTcpClient,
    address: int,
    unit_id: int,
    func: str = "03",
    count: int = STRING_REGISTER_COUNT,
) -> str | None:
    """
    Baca string dari holding register Haiwell D4.

    Format: big-endian ASCII, 2 karakter per register (16-bit).
    Contoh: register 0x5341 = 'SA', register 0x4E31 = 'N1'
    String diakhiri null byte (0x00) atau habis register.
    Max karakter = count * 2 (default: 8 register = 16 karakter).

    Return string yang sudah di-strip, atau None jika gagal/kosong.
    """
    try:
        if func == "03":
            result = client.read_holding_registers(
                address=address, count=count, device_id=unit_id
            )
        elif func == "04":
            result = client.read_input_registers(
                address=address, count=count, device_id=unit_id
            )
        else:
            return None

        if result.isError():
            return None

        chars = []
        for reg in result.registers:
            high = (reg >> 8) & 0xFF  # byte tinggi (big-endian)
            low  =  reg       & 0xFF  # byte rendah

            if high == 0x00:          # null byte → akhir string
                break
            chars.append(chr(high))

            if low == 0x00:           # null byte → akhir string
                break
            chars.append(chr(low))

        text = ''.join(chars).strip()
        return text if text else None

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

        # Average suhu/hum dari HMI (cross-check terhadap kalkulasi Laravel)
        try:
            avg_temp = read_data_register(client, HMI_REGISTERS["avg_temp"], 1, func)
            avg_hum  = read_data_register(client, HMI_REGISTERS["avg_hum"],  1, func)
            upsert_hmi_average(cursor, hmi["hmi_id"], avg_temp, avg_hum, now)
        except (ModbusException, OSError) as exc:
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

        # ── Status global alarm ─────────────────────────────────────────────
        # Jika disabled, coil alarm tidak dibaca (None → fallback threshold)
        alarm_enabled      = read_coil(client, COIL_ALARM_STATUS,      1)
        connection_enabled = read_coil(client, COIL_CONNECTION_STATUS,  1)

        # ── Data per sensor ─────────────────────────────────────────────────
        ok_rows     = []
        offline_ids = []

        for sensor in hmi["sensors"]:
            unit_id  = sensor["unit_id"]
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
                if sensor_name_hmi and sensor_name_hmi != sensor["name"]:
                    sync_sensor_name(cursor, sensor["sensor_id"], sensor_name_hmi)
                    log.info(
                        "HMI %d sensor pos=%d nama diperbarui: '%s' → '%s'",
                        hmi["hmi_id"], position, sensor["name"], sensor_name_hmi,
                    )
                    sensor["name"] = sensor_name_hmi  # update local cache

                # ── Suhu & hum aktual ──
                temp = read_data_register(client, regs["temp"], unit_id, func)
                hum  = read_data_register(client, regs["hum"],  unit_id, func)

                # ── Kalibrasi ──
                calibrate_temp = read_data_register(client, regs["calibrate_temp"], unit_id, func)
                calibrate_hum  = read_data_register(client, regs["calibrate_hum"],  unit_id, func)

                # ── Threshold ──
                over_temp  = read_data_register(client, regs["over_temp"],  unit_id, func)
                under_temp = read_data_register(client, regs["under_temp"], unit_id, func)
                over_hum   = read_data_register(client, regs["over_hum"],   unit_id, func)
                under_hum  = read_data_register(client, regs["under_hum"],  unit_id, func)

                # ── Coil alarm ──
                alarm_temp_coil = (
                    read_coil(client, coils["alarm_temp"], unit_id)
                    if coils and alarm_enabled else None
                )
                alarm_hum_coil = (
                    read_coil(client, coils["alarm_hum"], unit_id)
                    if coils and alarm_enabled else None
                )

                # ── Coil connection ──
                connected = (
                    read_coil(client, coils["connection"], unit_id)
                    if coils and connection_enabled else None
                )
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
                    round(temp, 2),
                    round(hum, 2),
                    alarms["status"],
                    alarms["alarm_temp"],
                    alarms["alarm_hum"],
                    alarms["alarm_disconnect"],
                    round(calibrate_temp, 2),
                    round(calibrate_hum,  2),
                    now,
                    now,
                ))

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

            except (ModbusException, OSError) as exc:
                log.warning(
                    "HMI %d sensor '%s' (pos=%d unit_id=%d) OFFLINE — %s",
                    hmi["hmi_id"], sensor["name"], position, unit_id, exc,
                )
                offline_ids.append(sensor["sensor_id"])

        if ok_rows:
            upsert_sensor_data(cursor, ok_rows)

        if offline_ids:
            cursor.execute(
                f"""
                UPDATE sensor_latest_data
                SET    status           = 'OFFLINE',
                       alarm_disconnect = TRUE,
                       alarm_temp       = FALSE,
                       alarm_hum        = FALSE,
                       updated_at       = %s
                WHERE  sensor_id IN ({','.join(['%s'] * len(offline_ids))})
                  AND  status != 'OFFLINE'
                """,
                (now, *offline_ids),
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
                        db.commit()

            except psycopg2.OperationalError as exc:
                log.error("PostgreSQL connection lost, reconnecting — %s", exc)
                try:
                    db = get_connection()
                except Exception as e:
                    log.error("Gagal menyambung ulang ke PostgreSQL: %s", e)

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        log.info("Poller stopped by user (KeyboardInterrupt)")

    finally:
        db.close()
        log.info("PostgreSQL connection closed")


if __name__ == "__main__":
    main()