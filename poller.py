#!/usr/bin/env python3
"""
SCADA Temperature & Humidity Modbus Poller
Writes directly to MySQL sensor_latest_data via UPSERT — no HTTP/Laravel calls.
"""

import logging
import os
import sys
import time
# from datetime import datetime
from datetime import datetime, timedelta, timezone

import psycopg2
# import psycopg2.extras
from dotenv import load_dotenv
from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ConnectionException, ModbusException

# ─── Configuration ────────────────────────────────────────────────────────────

load_dotenv()

DB_CONFIG: dict = {
    "host":     os.environ.get("DB_HOST", "127.0.0.1"),
    "port":     int(os.environ.get("DB_PORT", 3306)),
    "user":     os.environ.get("DB_USERNAME", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_DATABASE", "scada_db"),
    # "charset":  "utf8mb4",
}

MODBUS_TIMEOUT = 3      # seconds — per OFFLINE rule in BACKEND-PLAN.md
POLL_INTERVAL  = 5      # seconds per cycle
REGISTER_SCALE = 10.0   # Haiwell stores tenths: 245 → 24.5 °C / 65 → 65.0 %RH

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


# ─── Status Computation ───────────────────────────────────────────────────────

def compute_status(temp: float, hum: float, temp_limit: float, hum_limit: float) -> str:
    """
    Return NORMAL / WARNING / CRITICAL based on room thresholds.
      NORMAL   — both values within limit
      WARNING  — any value exceeds limit
      CRITICAL — any value exceeds 2x limit
    """
    if temp > temp_limit * 2 or hum > hum_limit * 2:
        return "CRITICAL"
    if temp > temp_limit or hum > hum_limit:
        return "WARNING"
    return "NORMAL"


# ─── Database Helpers ─────────────────────────────────────────────────────────

# def get_connection() -> pymysql.Connection:
#     return pymysql.connect(**DB_CONFIG, cursorclass=pymysql.cursors.Cursor)

def get_connection():
    return psycopg2.connect(**DB_CONFIG)

def load_hmis(cursor) -> list[dict]:
    """
    Load all active HMIs with their sensors and room thresholds.
    Returns a list of HMI dicts ready for polling.
    """
    cursor.execute("""
        SELECT
            h.id            AS hmi_id,
            h.ip_address,
            h.port,
            r.temp_max_limit,
            r.hum_max_limit
        FROM hmis h
        JOIN rooms r ON r.id = h.room_id
        WHERE h.is_active = 1
    """)
    rows = cursor.fetchall()
    if not rows:
        return []

    hmis: dict[int, dict] = {
        row[0]: {
            "hmi_id":         row[0],
            "ip_address":     row[1],
            "port":           row[2],
            "temp_max_limit": float(row[3]),
            "hum_max_limit":  float(row[4]),
            "sensors":        [],
        }
        for row in rows
    }

    placeholders = ", ".join(["%s"] * len(hmis))
    cursor.execute(
        f"""
        SELECT id, hmi_id, name, modbus_address_temp, modbus_address_hum, unit_id
        FROM sensors
        WHERE hmi_id IN ({placeholders})
        """,
        list(hmis.keys()),
    )
    for sensor_id, hmi_id, sensor_name, addr_temp, addr_hum, unit_id in cursor.fetchall():
        hmis[hmi_id]["sensors"].append({
            "sensor_id": sensor_id,
            "name":      sensor_name,
            "addr_temp":  addr_temp,
            "addr_hum":   addr_hum,
            "unit_id":    unit_id,
        })

    # Only return HMIs that have at least one sensor
    return [h for h in hmis.values() if h["sensors"]]


def upsert_sensor_data(cursor, rows: list[tuple]) -> None:
    """Bulk UPSERT into sensor_latest_data — 1 query for all sensors in an HMI."""
    # cursor.executemany(
    #     """
    #     INSERT INTO sensor_latest_data
    #         (sensor_id, temperature, humidity, status, last_read_at, updated_at)
    #     VALUES (%s, %s, %s, %s, %s, %s)
    #     ON DUPLICATE KEY UPDATE
    #         temperature  = VALUES(temperature),
    #         humidity     = VALUES(humidity),
    #         status       = VALUES(status),
    #         last_read_at = VALUES(last_read_at),
    #         updated_at   = VALUES(updated_at)
    #     """,
    #     rows,
    # )

    #Posgre
    cursor.executemany(
        """
        INSERT INTO sensor_latest_data
            (sensor_id, temperature, humidity, status, last_read_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (sensor_id) DO UPDATE SET
            temperature  = EXCLUDED.temperature,
            humidity     = EXCLUDED.humidity,
            status       = EXCLUDED.status,
            last_read_at = EXCLUDED.last_read_at,
            updated_at   = EXCLUDED.updated_at
        """,
        rows,
    )


def mark_hmi_offline(cursor, hmi_id: int, now: datetime) -> None:
    """
    Bulk UPDATE all sensors on this HMI to OFFLINE via JOIN.
    Skips sensors already OFFLINE to avoid unnecessary disk writes (write-amplification prevention).
    """
    # cursor.execute(
    #     """
    #     UPDATE sensor_latest_data sld
    #     JOIN sensors s ON s.id = sld.sensor_id
    #     SET sld.status     = 'OFFLINE',
    #         sld.updated_at = %s
    #     WHERE s.hmi_id = %s
    #       AND sld.status != 'OFFLINE'
    #     """,
    #     (now, hmi_id),
    # )

    #Posgre
    cursor.execute(
        """
        UPDATE sensor_latest_data sld
        SET status     = 'OFFLINE',
            updated_at = %s
        FROM sensors s
        WHERE s.id = sld.sensor_id
          AND s.hmi_id = %s
          AND sld.status != 'OFFLINE'
        """,
        (now, hmi_id),
    )


# ─── Modbus Polling ───────────────────────────────────────────────────────────

def read_register(client: ModbusTcpClient, address: int, unit_id: int) -> float:
    result = client.read_input_registers(address=address, count=1, device_id=unit_id)
    if result.isError():
        raise ModbusException(f"Slave {unit_id} register {address} returned error response")
    return result.registers[0] / REGISTER_SCALE


def poll_hmi(hmi: dict, cursor, now: datetime) -> None:
    """Poll one HMI: on success UPSERT readings; on failure mark all sensors OFFLINE."""
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

        ok_rows     = []
        offline_ids = []

        for sensor in hmi["sensors"]:
            unit_id = sensor["unit_id"]
            try:
                temp   = read_register(client, sensor["addr_temp"], unit_id)
                hum    = read_register(client, sensor["addr_hum"],  unit_id)
                status = compute_status(temp, hum, hmi["temp_max_limit"], hmi["hum_max_limit"])
                ok_rows.append((
                    sensor["sensor_id"],
                    round(temp, 2),
                    round(hum, 2),
                    status,
                    now,
                    now,
                ))
            except (ModbusException, OSError) as exc:
                log.warning(
                    "HMI %d sensor %s (unit_id=%d) OFFLINE — %s",
                    hmi["hmi_id"], sensor.get("name", sensor["sensor_id"]), unit_id, exc,
                )
                offline_ids.append(sensor["sensor_id"])

        if ok_rows:
            upsert_sensor_data(cursor, ok_rows)

        if offline_ids:
            cursor.execute(
                f"""
                UPDATE sensor_latest_data
                SET    status     = 'OFFLINE',
                       updated_at = %s
                WHERE  sensor_id IN ({','.join(['%s'] * len(offline_ids))})
                  AND  status != 'OFFLINE'
                """,
                (now, *offline_ids),
            )

        log.info(
            "HMI %d (%s) — %d OK  %d OFFLINE",
            hmi["hmi_id"], hmi["ip_address"], len(ok_rows), len(offline_ids),
        )

    except (ModbusException, ConnectionException, OSError) as exc:
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
                        # now = datetime.now()
                        # for hmi in hmis:
                        #     poll_hmi(hmi, cursor, now)
                        wib = timezone(timedelta(hours=7))
                        now = datetime.now(wib).strftime('%Y-%m-%d %H:%M:%S')
                        
                        for hmi in hmis:
                            poll_hmi(hmi, cursor, now)
                        db.commit()

            except psycopg2.OperationalError as exc:
                log.error("PostgreSQL connection lost, reconnecting — %s", exc)
                try:
                #     db.ping(reconnect=True)
                # except Exception:
                #     db = get_connection()
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
