/**
 * A small chart under the gauge: bars of the rain day by day, or the rain rate over the last hours as a line.
 * Pointing at it, or touching it, shows a bubble with the value there. Touching a chart doesn't open the
 * card's action, so it can be read on a phone.
 */
import { LitElement, css, html, nothing, svg } from "lit";
import type { CSSResultGroup, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface ChartItem {
    time: number;
    value: number | null;
    /** What the bubble says about it: its date or time, and its value. */
    label: string;
}

const WIDTH = 100;
const HEIGHT = 32;
/** Room above the highest value, so a peak doesn't touch the top. */
const TOP = 2;
/** The plot's height in pixels, as in the styles below. */
const PLOT_HEIGHT = 24;
/** The least room in pixels between two marker lines, and between the lowest and the baseline, so their values fit. */
const MARK_GAP = 10;
const BASELINE_GAP = 5;

@customElement("compact-rain-gauge-chart")
export class CompactRainGaugeChart extends LitElement {
    @property() public kind: "bars" | "line" = "bars";
    @property({ attribute: false }) public items: ChartItem[] = [];
    /** The time span of a line chart; bars take one slot each. */
    @property({ type: Number }) public start = 0;
    @property({ type: Number }) public end = 0;
    /** The least the chart's top stands for, so a dry spell draws low rather than filling the chart. */
    @property({ type: Number }) public floor = 1;
    @property() public heading = "";
    /** A shorter heading for a chart too narrow for the long one. */
    @property() public brief = "";
    /** The language the marker lines' values are written in. */
    @property() public language = "en";
    @state() private active?: number;

    protected render(): TemplateResult {
        const values = this.items.map((item) => item.value ?? 0);
        const top = Math.max(this.floor, ...values);
        const active = this.active === undefined ? undefined : this.items[this.active];
        const x = active === undefined ? 0 : this.xOf(this.active ?? 0);
        const marks = marksUnder(top, roundValues(top));
        const number = new Intl.NumberFormat(this.language);
        const y = (value: number) => HEIGHT - heightOf(value, top);
        return html`
            <div class="frame">
                ${
                    marks.length === 0
                        ? nothing
                        : html`<div class="axis">
                              ${marks.map((mark) => html`<span class="sizer">${number.format(mark)}</span>`)}
                              ${marks.map(
                                  (mark) =>
                                      html`<span class="value" style="top: ${(y(mark) / HEIGHT) * 100}%">${number.format(mark)}</span>`,
                              )}
                          </div>`
                }
                <div
                    class="plot"
                    @pointermove=${this.point}
                    @pointerdown=${(event: PointerEvent) => {
                        event.stopPropagation();
                        this.point(event);
                    }}
                    @pointerleave=${() => (this.active = undefined)}
                    @click=${(event: Event) => event.stopPropagation()}
                >
                    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
                        ${marks.map((mark) => svg`<line class="mark" x1="0" x2=${WIDTH} y1=${y(mark)} y2=${y(mark)}></line>`)}
                        <line class="baseline" x1="0" x2=${WIDTH} y1=${HEIGHT} y2=${HEIGHT}></line>
                        ${this.kind === "bars" ? this.bars(top) : this.line(top)}
                        ${
                            active === undefined || this.kind === "bars"
                                ? nothing
                                : svg`<line class="cursor" x1=${x} x2=${x} y1="0" y2=${HEIGHT}></line>`
                        }
                    </svg>
                    ${
                        active === undefined
                            ? nothing
                            : html`<div class="bubble" style="left: ${x}%; transform: translateX(-${x}%)">${active.label}</div>`
                    }
                </div>
            </div>
            <div class="heading"><span class="long">${this.heading}</span><span class="brief">${this.brief || this.heading}</span></div>
        `;
    }

    private bars(top: number): TemplateResult {
        const slot = WIDTH / Math.max(this.items.length, 1);
        return svg`${this.items.map((item, index) => {
            const height = item.value ? Math.max(heightOf(item.value, top), 0.8) : 0;
            return svg`<rect class=${index === this.active ? "bar active" : "bar"} x=${index * slot + slot * 0.15}
        y=${HEIGHT - height} width=${slot * 0.7} height=${height}></rect>`;
        })}`;
    }

    /** A step line: a reading holds until the next one, as the rain of an hour does. */
    private line(top: number): TemplateResult {
        const points = this.items.filter((item) => item.value !== null);
        if (points.length === 0) {
            return svg``;
        }
        const y = (value: number) => HEIGHT - heightOf(value, top);
        let path = "";
        points.forEach((point, index) => {
            const x = this.xAt(point.time);
            const value = y(point.value ?? 0);
            path += index === 0 ? `M${x} ${value}` : ` H${x} V${value}`;
        });
        path += ` H${WIDTH}`;
        const area = `${path} V${HEIGHT} H${this.xAt(points[0].time)} Z`;
        return svg`<path class="area" d=${area}></path><path class="stroke" d=${path}></path>`;
    }

    private xAt(time: number): number {
        const span = this.end - this.start;
        return span > 0 ? Math.min(Math.max(((time - this.start) / span) * WIDTH, 0), WIDTH) : 0;
    }

    private xOf(index: number): number {
        if (this.kind === "bars") {
            const slot = WIDTH / Math.max(this.items.length, 1);
            return index * slot + slot / 2;
        }
        return this.xAt(this.items[index].time);
    }

    /** The item under the pointer: the bar in its slot, or the reading in force at that moment of the line. */
    private point(event: PointerEvent): void {
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        if (box.width <= 0 || this.items.length === 0) {
            return;
        }
        const share = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 0.9999);
        this.active = indexAt(this.kind, this.items, share, this.start, this.end);
    }

    static get styles(): CSSResultGroup {
        return css`
            :host {
                display: block;
                container: chart / inline-size;
            }
            .heading {
                font-size: 11px;
                line-height: 14px;
                color: var(--secondary-text-color);
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
            .brief {
                display: none;
            }
            .frame {
                display: flex;
                align-items: flex-start;
                margin-bottom: 2px;
            }
            .plot {
                position: relative;
                flex: 1;
                min-width: 0;
                height: 24px;
                touch-action: pan-y;
            }
            .axis {
                position: relative;
                height: 24px;
                margin-right: 4px;
                font-size: 9px;
                line-height: 9px;
                color: var(--secondary-text-color);
                font-variant-numeric: tabular-nums;
            }
            /* The values, unseen and on no line, give the axis the width of the widest. */
            .sizer {
                display: block;
                height: 0;
                overflow: hidden;
                visibility: hidden;
            }
            .value {
                position: absolute;
                right: 0;
                transform: translateY(-50%);
                white-space: nowrap;
            }
            .mark {
                stroke: var(--divider-color, rgba(127, 127, 127, 0.3));
                stroke-width: 1px;
                stroke-dasharray: 2 3;
                vector-effect: non-scaling-stroke;
            }
            svg {
                display: block;
                width: 100%;
                height: 100%;
                overflow: visible;
            }
            .bar,
            .area {
                fill: var(--rain-gauge-fill-color, #04acff);
            }
            .bar {
                opacity: 0.75;
            }
            .bar.active {
                opacity: 1;
            }
            .area {
                opacity: 0.3;
            }
            .stroke {
                fill: none;
                stroke: var(--rain-gauge-fill-color, #04acff);
                stroke-width: 1.5px;
                vector-effect: non-scaling-stroke;
            }
            .baseline {
                stroke: var(--divider-color, rgba(127, 127, 127, 0.3));
                stroke-width: 1px;
                vector-effect: non-scaling-stroke;
            }
            .cursor {
                stroke: var(--secondary-text-color);
                stroke-width: 1px;
                vector-effect: non-scaling-stroke;
            }
            .bubble {
                position: absolute;
                bottom: calc(100% + 4px);
                padding: 2px 6px;
                border-radius: 6px;
                background: var(--primary-text-color);
                color: var(--card-background-color, var(--ha-card-background, #fff));
                font-size: 11px;
                line-height: 16px;
                white-space: nowrap;
                pointer-events: none;
                z-index: 1;
            }

            /* The narrow overrides come last, so that they win over the rules above. */

            /* In the narrowest cards, three or four columns of a section: the short heading, a little smaller. */
            @container chart (max-width: 130px) {
                .heading {
                    font-size: 10px;
                }
                .long {
                    display: none;
                }
                .brief {
                    display: inline;
                }
            }

            /* The narrowest of all: the heading may take two lines rather than lose its period. */
            @container chart (max-width: 100px) {
                .heading {
                    white-space: normal;
                }
            }
        `;
    }
}

