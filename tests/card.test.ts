import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fitCard } from "../src/compact-rain-gauge-card";
import type { CompactRainGaugeCard } from "../src/compact-rain-gauge-card";
import type { HomeAssistant } from "../src/hass";
import type { CompactRainGaugeCardConfig } from "../src/types";

const RAIN = "sensor.rain_today";
const RATE = "sensor.rain_rate";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** What the recorder answers: a day's rain for each of the last days, and the rate's readings. */
interface Recorder {
    days?: number[];
    rates?: Array<[number, number]>;
    calls?: Array<Record<string, unknown>>;
}

function recorder({ days = [], rates = [], calls = [] }: Recorder) {
    return async <T>(message: Record<string, unknown>): Promise<T> => {
        calls.push(message);
        const now = Date.now();
        if (message.type === "recorder/statistics_during_period") {
            // days[0] is today, days[1] yesterday, and so on.
            return { [RAIN]: days.map((max, ago) => ({ start: now - ago * DAY, max })) } as T;
        }
        return {
            [RATE]: rates.map(([hoursAgo, value]) => ({ s: String(value), lu: (now - hoursAgo * HOUR) / 1000 })),
        } as T;
    };
}

async function settled(element: CompactRainGaugeCard): Promise<void> {
    await element.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
}

function hass(rain = "10", rate = "0.4", language = "en", history: Recorder = {}): HomeAssistant {
    const entity = (id: string, state: string) => ({
        entity_id: id,
        state,
        last_changed: "2026-09-22",
        attributes: { unit_of_measurement: "mm", device_class: "precipitation" },
    });
    return {
        locale: { language },
        states: { [RAIN]: entity(RAIN, rain), [RATE]: entity(RATE, rate) },
        formatEntityState: (entity) => `${entity.state} ${entity.attributes.unit_of_measurement}`,
        callWS: recorder(history),
    };
}

async function card(state: HomeAssistant, config: Partial<CompactRainGaugeCardConfig> = {}): Promise<CompactRainGaugeCard> {
    const element = document.createElement("compact-rain-gauge-card") as CompactRainGaugeCard;
    element.setConfig({ type: "custom:compact-rain-gauge-card", entity: RAIN, ...config } as never);
    element.hass = state;
    document.body.append(element);
    await element.updateComplete;
    return element;
}

function root(element: CompactRainGaugeCard): ShadowRoot {
    if (!element.shadowRoot) {
        throw new Error("the card rendered nothing");
    }
    return element.shadowRoot;
}

let content: HTMLElement;
/** How many parts the fitting has left out so far. */
const hidden = () => [...content.classList].filter((name) => name.startsWith("hide-")).length;

/**
 * A card's inside with made-up sizes: the card's height, the content's, the height the figures get, and the
 * height their labels need.
 */
function layout(sizes: { card: number; content: () => number; figures?: () => number; need?: number; gauge?: number }): {
    content: HTMLElement;
    gauge: HTMLElement;
} {
    content = document.createElement("div");
    const gauge = document.createElement("div");
    gauge.className = "gauge";
    const figures = document.createElement("div");
    figures.className = "figures";
    gauge.append(figures);
    content.append(gauge);
    // Styles are only computed for what is in the document.
    document.body.append(content);
    const box = (element: HTMLElement, client: () => number, scroll: () => number) => {
        Object.defineProperty(element, "clientHeight", { get: client, configurable: true });
        Object.defineProperty(element, "scrollHeight", { get: scroll, configurable: true });
    };
    const given = sizes.figures ?? (() => 76);
    const need = () => (gauge.classList.contains("short") ? 36 : (sizes.need ?? 76));
    box(content, () => sizes.card, sizes.content);
    box(
        gauge,
        () => sizes.gauge ?? given(),
        () => sizes.gauge ?? given(),
    );
    box(figures, given, () => Math.max(need(), given()));
    return { content, gauge };
}

function fillTop(element: CompactRainGaugeCard): number {
    const style = root(element).querySelector(".level")?.getAttribute("style") ?? "";
    return Number(/translateY\(([-\d.]+)px\)/.exec(style)?.[1]);
}

