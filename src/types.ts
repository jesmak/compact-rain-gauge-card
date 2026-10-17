import type { ActionConfig, LovelaceCardConfig } from "./hass";
import { browserLanguage, translate } from "./localize/localize";

export interface CompactRainGaugeCardConfig extends LovelaceCardConfig {
    /** The rain so far, usually today's: the drop fills with it. */
    entity: string;
    /** How hard it is raining now, shown under the total. */
    hourly_rate_entity?: string;
    /** The rain that fills the drop, in the sensor's unit. */
    max_level?: number;
    border_colour?: string;
    fill_drop_colour?: string;
    /** A language of its own, instead of Home Assistant's. */
    language?: string;
    /** For a sensor without a unit: read its value as inches. A sensor with a unit says which it is. */
    is_imperial?: boolean;

    /** Moves the drop's surface and lets drops fall while the rate sensor says it rains. On by default. */
    animate_rain?: boolean;
    /** Marks on the drop at round values. On by default. */
    show_scale?: boolean;
    /** Bars beside the rate that show how hard it rains. On by default. */
    show_intensity?: boolean;
    /** Yesterday's rain, and that of the last 7 and 30 days. Off by default. */
    show_yesterday?: boolean;
    show_week?: boolean;
    show_month?: boolean;
    /** The rain day by day, as bars, over `daily_chart_days` days. Off by default. */
    show_daily_chart?: boolean;
    daily_chart_days?: number;
    /** The rain rate over the last `rate_chart_hours` hours, as a line. Off by default. */
    show_rate_chart?: boolean;
    rate_chart_hours?: number;

    tap_action?: ActionConfig;
    hold_action?: ActionConfig;
    double_tap_action?: ActionConfig;
}

/** The options' defaults, which the card and the editor both go by. */
export const DEFAULTS = {
    animate_rain: true,
    show_scale: true,
    show_intensity: true,
    show_yesterday: false,
    show_week: false,
    show_month: false,
    show_daily_chart: false,
    daily_chart_days: 14,
    show_rate_chart: false,
    rate_chart_hours: 24,
    is_imperial: false,
} as const;

/**
 * Refuses a number option that isn't a number, so that a mistyped one can't quietly mean the default. `max_level`
 * must also be above zero, except in the editor, since typing 0.5 passes through zero. The charts' lengths are kept
 * in their range by the card.
 */
export function checkNumbers(config: CompactRainGaugeCardConfig, editing = false): void {
    const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
    const level: unknown = config.max_level;
    if (level != null && !(isNumber(level) && (editing || level > 0))) {
        throw new Error(translate(browserLanguage(), "common.invalid_max_level"));
    }
    for (const key of ["daily_chart_days", "rate_chart_hours"] as const) {
        const value: unknown = config[key];
        if (value != null && !isNumber(value)) {
            throw new Error(translate(browserLanguage(), `common.invalid_${key}`));
        }
    }
}

/** An option's value, or its default. */
export function option<K extends keyof typeof DEFAULTS>(
    config: CompactRainGaugeCardConfig,
    key: K,
): (typeof DEFAULTS)[K] extends boolean ? boolean : number {
    const value = config[key];
    return (value ?? DEFAULTS[key]) as never;
}
