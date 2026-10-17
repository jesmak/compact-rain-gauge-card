/**
 * A small dashboard card that shows the rain so far as a drop filling up, with the total and, when a rate
 * sensor is given, how hard it is raining now. Below it, when asked for, come the rain of recent days and two
 * small charts: the rain day by day, and the rain rate over the last hours.
 *
 * The card sizes itself to the space it gets. It measures its width with container queries and its height
 * with a ResizeObserver, so it works at any size in a sections view, in a horizontal stack or in a masonry
 * view: the drop and the figures side by side, larger figures when there is room, the drop above the figures
 * when it is narrow, and a small drop beside unlabelled figures when it is low. What doesn't fit under the
 * drop is left out, the rate chart first.
 */
import { LitElement, css, html, nothing } from "lit";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { GestureDetector, isTappable } from "./actions";
import type { Gesture } from "./actions";
import "./chart";
import type { ChartItem } from "./chart";
import { CARD_VERSION } from "./const";
import { DROP_HEIGHT, DROP_WIDTH, drop, scaleMarks } from "./drop";
import "./editor";
import { fillOf, findRainSensor, formatReading, isInches, maxLevelOf, unitOf, valueOf } from "./gauge";
import type { HassEntity, HomeAssistant } from "./hass";
import { HOUR, LOOKBACK_DAYS, MAX_RATE_CHART_HOURS, fetchDays, fetchRate, isCounter, sumOf } from "./history";
import type { DayAmount, Point } from "./history";
import { barsOf, intensityOf } from "./intensity";
import type { Intensity } from "./intensity";
import { browserLanguage, translate } from "./localize/localize";
import { option } from "./types";
import type { CompactRainGaugeCardConfig } from "./types";

console.info(
    `%c  COMPACT-RAIN-GAUGE-CARD \n%c  ${CARD_VERSION}    `,
    "color: orange; font-weight: bold; background: black",
    "color: white; font-weight: bold; background: dimgray",
);

interface CardRegistration {
    type: string;
    name: string;
    description: string;
    documentationURL?: string;
    preview?: boolean;
}

const registry = window as unknown as { customCards?: CardRegistration[] };
registry.customCards = registry.customCards ?? [];
registry.customCards.push({
    type: "compact-rain-gauge-card",
    name: translate(browserLanguage(), "common.name"),
    description: translate(browserLanguage(), "common.description"),
    documentationURL: "https://github.com/jesmak/compact-rain-gauge-card",
    preview: true,
});

/** How often the recorder is asked again. Hourly statistics change once an hour. */
export const REFRESH_INTERVAL = 15 * 60_000;
/** The parts under the drop, in the order they are left out when the card is too low for them. */
const OPTIONAL_PARTS = ["rate-chart", "daily-chart", "extras"];

let instances = 0;

/** Whether the gauge has the height its labelled figures need. */
function labelledFits(gauge: HTMLElement): boolean {
    const figures = gauge.querySelector<HTMLElement>(".figures");
    const figuresFit = !figures || figures.scrollHeight <= figures.clientHeight + 1;
    return figuresFit && gauge.scrollHeight <= gauge.clientHeight + 1;
}

/**
 * Fits the card to the height it has, which CSS can't: in a sections view the grid fixes it, and in a masonry
 * view the contents make it, so only measuring tells the two apart. The parts under the drop are left out,
 * least needed first, until the rest fits the card and the drop's figures keep their labels. Only when even
 * that isn't enough does the gauge go low, its figures without labels. Last, the drop is made as wide as the
 * height it ends up with calls for.
 */