function texts(element: CompactRainGaugeCard): string[] {
    return [...root(element).querySelectorAll(".value")].map((node) => node.textContent?.trim() ?? "");
}

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("the gauge", () => {
    it("shows the total and the rate, with their labels", async () => {
        const element = await card(hass(), { hourly_rate_entity: RATE });
        expect(texts(element)).toEqual(["10 mm", "0.4 mm/h"]);
        const labels = [...root(element).querySelectorAll(".figure .label")].map(
            (node) => node.querySelector(".long")?.textContent ?? node.textContent,
        );
        expect(labels).toEqual(["Total", "Rate"]);
    });

    it("shows only the total without a rate sensor", async () => {
        expect(texts(await card(hass()))).toEqual(["10 mm"]);
    });

    it("fills the drop in proportion to the full level", async () => {
        // The fill rises from y 126 (empty) to y 4 (full): a quarter full is a quarter of the way.
        expect(fillTop(await card(hass("10")))).toBeCloseTo(126 - 0.25 * 122);
        expect(fillTop(await card(hass("10"), { max_level: 10 }))).toBeCloseTo(4);
        expect(fillTop(await card(hass("0")))).toBeCloseTo(126);
    });

    it("stays empty and shows a dash while the sensor is unavailable", async () => {
        const element = await card(hass("unavailable"));
        expect(fillTop(element)).toBeCloseTo(126);
        expect(texts(element)).toEqual(["—"]);
    });

    it("takes its own language and colours", async () => {
        const element = await card(hass("10", "0", "en"), {
            language: "fi",
            hourly_rate_entity: RATE,
            fill_drop_colour: "teal",
            border_colour: "rgba(255,255,255,.1)",
        });
        const labels = [...root(element).querySelectorAll(".figure .label")].map(
            (node) => node.querySelector(".long")?.textContent ?? node.textContent,
        );
        expect(labels).toEqual(["Kokonaiskertymä", "Sademäärä"]);
        expect(root(element).querySelector(".total .brief")?.textContent).toBe("Kertymä");
        const style = root(element).querySelector("ha-card")?.getAttribute("style");
        expect(style).toContain("--rain-gauge-fill-color: teal");
        expect(style).toContain("--rain-gauge-outline-color: rgba(255,255,255,.1)");
    });

    it("says so when the sensor isn't there", async () => {
        const element = await card(hass(), { entity: "sensor.gone" });
        expect(root(element).querySelector(".missing")?.textContent).toContain("sensor.gone");
    });

    it("gives every card a drop clip of its own", async () => {
        const one = await card(hass());
        const other = await card(hass());
        const id = (element: CompactRainGaugeCard) => root(element).querySelector("clipPath")?.id;
        expect(id(one)).not.toEqual(id(other));
    });

    it("refuses a configuration without a sensor", () => {
        const element = document.createElement("compact-rain-gauge-card") as CompactRainGaugeCard;
        expect(() => element.setConfig({ type: "custom:compact-rain-gauge-card" } as never)).toThrow();
    });
});

