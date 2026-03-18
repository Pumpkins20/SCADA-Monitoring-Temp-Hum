// IMPORTANT: Keep these constants in sync with SENSOR_MAP and COIL_MAP in poller.py.
// If register mappings change, update BOTH files together.

export const SENSOR_MAP = {
    1: {
        temp: 9,
        hum: 11,
        over_temp: 17,
        under_temp: 19,
        over_hum: 21,
        under_hum: 23,
    },
    2: {
        temp: 33,
        hum: 35,
        over_temp: 41,
        under_temp: 43,
        over_hum: 45,
        under_hum: 47,
    },
    3: {
        temp: 57,
        hum: 59,
        over_temp: 65,
        under_temp: 67,
        over_hum: 69,
        under_hum: 71,
    },
    4: {
        temp: 81,
        hum: 83,
        over_temp: 89,
        under_temp: 91,
        over_hum: 93,
        under_hum: 95,
    },
} as const;

export const COIL_MAP = {
    1: { alarm_temp: 1, alarm_hum: 2, connection: 10 },
    2: { alarm_temp: 3, alarm_hum: 4, connection: 11 },
    3: { alarm_temp: 5, alarm_hum: 6, connection: 12 },
    4: { alarm_temp: 7, alarm_hum: 8, connection: 13 },
} as const;

export type SensorMapPosition = keyof typeof SENSOR_MAP;