export function fitCard(content: HTMLElement): void {
    const gauge = content.querySelector<HTMLElement>(".gauge");
    content.classList.remove(...OPTIONAL_PARTS.map((part) => `hide-${part}`));
    gauge?.classList.remove("short");
    for (const part of OPTIONAL_PARTS) {
        const fits = content.scrollHeight <= content.clientHeight + 1;
        if (fits && (!gauge || labelledFits(gauge))) {
            break;
        }
        content.classList.add(`hide-${part}`);
    }
    if (!gauge) {
        return;
    }
    gauge.classList.toggle("short", !labelledFits(gauge));
    const style = getComputedStyle(gauge);
    const height = gauge.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
    gauge.style.setProperty("--drop-width", `${Math.max(Math.round((height * DROP_WIDTH) / DROP_HEIGHT), 0)}px`);
}

@customElement("compact-rain-gauge-card")
export class CompactRainGaugeCard extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @state() private config?: CompactRainGaugeCardConfig;
    /** The rain of recent days, from the recorder. Today's is replaced with the sensor's own state. */
    @state() private days?: DayAmount[];
    /** The rate sensor's readings for the rate chart. */
    @state() private rates?: Point[];

    /** Each card clips its own drop, so two cards on one page never share the clip. */
    private readonly clipId = `compact-rain-gauge-${++instances}`;
    private readonly gestures = new GestureDetector(
        () => this.config,
        (gesture) => this.act(gesture),
    );
    /** Fits the card again whenever its height, or the gauge's, changes. */
    private readonly resizer =
        typeof ResizeObserver === "undefined"
            ? undefined
            : new ResizeObserver(() => {
                  const content = this.renderRoot.querySelector<HTMLElement>(".content");
                  if (content) {
                      fitCard(content);
                  }
              });
    private observed: Element[] = [];
    private timer?: ReturnType<typeof setInterval>;
    private fetchedAt = 0;
    private fetching = false;

    public static getConfigElement(): HTMLElement {
        return document.createElement("compact-rain-gauge-card-editor");
    }

    /** Offers a precipitation sensor that is there when the card is added from the picker. */
    public static getStubConfig(hass?: HomeAssistant): Record<string, unknown> {
        const entity = findRainSensor(hass);
        return entity ? { entity } : {};
    }

    public setConfig(config: CompactRainGaugeCardConfig): void {
        if (!config || typeof config.entity !== "string" || config.entity === "") {
            throw new Error(translate(browserLanguage(), "common.invalid_configuration"));
        }
        this.config = { ...config };
        this.days = undefined;
        this.rates = undefined;
        this.fetchedAt = 0;
    }

    public getCardSize(): number {
        return 2 + this.parts();
    }

    /** Two rows of a sections view and half its width, and a row more for the totals and for each chart. */
    public getGridOptions(): Record<string, number> {
        return { columns: 6, rows: 2 + this.parts(), min_columns: 3, min_rows: 1 };
    }

    public connectedCallback(): void {
        super.connectedCallback();
        this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL);
    }

    public disconnectedCallback(): void {
        super.disconnectedCallback();
        clearInterval(this.timer);
        this.gestures.dispose();
        this.resizer?.disconnect();
        this.observed = [];
    }

    protected shouldUpdate(changed: PropertyValues): boolean {
        if (!this.config || changed.size > 1 || !changed.has("hass")) {
            return true;
        }
        const previous = changed.get("hass") as HomeAssistant | undefined;
        if (!previous || previous.locale !== this.hass?.locale || previous.language !== this.hass?.language) {
            return true;
        }
        return [this.config.entity, this.config.hourly_rate_entity].some(
            (id) => id !== undefined && previous.states[id] !== this.hass?.states[id],
        );
    }

    protected updated(): void {
        const watched = [this.renderRoot.querySelector(".gauge"), this.renderRoot.querySelector(".content")].filter(
            (element): element is Element => element !== null,
        );
        if (watched.length !== this.observed.length || watched.some((element, index) => element !== this.observed[index])) {
            this.resizer?.disconnect();
            watched.forEach((element) => this.resizer?.observe(element));
            this.observed = watched;
        }
        if (this.fetchedAt === 0) {
            void this.refresh();
        }
    }

    /** Asks the recorder for what the options need, and nothing when they need nothing. */
    private async refresh(): Promise<void> {
        const hass = this.hass;
        const config = this.config;
        const entity = config ? hass?.states[config.entity] : undefined;
        if (!hass?.callWS || !config || !entity || this.fetching) {
            return;
        }
        this.fetching = true;
        this.fetchedAt = Date.now();
        const now = Date.now();
        const rateId = config.hourly_rate_entity;
        const wantsRates = !!rateId && option(config, "show_rate_chart");
        const count = this.daysNeeded();
        const quietly = <T>(promise: Promise<T>) => promise.catch(() => undefined);
        try {
            const [days, rates] = await Promise.all([
                count > 0 ? quietly(fetchDays(hass, entity, count, now)) : undefined,
                wantsRates ? quietly(fetchRate(hass, rateId, this.rateHours(), now)) : undefined,
            ]);
            if (config !== this.config) {
                return;
            }
            this.days = days;
            this.rates = rates;
        } finally {
            this.fetching = false;
        }
    }

    /** How many days of rain the options need. */
    private daysNeeded(): number {
        const config = this.config;
        if (!config) {
            return 0;
        }
        const needs = [
            option(config, "show_daily_chart") ? this.chartDays() : 0,
            option(config, "show_month") ? LOOKBACK_DAYS : 0,
            option(config, "show_week") ? 7 : 0,
            option(config, "show_yesterday") ? 2 : 0,
        ];
        return Math.max(...needs);
    }

    private chartDays(): number {
        return this.config ? Math.min(Math.max(option(this.config, "daily_chart_days"), 2), 60) : 0;
    }

    private rateHours(): number {
        return this.config ? Math.min(Math.max(option(this.config, "rate_chart_hours"), 1), MAX_RATE_CHART_HOURS) : 0;
    }

    /** How many parts go under the drop: the totals, and each chart. */
    private parts(): number {
        const config = this.config;
        if (!config) {
            return 0;
        }
        const totals = option(config, "show_yesterday") || option(config, "show_week") || option(config, "show_month");
        const rate = option(config, "show_rate_chart") && !!config.hourly_rate_entity;
        return [totals, option(config, "show_daily_chart"), rate].filter(Boolean).length;
    }

    /** The days from the recorder, with today's rain from the sensor's state where that is what it measures. */
    private liveDays(entity: HassEntity): DayAmount[] | undefined {
        if (!this.days || this.days.length === 0 || isCounter(entity)) {
            return this.days;
        }
        const today = valueOf(entity);
        if (today === null) {
            return this.days;
        }
        return [...this.days.slice(0, -1), { ...this.days[this.days.length - 1], amount: today }];
    }

    protected render(): TemplateResult | typeof nothing {
        if (!this.hass || !this.config) {
            return nothing;
        }
        const config = this.config;
        const entity = this.hass.states[config.entity];
        if (!entity) {
            return html`<ha-card><div class="missing">${this.text("common.no_entity")} ${config.entity}</div></ha-card>`;
        }

        const language = this.language();
        const unit = unitOf(entity, config);
        const days = this.liveDays(entity);
        const maxLevel = maxLevelOf(config, unit);
        const fill = fillOf(valueOf(entity), maxLevel);
        const total = formatReading(this.hass, entity, unit, language);
        const label = this.text("common.total");

        const rateId = config.hourly_rate_entity;
        const rateEntity = rateId ? this.hass.states[rateId] : undefined;
        const rateUnit = unitOf(rateEntity, config);
        const rateValue = valueOf(rateEntity);
        const rate = rateId ? formatReading(this.hass, rateEntity, rateUnit, language, true) : undefined;
        const raining = rateValue !== null && rateValue > 0;
        const intensity = intensityOf(rateValue, rateUnit);
        const intensityText = this.text(`intensity.${intensity}`);
        const showIntensity = rate !== undefined && option(config, "show_intensity");
        const tappable = isTappable(config);

        return html`
            <ha-card
                class=${tappable ? "tappable" : ""}
                style=${this.colours()}
                role=${tappable ? "button" : nothing}
                tabindex=${tappable ? "0" : nothing}
                aria-label=${[`${label} ${total}`, rate ? `${this.text("common.rate")} ${rate}` : "", showIntensity ? intensityText : ""]
                    .filter(Boolean)
                    .join(", ")}
                @pointerdown=${() => this.gestures.pointerDown()}
                @pointerup=${() => this.gestures.pointerUp()}
                @pointercancel=${() => this.gestures.pointerUp()}
                @pointerleave=${() => this.gestures.pointerUp()}
                @click=${() => this.gestures.click()}
                @keydown=${(event: KeyboardEvent) => this.gestures.key(event)}
            >
                <div class="content">
                    <div class="gauge">
                        <div class="drop">
                            <svg viewBox="0 0 ${DROP_WIDTH} ${DROP_HEIGHT}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                                ${drop({
                                    fill,
                                    clipId: this.clipId,
                                    raining: raining && option(config, "animate_rain"),
                                    marks: option(config, "show_scale") ? scaleMarks(maxLevel) : [],
                                })}
                            </svg>
                        </div>
                        <div class="figures">
                            <div class="figure total">
                                <span class="label"
                                    ><span class="long">${label}</span><span class="brief">${this.text("common.total_short")}</span></span
                                >
                                <span class="value">${total}</span>
                            </div>
                            ${
                                rate === undefined
                                    ? nothing
                                    : html`<div class="figure rate">
                                          <span class="label">${this.text("common.rate")}</span>
                                          <span class="value"
                                              >${rate}${showIntensity ? this.intensity(intensity, intensityText) : nothing}</span
                                          >
                                      </div>`
                            }
                        </div>
                    </div>
                    ${this.extras(days, unit, language)} ${this.dailyChart(days, unit, language)}
                    ${this.rateChart(rateEntity, rateUnit, language)}
                </div>
            </ha-card>
        `;
    }

    /** Three bars of rising height, as many filled as it rains hard. */
    private intensity(level: Intensity, text: string): TemplateResult {
        const filled = barsOf(level);
        return html`<span class="intensity ${level}" title=${text} role="img" aria-label=${text}
            >${[1, 2, 3].map((bar) => html`<i class=${bar <= filled ? "on" : ""}></i>`)}</span
        >`;
    }

    /** Yesterday's rain, and that of the last 7 and 30 days, as the options ask. */
    private extras(days: DayAmount[] | undefined, unit: string, language: string): TemplateResult | typeof nothing {
        const config = this.config;
        if (!config || !days) {
            return nothing;
        }
        // Each total has a long name and a short one for the narrowest card.
        const wanted: Array<[string, number | null]> = [];
        if (option(config, "show_yesterday")) {
            wanted.push(["yesterday", days.length >= 2 ? days[days.length - 2].amount : null]);
        }
        if (option(config, "show_week")) {
            wanted.push(["week", sumOf(days, 7)]);
        }
        if (option(config, "show_month")) {
            wanted.push(["month", sumOf(days, 30)]);
        }
        if (wanted.length === 0) {
            return nothing;
        }
        return html`<div class="extras">
            ${wanted.map(
                ([name, amount]) =>
                    html`<span class="extra"
                        ><span class="label"
                            ><span class="long">${this.text(`common.${name}`)}</span
                            ><span class="brief">${this.text(`common.${name}_short`)}</span></span
                        >
                        <span class="amount">${amountText(amount, unit, language)}</span></span
                    >`,
            )}
        </div>`;
    }

    private dailyChart(days: DayAmount[] | undefined, unit: string, language: string): TemplateResult | typeof nothing {
        const config = this.config;
        if (!config || !option(config, "show_daily_chart") || !days) {
            return nothing;
        }
        const count = this.chartDays();
        const date = new Intl.DateTimeFormat(language, {
            weekday: "short",
            day: "numeric",
            month: "numeric",
            timeZone: this.hass?.config?.time_zone,
        });
        const items: ChartItem[] = days.slice(-count).map((day) => ({
            time: day.time,
            value: day.amount,
            label: `${date.format(day.time)}: ${amountText(day.amount, unit, language)}`,
        }));
        return html`<compact-rain-gauge-chart
            class="chart daily-chart"
            kind="bars"
            .items=${items}
            .floor=${isInches(unit) ? 0.1 : 2}
            .heading=${this.text("common.daily_chart", { days: String(count) })}
            .brief=${this.text("common.daily_chart_short", { days: String(count) })}
        ></compact-rain-gauge-chart>`;
    }

    private rateChart(rateEntity: HassEntity | undefined, unit: string, language: string): TemplateResult | typeof nothing {
        const config = this.config;
        if (!config || !option(config, "show_rate_chart") || !this.rates || !rateEntity) {
            return nothing;
        }
        const hours = this.rateHours();
        const end = Date.now();
        const start = end - hours * HOUR;
        // What the sensor has said since the last fetch comes from its own state.
        const points = [...this.rates];
        const live = valueOf(rateEntity);
        const changed = Date.parse(rateEntity.last_changed);
        if (live !== null && Number.isFinite(changed) && changed > (points[points.length - 1]?.time ?? 0)) {
            points.push({ time: changed, value: live });
        }
        const perHour = unit.includes("/") ? unit : `${unit}/h`;
        const time = new Intl.DateTimeFormat(language, {
            hour: "numeric",
            minute: "2-digit",
            ...(hours > 24 ? { weekday: "short" } : {}),
            timeZone: this.hass?.config?.time_zone,
        });
        // A reading from before the chart's start holds until the next one, so the chart starts with it.
        const items: ChartItem[] = points
            .filter((point, index) => point.time >= start || (points[index + 1]?.time ?? end) > start)
            .map((point) => ({
                time: Math.max(point.time, start),
                value: point.value,
                label: `${time.format(point.time)}: ${amountText(point.value, perHour, language)}`,
            }));
        return html`<compact-rain-gauge-chart
            class="chart rate-chart"
            kind="line"
            .items=${items}
            .start=${start}
            .end=${end}
            .floor=${isInches(unit.split("/")[0]) ? 0.05 : 1}
            .heading=${this.text("common.rate_chart", { hours: String(hours) })}
            .brief=${this.text("common.rate_chart_short", { hours: String(hours) })}
        ></compact-rain-gauge-chart>`;
    }

    /** The colours given in the configuration; without them the card follows the theme. */
    private colours(): string {
        const styles: string[] = [];
        if (this.config?.fill_drop_colour) {
            styles.push(`--rain-gauge-fill-color: ${this.config.fill_drop_colour}`);
        }
        if (this.config?.border_colour) {
            styles.push(`--rain-gauge-outline-color: ${this.config.border_colour}`);
        }
        return styles.join("; ");
    }

    private act(gesture: Gesture): void {
        this.dispatchEvent(
            new CustomEvent("hass-action", {
                detail: { config: this.config, action: gesture },
                bubbles: true,
                composed: true,
            }),
        );
    }

    private text(key: string, values: Record<string, string> = {}): string {
        return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), translate(this.language(), key));
    }

    private language(): string {
        return this.config?.language || this.hass?.locale?.language || this.hass?.language || browserLanguage();
    }

    static get styles(): CSSResultGroup {
        return css`
            :host {
                display: block;
                height: 100%;
            }

            ha-card {
                display: block;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
                container: gauge / inline-size;
            }

            ha-card.tappable {
                cursor: pointer;
            }

            ha-card:focus-visible {
                outline: 2px solid var(--primary-color);
                outline-offset: -2px;
            }

            .content {
                display: flex;
                flex-direction: column;
                height: 100%;
                overflow: hidden;
            }

            .gauge {
                flex: 1 1 auto;
                display: flex;
                align-items: stretch;
                gap: 12px;
                min-height: 56px;
                padding: 8px 14px 8px 10px;
                box-sizing: border-box;
            }

            /*
       * As tall as the gauge and as wide as that height calls for. The drawing is laid over the box rather than
       * in it, so it never makes the gauge taller: the grid, or the figures, decide the height.
       */
            .drop {
                flex: none;
                position: relative;
                width: var(--drop-width, 52px);
                max-width: 45%;
                min-height: 36px;
            }

            .drop svg {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                overflow: visible;
            }

            .level {
                transition: transform 0.6s ease;
            }

            .fill {
                fill: var(--rain-gauge-fill-color, #04acff);
            }

            .wave {
                animation: wave 2.4s linear infinite;
            }

            @keyframes wave {
                to {
                    transform: translateX(-25px);
                }
            }

            .falling {
                fill: var(--rain-gauge-fill-color, #04acff);
                opacity: 0;
                animation: fall 1.35s ease-in infinite;
            }

            @keyframes fall {
                0% {
                    opacity: 0;
                    transform: translateY(0);
                }
                15% {
                    opacity: 0.9;
                }
                100% {
                    opacity: 0.9;
                    transform: translateY(var(--fall));
                }
            }

            .mark {
                stroke: var(--rain-gauge-outline-color, var(--secondary-text-color));
                stroke-width: 1px;
                vector-effect: non-scaling-stroke;
                opacity: 0.6;
            }

            .outline {
                fill: none;
                stroke: var(--rain-gauge-outline-color, var(--secondary-text-color));
                stroke-width: 2px;
                vector-effect: non-scaling-stroke;
                stroke-linejoin: round;
            }

            .figures {
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 4px;
                min-width: 0;
            }

            .figure {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }

            .label,
            .value {
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .label {
                font-size: 12px;
                line-height: 16px;
                color: var(--secondary-text-color);
            }

            .value {
                font-size: 16px;
                line-height: 20px;
                font-weight: 500;
                color: var(--primary-text-color);
            }

            /*
       * The bars stand on the text's baseline and reach the top of its digits, whatever the font: an inline
       * flex box sits on the baseline, and a cap is the height of a capital or a digit.
       */
            .intensity {
                display: inline-flex;
                align-items: flex-end;
                vertical-align: baseline;
                gap: 2px;
                height: 0.7em;
                height: 1cap;
                margin-left: 6px;
            }

            .intensity i {
                display: block;
                width: 3px;
                border-radius: 1px;
                background: var(--rain-gauge-fill-color, #04acff);
                opacity: 0.25;
            }

            .intensity i:nth-child(1) {
                height: 40%;
            }
            .intensity i:nth-child(2) {
                height: 70%;
            }
            .intensity i:nth-child(3) {
                height: 100%;
            }
            .intensity i.on {
                opacity: 1;
            }

            /*
       * The parts under the drop are tiles of their own, as the packages are in package-tracker-card: the
       * totals, and each chart with its heading under it.
       */
            .extras,
            .chart {
                flex: none;
                margin: 0 10px 8px;
                padding: 6px 10px;
                border-radius: 8px;
                background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
            }

            /* The totals in equal columns, each its name over its amount, with a thin line between them. */
            .extras {
                display: grid;
                grid-auto-columns: minmax(0, 1fr);
                grid-auto-flow: column;
                column-gap: 21px;
                line-height: 16px;
            }

            .extra {
                position: relative;
                display: flex;
                flex-direction: column;
                min-width: 0;
            }

            /* The line sits in the middle of the gap, so that every column is as wide as the others. */
            .extra + .extra::before {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: -11px;
                border-left: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
            }

            .extra .label {
                font-size: 11px;
            }

            .extra .amount {
                font-size: 13px;
                font-weight: 500;
                color: var(--primary-text-color);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .chart {
                padding-top: 8px;
            }

            .content.hide-extras .extras,
            .content.hide-daily-chart .daily-chart,
            .content.hide-rate-chart .rate-chart {
                display: none;
            }

            .missing {
                padding: 12px 16px;
                color: var(--error-color);
            }

            /* The short names are for the narrowest card. */
            .brief {
                display: none;
            }

            /* Beside the drop but with little room: the drop's own label gets short too. */
            @container gauge (max-width: 229px) {
                .total .long {
                    display: none;
                }
                .total .brief {
                    display: inline;
                }
            }

            /* Too narrow for the totals side by side: one a row, the name left and the amount right. */
            @container gauge (max-width: 299px) {
                .extras {
                    grid-auto-flow: row;
                }
                .extra {
                    flex-direction: row;
                    justify-content: space-between;
                    gap: 8px;
                }
                .extra + .extra::before {
                    display: none;
                }
                .extra .label {
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            }

            /* Room to spare: larger figures. */
            @container gauge (min-width: 260px) {
                .gauge {
                    gap: 16px;
                    padding: 10px 18px 10px 14px;
                }
                .figure .label {
                    font-size: 14px;
                    line-height: 18px;
                }
                .value {
                    font-size: 22px;
                    line-height: 28px;
                }
                .extras,
                .chart {
                    margin: 0 14px 10px;
                    padding-left: 12px;
                    padding-right: 12px;
                }
            }

            /* Narrow: the drop above the figures, without their labels. */
            @container gauge (max-width: 179px) {
                .gauge {
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    padding: 8px 6px;
                }
                .drop {
                    flex: 1 1 auto;
                    width: 100%;
                    max-width: 100%;
                    min-height: 44px;
                }
                .figures {
                    align-items: center;
                    gap: 0;
                    max-width: 100%;
                }
                .figure {
                    align-items: center;
                    max-width: 100%;
                }
                .figure .label,
                .long {
                    display: none;
                }
                .brief {
                    display: inline;
                }
                .value {
                    font-size: 14px;
                    line-height: 18px;
                }
                .rate .value {
                    font-size: 12px;
                    line-height: 16px;
                    font-weight: 400;
                    color: var(--secondary-text-color);
                }
                .extras,
                .chart {
                    margin: 0 4px 4px;
                    padding-left: 6px;
                    padding-right: 6px;
                }
                .extra {
                    gap: 4px;
                }
                .extra .amount {
                    font-size: 12px;
                }
            }

            /*
       * Low, such as one row of a sections view: the drop beside the figures whatever the width, and the
       * figures without labels, the rate under the total.
       */
            .gauge.short {
                flex-direction: row;
                align-items: stretch;
                gap: 8px;
                padding: 6px 10px 6px 8px;
            }
            .gauge.short .drop {
                flex: none;
                width: var(--drop-width, 34px);
                min-height: 0;
            }
            .gauge.short .figures {
                align-items: stretch;
                gap: 0;
            }
            .gauge.short .figure {
                align-items: flex-start;
            }
            .gauge.short .label,
            .gauge.short .intensity {
                display: none;
            }
            .gauge.short .value {
                font-size: 15px;
                line-height: 19px;
            }
            .gauge.short .rate .value {
                font-size: 12px;
                line-height: 16px;
                font-weight: 400;
                color: var(--secondary-text-color);
            }

            /* Both low and narrow, the smallest a sections view allows: a little smaller still. */
            @container gauge (max-width: 179px) {
                .gauge.short {
                    gap: 6px;
                    padding: 6px 8px 6px 6px;
                }
                .gauge.short .value {
                    font-size: 13px;
                }
                .gauge.short .rate .value {
                    font-size: 11px;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .level {
                    transition: none;
                }
                .wave,
                .falling {
                    animation: none;
                }
            }
        `;
    }
}

/** An amount in the locale, with its unit, or a dash when it isn't known. */
function amountText(amount: number | null, unit: string, language: string): string {
    if (amount === null) {
        return "—";
    }
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(amount)} ${unit}`;
}

declare global {
    interface HTMLElementTagNameMap {
        "compact-rain-gauge-card": CompactRainGaugeCard;
    }
}