describe("the size of the card", () => {
    it("asks for half a sections row width and two rows, and works down to a quarter and one row", async () => {
        expect((await card(hass())).getGridOptions()).toEqual({
            columns: 6,
            rows: 2,
            min_columns: 3,
            min_rows: 1,
        });
    });

    it("asks for a row more for the totals and for each chart", async () => {
        const element = await card(hass(), {
            hourly_rate_entity: RATE,
            show_daily_chart: true,
            show_rate_chart: true,
        });
        expect(element.getGridOptions().rows).toBe(4);
        element.setConfig({ type: "custom:compact-rain-gauge-card", entity: RAIN, show_week: true } as never);
        expect(element.getGridOptions().rows).toBe(3);
    });

    it("leaves out the rate chart first, then the daily one, then the extra totals, until the rest fits", () => {
        const { content } = layout({ card: 200, content: () => 300 - hidden() * 60 });
        fitCard(content);
        expect([...content.classList]).toEqual(["hide-rate-chart", "hide-daily-chart"]);
    });

    it("leaves out a part rather than squeeze the drop out of its labels", () => {
        // Everything fits, but the figures only get the height their labels need once the rate chart is out.
        const { content, gauge } = layout({
            card: 200,
            content: () => 200,
            figures: () => (hidden() > 0 ? 80 : 60),
        });
        fitCard(content);
        expect([...content.classList]).toEqual(["hide-rate-chart"]);
        expect(gauge.classList.contains("short")).toBe(false);
    });

    it("drops the labels only when the card is too low for them", () => {
        // One row of a sections view: 56 px, and the labelled figures need 76.
        const low = layout({ card: 56, content: () => 56, figures: () => 40, need: 76 });
        fitCard(low.content);
        expect(low.gauge.classList.contains("short")).toBe(true);

        // A masonry view: the figures make the height, so they always fit, even with one figure only.
        const free = layout({ card: 60, content: () => 60, figures: () => 52, need: 52 });
        fitCard(free.content);
        expect(free.gauge.classList.contains("short")).toBe(false);
        expect(free.content.classList.length).toBe(0);
    });

    it("makes the drop as wide as the height it gets calls for", () => {
        const { content, gauge } = layout({ card: 120, content: () => 120, figures: () => 104, gauge: 120 });
        gauge.style.paddingTop = "8px";
        gauge.style.paddingBottom = "8px";
        fitCard(content);
        expect(gauge.style.getPropertyValue("--drop-width")).toBe(`${Math.round((104 * 100) / 130)}px`);
    });

    it("measures its own width, so its layout follows the space it is given", async () => {
        const styles = (customElements.get("compact-rain-gauge-card") as unknown as { styles: { cssText: string } }).styles.cssText;
        expect(styles).toContain("container: gauge / inline-size");
        expect(styles).toMatch(/@container gauge \(max-width: 179px\)/);
        expect(styles).toMatch(/@container gauge \(min-width: 260px\)/);
    });
});