/** How high a value stands in the chart, in its units, when the chart's top stands for `top`. */
function heightOf(value: number, top: number): number {
    return (value / top) * (HEIGHT - TOP);
}

/** The round values up to a top, 1, 2 and 5 times a power of ten, largest first so the lines reach up the chart. */
export function roundValues(top: number): number[] {
    const values: number[] = [];
    for (let power = -2; 10 ** power <= top; power++) {
        for (const step of [1, 2, 5]) {
            const value = parseFloat((step * 10 ** power).toPrecision(1));
            if (value <= top) {
                values.push(value);
            }
        }
    }
    return values.reverse();
}

/**
 * The values to draw marker lines at, lowest first: the candidates, taken in order of preference, that the chart
 * reaches, leaving out any too close to the baseline or to a line already kept for their values to fit.
 */
export function marksUnder(top: number, candidates: number[]): number[] {
    const pixels = (value: number) => heightOf(value, top) * (PLOT_HEIGHT / HEIGHT);
    const marks: number[] = [];
    for (const value of candidates) {
        const clear = marks.every((mark) => Math.abs(pixels(value) - pixels(mark)) >= MARK_GAP);
        if (value <= top && pixels(value) >= BASELINE_GAP && clear) {
            marks.push(value);
        }
    }
    return marks.sort((a, b) => a - b);
}

/** Which item a share of the chart's width points at. */
export function indexAt(kind: "bars" | "line", items: ChartItem[], share: number, start: number, end: number): number {
    if (kind === "bars") {
        return Math.min(Math.floor(share * items.length), items.length - 1);
    }
    const time = start + share * (end - start);
    let found = 0;
    items.forEach((item, index) => {
        if (item.time <= time) {
            found = index;
        }
    });
    return found;
}

declare global {
    interface HTMLElementTagNameMap {
        "compact-rain-gauge-chart": CompactRainGaugeChart;
    }
}
