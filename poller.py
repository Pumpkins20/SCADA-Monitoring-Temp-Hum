#!/usr/bin/env python3
"""
SCADA Temperature & Humidity Modbus Poller
Reads ALL data (temp, hum, threshold, alarm) from HMI holding registers and coils.
Writes directly to PostgreSQL sensor_latest_data via UPSERT — no HTTP/Laravel calls.
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
    "user":     os.environ.get("DB_USERNAME", "postgres"),
    "password": os.environ.get("DB_PASSWORD", "edutic5758-"),
    "database": os.environ.get("DB_DATABASE", "scada_db"),
}

MODBUS_TIMEOUT = 3   # seconds
POLL_INTERVAL  = 5   # seconds per cycle

# Pola holding register 4X (FC03) — identik untuk semua HMI Haiwell D4.
# Key = posisi sensor dalam HMI (1-based, sesuai urutan id ASC di DB per hmi_id).
# Nilai temp/hum sudah dalam satuan aktual (°C / %RH) — tidak perlu scaling.
# Nilai threshold (over/under) juga dalam satuan aktual dari HMI.
SENSOR_MAP = {
    1: {"temp": 9,  "hum": 11, "over_temp": 17, "under_temp": 19,
        "over_hum": 21, "under_hum": 23},
    2: {"temp": 33, "hum": 35, "over_temp": 41, "under_temp": 43,
        "over_hum": 45, "under_hum": 47},
    3: {"temp": 57, "hum": 59, "over_temp": 65, "under_temp": 67,
        "over_hum": 69, "under_hum": 71},
    4: {"temp": 81, "hum": 83, "over_temp": 89, "under_temp": 91,
        "over_hum": 93, "under_hum": 95},
}

# Pola coil 0X (FC01) — identik untuk semua HMI Haiwell D4.
# Haiwell mendefinisikan alamat coil 1-based — di-offset -1 saat read_coils().
COIL_MAP = {
    1: {"alarm_temp": 1,  "alarm_hum": 2,  "connection": 10},
    2: {"alarm_temp": 3,  "alarm_hum": 4,  "connection": 11},
    3: {"alarm_temp": 5,  "alarm_hum": 6,  "connection": 12},
    4: {"alarm_temp": 7,  "alarm_hum": 8,  "connection": 13},
}

# Coil global — status enable/disable alarm dari HMI
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

    Threshold bawah (under) sekarang ikut dievaluasi karena tersedia dari HMI.
    Status CRITICAL jika temp/hum melebihi 2x batas atas (over_temp/over_hum).
    """
    # Disconnect override semua kondisi lain
    if alarm_disconnect:
        return {
            "alarm_temp":       False,
            "alarm_hum":        False,
            "alarm_disconnect": True,
            "status":           "OFFLINE",
        }

    # Inferensi threshold sebagai fallback — cover batas atas DAN batas bawah
    threshold_alarm_temp = temp > over_temp or temp < under_temp
    threshold_alarm_hum  = hum  > over_hum  or hum  < under_hum

    # Pakai coil HMI jika berhasil dibaca, fallback ke inferensi threshold
    final_alarm_temp = alarm_temp_coil if alarm_temp_coil is not None \
                       else threshold_alarm_temp
    final_alarm_hum  = alarm_hum_coil  if alarm_hum_coil  is not None \
                       else threshold_alarm_hum

    # Status final
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
    Load HMI aktif + sensor dari DB.

    Tidak load threshold dari rooms — threshold dibaca langsung dari register HMI.
    Tidak load modbus_address_temp/hum — alamat dari SENSOR_MAP konstan.
    Hanya butuh: hmi_id, ip_address, port, sensor_id, name, unit_id.
    ORDER BY sensors.id ASC menjamin urutan posisi konsisten dengan Device_1..4 di HMI.
    """
    cursor.execute("""
        SELECT
            h.id         AS hmi_id,
            h.ip_address,
            h.port
        FROM hmis h
        WHERE h.is_active IS TRUE
    """)
    rows = cursor.fetchall()
    if not rows:
        return []

    hmis: dict[int, dict] = {
        row[0]: {
            "hmi_id":     row[0],
            "ip_address": row[1],
            "port":       row[2],
            "sensors":    [],
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
        # Posisi 1-based sesuai urutan DB → key SENSOR_MAP & COIL_MAP
        position = len(hmis[hmi_id]["sensors"]) + 1
        hmis[hmi_id]["sensors"].append({
            "sensor_id": sensor_id,
            "name":      sensor_name,
            "unit_id":   unit_id,
            "position":  position,
        })

    return [h for h in hmis.values() if h["sensors"]]


def upsert_sensor_data(cursor, rows: list[tuple]) -> None:
    """Bulk UPSERT into sensor_latest_data — 1 query untuk semua sensor dalam 1 HMI."""
    cursor.executemany(
        """
        INSERT INTO sensor_latest_data
            (sensor_id, temperature, humidity, status,
             alarm_temp, alarm_hum, alarm_disconnect,
             last_read_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (sensor_id) DO UPDATE SET
            temperature      = EXCLUDED.temperature,
            humidity         = EXCLUDED.humidity,
            status           = EXCLUDED.status,
            alarm_temp       = EXCLUDED.alarm_temp,
            alarm_hum        = EXCLUDED.alarm_hum,
            alarm_disconnect = EXCLUDED.alarm_disconnect,
            last_read_at     = EXCLUDED.last_read_at,
            updated_at       = EXCLUDED.updated_at
        """,
        rows,
    )


def mark_hmi_offline(cursor, hmi_id: int, now) -> None:
    """
    Bulk UPDATE semua sensor pada HMI ini ke OFFLINE.
    Skip sensor yang sudah OFFLINE untuk mencegah write-amplification.
    Reset alarm_temp dan alarm_hum ke FALSE — nilai lama tidak valid saat disconnect.
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
        WHERE s.id = sld.sensor_id
          AND s.hmi_id = %s
          AND sld.status != 'OFFLINE'
        """,
        (now, hmi_id),
    )


# ─── Modbus Helpers ───────────────────────────────────────────────────────────

def read_holding_register(
    client: ModbusTcpClient, address: int, unit_id: int
) -> float:
    """
    Baca 1 holding register dari HMI via FC03 read_holding_registers().
    Dipakai untuk: suhu, hum, over_temp, under_temp, over_hum, under_hum.
    Nilai sudah dalam satuan aktual — tidak perlu scaling.
    Raise ModbusException jika gagal (sensor → OFFLINE di poll_hmi).
    """
    result = client.read_holding_registers(
        address=address, count=1, device_id=unit_id
    )
    if result.isError():
        raise ModbusException(
            f"Slave {unit_id} holding register {address} returned error"
        )
    return float(result.registers[0])


def read_coil(
    client: ModbusTcpClient, address: int, unit_id: int
) -> bool | None:
    """
    Baca 1 coil dari HMI via FC01 read_coils().
    Haiwell mendefinisikan alamat coil 1-based, pymodbus 0-based — wajib address - 1.
    Return None jika gagal — tidak raise, alarm fallback ke inferensi threshold.
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
    Poll 1 HMI: baca semua data dari register HMI (suhu, hum, threshold, alarm).
    Semua data bersumber dari 1 IP HMI — tidak ada koneksi langsung ke sensor fisik.
    Sukses → UPSERT readings. Gagal connect → mark semua sensor OFFLINE.
    """
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

        # Baca status global alarm sekali per HMI
        # Jika disabled, coil alarm tidak dibaca (None → fallback threshold)
        alarm_enabled      = read_coil(client, COIL_ALARM_STATUS,      1)
        connection_enabled = read_coil(client, COIL_CONNECTION_STATUS,  1)

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
                # ── Baca suhu & hum aktual dari holding register HMI ──
                temp = read_holding_register(client, regs["temp"], unit_id)
                hum  = read_holding_register(client, regs["hum"],  unit_id)

                # ── Baca threshold dari holding register HMI ──
                over_temp  = read_holding_register(client, regs["over_temp"],  unit_id)
                under_temp = read_holding_register(client, regs["under_temp"], unit_id)
                over_hum   = read_holding_register(client, regs["over_hum"],   unit_id)
                under_hum  = read_holding_register(client, regs["under_hum"],  unit_id)

                # ── Baca coil alarm (None jika global disabled atau coil gagal) ──
                alarm_temp_coil = (
                    read_coil(client, coils["alarm_temp"], unit_id)
                    if coils and alarm_enabled else None
                )
                alarm_hum_coil = (
                    read_coil(client, coils["alarm_hum"], unit_id)
                    if coils and alarm_enabled else None
                )

                # ── Baca coil connection ──
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
                    now,
                    now,
                ))

                log.debug(
                    "HMI %d sensor '%s' (pos=%d) — "
                    "temp=%.1f hum=%.1f | "
                    "over_temp=%.1f under_temp=%.1f over_hum=%.1f under_hum=%.1f | "
                    "alarm_temp=%s alarm_hum=%s disconnect=%s status=%s",
                    hmi["hmi_id"], sensor["name"], position,
                    temp, hum,
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

        log.info(
            "HMI %d (%s) — %d OK  %d OFFLINE",
            hmi["hmi_id"], hmi["ip_address"], len(ok_rows), len(offline_ids),
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