describe("tapping, holding and double tapping", () => {
    let actions: string[];
    const listen = (element: CompactRainGaugeCard) =>
        element.addEventListener("hass-action", (event) => {
            actions.push((event as CustomEvent<{ action: string }>).detail.action);
        });
    const cardOf = (element: CompactRainGaugeCard) => root(element).querySelector("ha-card") as HTMLElement;

    beforeEach(() => {
        actions = [];
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("hands a tap to Home Assistant at once, with the card configuration", async () => {
        const element = await card(hass());
        let detail: { config?: CompactRainGaugeCardConfig } = {};
        element.addEventListener("hass-action", (event) => {
            detail = (event as CustomEvent).detail;
        });
        cardOf(element).click();
        expect(detail.config?.entity).toBe(RAIN);
    });

    it("is a button that the keyboard can press", async () => {
        const element = await card(hass());
        listen(element);
        const haCard = cardOf(element);
        expect(haCard.getAttribute("role")).toBe("button");
        expect(haCard.getAttribute("tabindex")).toBe("0");
        haCard.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(actions).toEqual(["tap"]);
    });

    it("is no button when tapping does nothing", async () => {
        const haCard = cardOf(await card(hass(), { tap_action: { action: "none" } }));
        expect(haCard.hasAttribute("role")).toBe(false);
        expect(haCard.hasAttribute("tabindex")).toBe(false);
    });

    it("tells a hold from a tap when it has a hold action", async () => {
        const element = await card(hass(), { hold_action: { action: "more-info" } });
        listen(element);
        const haCard = cardOf(element);
        haCard.dispatchEvent(new Event("pointerdown"));
        vi.advanceTimersByTime(600);
        haCard.dispatchEvent(new Event("pointerup"));
        haCard.click();
        expect(actions).toEqual(["hold"]);
    });

    it("tells a double tap from two taps when it has a double tap action", async () => {
        const element = await card(hass(), { double_tap_action: { action: "toggle" } });
        listen(element);
        const haCard = cardOf(element);
        haCard.click();
        haCard.click();
        vi.advanceTimersByTime(300);
        expect(actions).toEqual(["double_tap"]);

        haCard.click();
        vi.advanceTimersByTime(300);
        expect(actions).toEqual(["double_tap", "tap"]);
    });
});

describe("what the recorder adds", () => {
    const thirtyDays = (peak: number) => Array.from({ length: 30 }, (_, ago) => (ago === 3 ? peak : 1));

    it("shows yesterday's rain and that of the last 7 and 30 days, today's from the sensor", async () => {
        const element = await card(hass("10", "0", "en", { days: thirtyDays(20) }), {
            show_yesterday: true,
            show_week: true,
            show_month: true,
        });
        await settled(element);
        const extras = [...root(element).querySelectorAll(".extra")].map(
            (node) => `${node.querySelector(".long")?.textContent} ${node.querySelector(".amount")?.textContent}`,
        );
        // Today is 10 from the sensor; the rest are 1 but for 20 three days ago.
        expect(extras).toEqual(["Yesterday 1 mm", "Past week 35 mm", "Past month 58 mm"]);
    });

    it("asks the recorder nothing when no option needs it", async () => {
        const calls: Array<Record<string, unknown>> = [];
        const element = await card(hass("10", "0", "en", { calls }));
        await settled(element);
        expect(calls).toEqual([]);
    });

    it("draws the days as bars and the rate as a line, as long as asked", async () => {
        const element = await card(
            hass("10", "0.4", "en", {
                days: thirtyDays(20),
                rates: [
                    [30, 1],
                    [2, 0.4],
                ],
            }),
            {
                hourly_rate_entity: RATE,
                show_daily_chart: true,
                daily_chart_days: 7,
                show_rate_chart: true,
                rate_chart_hours: 12,
            },
        );
        await settled(element);
        const daily = root(element).querySelector(".daily-chart") as HTMLElement & {
            items: unknown[];
            heading: string;
        };
        const rate = root(element).querySelector(".rate-chart") as HTMLElement & {
            items: unknown[];
            heading: string;
        };
        expect(daily.items).toHaveLength(7);
        expect(daily.heading).toBe("Rain, last 7 days");
        // The reading from 30 hours ago still holds when the 12 hours start; the live state comes last.
        expect(rate.items.length).toBeGreaterThanOrEqual(2);
        expect(rate.heading).toBe("Rain rate, last 12 h");
    });
});

describe("the drop", () => {
    it("has marks at round values, unless told not to", async () => {
        expect(root(await card(hass())).querySelectorAll(".mark")).toHaveLength(3);
        const plain = await card(hass(), { show_scale: false });
        expect(root(plain).querySelectorAll(".mark")).toHaveLength(0);
    });

    it("moves while the rate says it rains, unless told not to", async () => {
        const raining = await card(hass("10", "2"), { hourly_rate_entity: RATE });
        expect(root(raining).querySelector(".wave")).not.toBeNull();
        expect(root(raining).querySelectorAll(".falling").length).toBeGreaterThan(0);
        const still = await card(hass("10", "2"), { hourly_rate_entity: RATE, animate_rain: false });
        expect(root(still).querySelector(".wave")).toBeNull();
        const dry = await card(hass("10", "0"), { hourly_rate_entity: RATE });
        expect(root(dry).querySelector(".wave")).toBeNull();
    });

    it("shows how hard it rains beside the rate, unless told not to", async () => {
        const element = await card(hass("10", "5"), { hourly_rate_entity: RATE });
        const indicator = root(element).querySelector(".intensity");
        expect(indicator?.getAttribute("title")).toBe("Moderate rain");
        expect(indicator?.querySelectorAll("i.on")).toHaveLength(2);
        const plain = await card(hass("10", "5"), { hourly_rate_entity: RATE, show_intensity: false });
        expect(root(plain).querySelector(".intensity")).toBeNull();
    });
});

describe("the narrowest card", () => {
    it("has short names for the totals and the charts beside the long ones", async () => {
        const element = await card(hass("10", "0", "fi", { days: [1, 2, 3, 4, 5, 6, 7, 8] }), {
            hourly_rate_entity: RATE,
            show_yesterday: true,
            show_week: true,
            show_month: true,
            show_daily_chart: true,
            show_rate_chart: true,
        });
        await settled(element);
        const names = (selector: string) => [...root(element).querySelectorAll(`.extra ${selector}`)].map((node) => node.textContent);
        expect(names(".long")).toEqual(["Eilen", "Edellinen vko", "Edellinen kk"]);
        expect(names(".brief")).toEqual(["1 pv", "7 pv", "30 pv"]);
        const daily = root(element).querySelector(".daily-chart") as HTMLElement & { brief: string };
        const rate = root(element).querySelector(".rate-chart") as HTMLElement & { brief: string };
        expect(daily.brief).toBe("Määrä, 14 pv");
        expect(rate.brief).toBe("Voimakkuus, 24 h");
    });
});
