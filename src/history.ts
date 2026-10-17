/**
 * The rain of past days and hours, from Home Assistant's recorder.
 *
 * A day's rain is read from the long-term statistics, which are kept for good, not from the state history,
 * which is kept for ten days by default. For a sensor that measures (`state_class: measurement`) it is the
 * sensor's value at the end of the day: that is the day's total for a sensor that resets at midnight, the last
 * 24 hours for a rolling sum, and the latest report for a sensor that reports once a day. For a counter that only
 * grows (`total`, `total_increasing`) it is the day's increase.
 */
import type { HassEntity, HomeAssistant } from "./hass";

/** One row of `recorder/statistics_during_period`. Times are milliseconds. */
export interface StatisticRow {
    start: number;
    end?: number;
    max?: number | null;
    change?: number | null;
}

/** A day's rain, or `null` when the recorder has nothing for it. */
export interface DayAmount {
    day: string;
    /** A moment inside the day, for formatting its date. */
    time: number;
    amount: number | null;
}

/** A reading of the rate sensor. */
export interface Point {
    time: number;
    value: number;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** The longest the totals look back: the past month. */
export const LOOKBACK_DAYS = 30;
/** The rate chart reads the state history, which the recorder keeps for ten days by default. */
export const MAX_RATE_CHART_HOURS = 168;

/** A function that gives the calendar day of a moment in Home Assistant's time zone, as `YYYY-MM-DD`. */
export function dayFormatter(timeZone?: string): (time: number) => string {
    const format = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return (time) => {
        const parts = format.formatToParts(new Date(time));
        const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
        return `${part("year")}-${part("month")}-${part("day")}`;
    };
}

/**
 * The last `count` days, oldest first and ending today, each with a moment inside it. Stepping back a few
 * hours at a time never skips or repeats a day, whatever daylight saving time does.
 */
export function lastDays(count: number, now: number, timeZone?: string): Array<{ day: string; time: number }> {
    const dayOf = dayFormatter(timeZone);
    const days: Array<{ day: string; time: number }> = [];
    for (let time = now; days.length < count; time -= 6 * HOUR) {
        const day = dayOf(time);
        if (days[0]?.day !== day) {
            days.unshift({ day, time });
        }
    }
    return days;
}

/** Whether the sensor counts up for good rather than measuring the rain of a period. */
export function isCounter(entity: HassEntity): boolean {
    const stateClass = entity.attributes.state_class;
    return stateClass === "total" || stateClass === "total_increasing";
}

/** Days from hourly maximums: each day's amount is the maximum of its last hour on record. */
export function daysFromHourly(rows: StatisticRow[], days: Array<{ day: string; time: number }>, timeZone?: string): DayAmount[] {
    const dayOf = dayFormatter(timeZone);
    const last = new Map<string, StatisticRow>();
    for (const row of rows) {
        const day = dayOf(row.start);
        const previous = last.get(day);
        if (typeof row.max === "number" && (!previous || row.start > previous.start)) {
            last.set(day, row);
        }
    }
    return days.map(({ day, time }) => ({ day, time, amount: last.get(day)?.max ?? null }));
}

/** Days from daily changes, for a counter. */
export function daysFromChange(rows: StatisticRow[], days: Array<{ day: string; time: number }>, timeZone?: string): DayAmount[] {
    const dayOf = dayFormatter(timeZone);
    const change = new Map<string, number>();
    for (const row of rows) {
        if (typeof row.change === "number") {
            change.set(dayOf(row.start), Math.max(row.change, 0));
        }
    }
    return days.map(({ day, time }) => ({ day, time, amount: change.get(day) ?? null }));
}

/** The rain of the last `count` days, today included. */
export function sumOf(days: DayAmount[], count: number): number | null {
    const recent = days.slice(-count);
    if (recent.length < count || recent.every((day) => day.amount === null)) {
        return null;
    }
    return recent.reduce((total, day) => total + (day.amount ?? 0), 0);
}

/** The readings in a minimal `history/history_during_period` answer. */
export function pointsOf(answer: Record<string, Array<Record<string, unknown>>> | undefined, id: string): Point[] {
    const points: Point[] = [];
    for (const row of answer?.[id] ?? []) {
        const value = Number.parseFloat(String(row.s));
        const seconds = Number(row.lu ?? row.lc);
        if (Number.isFinite(value) && Number.isFinite(seconds)) {
            points.push({ time: seconds * 1000, value });
        }
    }
    return points.sort((one, other) => one.time - other.time);
}

async function statistics(
    hass: HomeAssistant,
    id: string,
    start: number,
    end: number,
    period: "hour" | "day",
    types: string[],
): Promise<StatisticRow[]> {
    if (!hass.callWS) {
        return [];
    }
    const answer = await hass.callWS<Record<string, StatisticRow[]>>({
        type: "recorder/statistics_during_period",
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        statistic_ids: [id],
        period,
        types,
    });
    return answer?.[id] ?? [];
}

/** The rain of the last `count` days, ending today. Today's comes from the sensor itself where it can. */
export async function fetchDays(hass: HomeAssistant, entity: HassEntity, count: number, now: number): Promise<DayAmount[]> {
    const timeZone = hass.config?.time_zone;
    const days = lastDays(count, now, timeZone);
    const start = days[0].time - DAY;
    if (isCounter(entity)) {
        return daysFromChange(await statistics(hass, entity.entity_id, start, now, "day", ["change"]), days, timeZone);
    }
    return daysFromHourly(await statistics(hass, entity.entity_id, start, now, "hour", ["max"]), days, timeZone);
}

/** The rate sensor's readings over the last hours. */
export async function fetchRate(hass: HomeAssistant, rateId: string, hours: number, now: number): Promise<Point[]> {
    if (!hass.callWS) {
        return [];
    }
    const answer = await hass.callWS<Record<string, Array<Record<string, unknown>>>>({
        type: "history/history_during_period",
        start_time: new Date(now - hours * HOUR).toISOString(),
        end_time: new Date(now).toISOString(),
        entity_ids: [rateId],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
    });
    return pointsOf(answer, rateId);
}
