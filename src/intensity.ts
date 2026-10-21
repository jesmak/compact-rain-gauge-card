/**
 * How hard it is raining, by the rate in millimetres an hour, in the steps meteorologists use: light below
 * 2.5 mm/h, moderate below 7.6 mm/h, heavy below 50 mm/h and violent above that.
 */
import { MM_PER_INCH } from "./const";
import { isInches } from "./gauge";

export type Intensity = "none" | "light" | "moderate" | "heavy" | "violent";

const STEPS: Array<[number, Intensity]> = [
    [50, "violent"],
    [7.6, "heavy"],
    [2.5, "moderate"],
    [0, "light"],
];

/**
 * The intensity of a rate. A sensor that gives the rain of the current hour as an amount, such as millimetres,
 * is read as that many an hour; inches are turned into millimetres.
 */
export function intensityOf(rate: number | null, unit: string): Intensity {
    if (rate === null || rate <= 0) {
        return "none";
    }
    const perHour = rate * hourlyFactor(unit);
    const mm = isInches(unit) ? perHour * MM_PER_INCH : perHour;
    return STEPS.find(([floor]) => mm > floor)?.[1] ?? "light";
}

/** The least the rate chart's top stands for: 1 mm or 0.05 in an hour, in the sensor's own unit. */
export function rateFloor(unit: string): number {
    return (isInches(unit) ? 0.05 : 1) / hourlyFactor(unit);
}

/** What a rate in this unit is multiplied by to give it per hour: 60 for one per minute, 1/24 for one per day. */
function hourlyFactor(unit: string): number {
    return /\/\s*(min|minute)/i.test(unit) ? 60 : /\/\s*(d|day)/i.test(unit) ? 1 / 24 : 1;
}

/** How many of the indicator's three bars are filled. */
export function barsOf(intensity: Intensity): number {
    return { none: 0, light: 1, moderate: 2, heavy: 3, violent: 3 }[intensity];
}
