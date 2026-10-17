import { describe, expect, it } from "vitest";

import { NO_VALUE, fillOf, findRainSensor, formatReading, maxLevelOf, unitOf, valueOf } from "../src/gauge";
import type { HassEntity, HomeAssistant } from "../src/hass";
import type { CompactRainGaugeCardConfig } from "../src/types";

const CONFIG: CompactRainGaugeCardConfig = { type: "custom:compact-rain-gauge-card", entity: "sensor.rain" };

function sensor(state: string, attributes: Record<string, unknown> = { unit_of_measurement: "mm" }): HassEntity {
    return { entity_id: "sensor.rain", state, last_changed: "2026-09-22", attributes };
}

describe("reading a sensor", () => {
    it("takes its number, and nothing while it is unavailable", () => {
        expect(valueOf(sensor("12.5"))).toBe(12.5);
        expect(valueOf(sensor("unavailable"))).toBeNull();
        expect(valueOf(sensor("unknown"))).toBeNull();
        expect(valueOf(undefined)).toBeNull();
    });

    it("takes the sensor's unit, or millimetres or inches for one without", () => {
        expect(unitOf(sensor("1", { unit_of_measurement: "in" }), CONFIG)).toBe("in");
        expect(unitOf(sensor("1", {}), CONFIG)).toBe("mm");
        expect(unitOf(sensor("1", {}), { ...CONFIG, is_imperial: true })).toBe("in");
        expect(unitOf(sensor("1", { unit_of_measurement: "mm" }), { ...CONFIG, is_imperial: true })).toBe("mm");
    });
});

describe("the full drop", () => {
    it("is 40 mm, or as much in inches, unless the card says", () => {
        expect(maxLevelOf(CONFIG, "mm")).toBe(40);
        expect(maxLevelOf(CONFIG, "in")).toBeCloseTo(1.575, 3);
        expect(maxLevelOf({ ...CONFIG, max_level: 10 }, "mm")).toBe(10);
        expect(maxLevelOf({ ...CONFIG, max_level: 0 }, "mm")).toBe(40);
    });

    it("fills in proportion, stops at full, and stays empty without a reading", () => {
        expect(fillOf(10, 40)).toBe(0.25);
        expect(fillOf(60, 40)).toBe(1);
        expect(fillOf(0, 40)).toBe(0);
        expect(fillOf(-1, 40)).toBe(0);
        expect(fillOf(null, 40)).toBe(0);
    });
});

describe("the figures", () => {
    const hass: HomeAssistant = {
        states: {},
        formatEntityState: (entity) => `${entity.state.replace(".", ",")} ${entity.attributes.unit_of_measurement}`,
    };

    it("are written as Home Assistant writes the sensor's state", () => {
        expect(formatReading(hass, sensor("12.5"), "mm", "fi")).toBe("12,5 mm");
    });

    it("say per hour for a rate counted in a plain amount, and leave a rate unit as it is", () => {
        expect(formatReading(hass, sensor("0.4"), "mm", "fi", true)).toBe("0,4 mm/h");
        const rate = sensor("2", { unit_of_measurement: "mm/h" });
        expect(formatReading(hass, rate, "mm/h", "fi", true)).toBe("2 mm/h");
    });

    it("are written in the locale when the sensor has no unit or Home Assistant no formatter", () => {
        expect(formatReading({ states: {} }, sensor("3.25"), "mm", "fi")).toBe("3,25 mm");
        expect(formatReading(hass, sensor("3.25", {}), "in", "en")).toBe("3.25 in");
    });

    it("are a dash while the sensor has no reading", () => {
        expect(formatReading(hass, sensor("unavailable"), "mm", "fi")).toBe(NO_VALUE);
        expect(formatReading(hass, undefined, "mm", "fi")).toBe(NO_VALUE);
    });
});

describe("a sensor for a new card", () => {
    it("is a precipitation sensor, preferably the day's", () => {
        const entity = (id: string, deviceClass?: string): HassEntity => ({
            entity_id: id,
            state: "1",
            last_changed: "",
            attributes: deviceClass ? { device_class: deviceClass } : {},
        });
        const hass: HomeAssistant = {
            states: {
                "sensor.rain_hour": entity("sensor.rain_hour", "precipitation"),
                "sensor.rain_daily": entity("sensor.rain_daily", "precipitation"),
                "sensor.temperature": entity("sensor.temperature", "temperature"),
            },
        };
        expect(findRainSensor(hass)).toBe("sensor.rain_daily");
        expect(findRainSensor({ states: { "sensor.x": entity("sensor.x") } })).toBeUndefined();
    });
});
