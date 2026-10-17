import { describe, expect, it } from "vitest";

import { DAY, daysFromChange, daysFromHourly, lastDays, pointsOf, sumOf } from "../src/history";
import type { DayAmount } from "../src/history";

const ZONE = "Europe/Helsinki";
// Noon in Helsinki, 22 September 2026.
const NOW = Date.parse("2026-09-22T09:00:00Z");
const at = (iso: string) => Date.parse(iso);

describe("the days", () => {
    it("are the last ones in Home Assistant's time zone, oldest first", () => {
        expect(lastDays(3, NOW, ZONE).map((day) => day.day)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
    });

    it("neither skip nor repeat a day across a change of daylight saving time", () => {
        const days = lastDays(4, Date.parse("2026-10-26T00:30:00+02:00"), ZONE).map((day) => day.day);
        expect(days).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    });
});

describe("a measuring sensor's days", () => {
    it("are its value in each day's last hour on record", () => {
        // A sensor that reports once a day, in the morning: yesterday 20 mm, today 2 mm.
        const rows = [
            { start: at("2026-09-21T05:00:00Z"), max: 1 },
            { start: at("2026-09-21T06:00:00Z"), max: 20 },
            { start: at("2026-09-21T20:00:00Z"), max: 20 },
            { start: at("2026-09-22T05:00:00Z"), max: 20 },
            { start: at("2026-09-22T06:00:00Z"), max: 2 },
        ];
        const days = daysFromHourly(rows, lastDays(3, NOW, ZONE), ZONE);
        expect(days.map((day) => day.amount)).toEqual([null, 20, 2]);
    });
});

describe("a counter's days", () => {
    it("are its daily changes, and never less than nothing", () => {
        const rows = [
            { start: at("2026-09-20T21:00:00Z"), change: 3.5 },
            { start: at("2026-09-21T21:00:00Z"), change: -1 },
        ];
        const days = daysFromChange(rows, lastDays(3, NOW, ZONE), ZONE);
        expect(days.map((day) => day.amount)).toEqual([null, 3.5, 0]);
    });
});

describe("reading the days", () => {
    const days: DayAmount[] = [4, 0, null, 12, 0, 1].map((amount, index) => ({
        day: `2026-09-${17 + index}`,
        time: NOW - (5 - index) * DAY,
        amount,
    }));

    it("add up the last days, counting unknown ones as dry", () => {
        expect(sumOf(days, 3)).toBe(13);
        expect(sumOf(days, 6)).toBe(17);
        expect(sumOf(days, 7)).toBeNull();
    });
});

describe("the rate history", () => {
    it("is read from a minimal history answer, in order, skipping what is no number", () => {
        const answer = {
            "sensor.rate": [
                { s: "0.4", lu: 1_700_000_100 },
                { s: "unavailable", lu: 1_700_000_200 },
                { s: "0.0", lu: 1_700_000_000 },
            ],
        };
        expect(pointsOf(answer, "sensor.rate")).toEqual([
            { time: 1_700_000_000_000, value: 0 },
            { time: 1_700_000_100_000, value: 0.4 },
        ]);
    });
});
