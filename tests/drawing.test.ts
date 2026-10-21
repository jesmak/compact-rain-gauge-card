import { describe, expect, it } from "vitest";

import { indexAt, marksUnder, roundValues } from "../src/chart";
import type { CompactRainGaugeChart } from "../src/chart";
import { levelY, scaleMarks, scaleStep } from "../src/drop";
import { barsOf, intensityOf, rateFloor } from "../src/intensity";

describe("the scale", () => {
    it("marks a few round values under the full level", () => {
        expect(scaleStep(40)).toBe(10);
        expect(scaleMarks(40)).toEqual([0.25, 0.5, 0.75]);
        expect(scaleMarks(20).length).toBe(3);
        expect(scaleMarks(1.575).map((mark) => Math.round(mark * 1.575 * 100) / 100)).toEqual([0.5, 1, 1.5]);
        expect(scaleMarks(0)).toEqual([]);
    });

    it("runs from the bottom of the drop to its tip", () => {
        expect(levelY(0)).toBe(126);
        expect(levelY(1)).toBe(4);
    });
});

describe("the intensity", () => {
    it("follows the usual limits in millimetres an hour", () => {
        expect(intensityOf(0, "mm")).toBe("none");
        expect(intensityOf(null, "mm")).toBe("none");
        expect(intensityOf(1, "mm")).toBe("light");
        expect(intensityOf(5, "mm/h")).toBe("moderate");
        expect(intensityOf(10, "mm/h")).toBe("heavy");
        expect(intensityOf(60, "mm/h")).toBe("violent");
    });

    it("turns inches and other periods into millimetres an hour", () => {
        expect(intensityOf(0.2, "in/h")).toBe("moderate");
        expect(intensityOf(0.1, "mm/min")).toBe("moderate");
        expect(intensityOf(48, "mm/d")).toBe("light");
    });

    it("fills a bar for each step, three at most", () => {
        expect(["none", "light", "moderate", "heavy", "violent"].map((level) => barsOf(level as never))).toEqual([0, 1, 2, 3, 3]);
    });
});

describe("pointing at a chart", () => {
    const items = [0, 10, 20].map((time) => ({ time, value: 1, label: "" }));

    it("picks the bar in that slot", () => {
        expect(indexAt("bars", items, 0.1, 0, 0)).toBe(0);
        expect(indexAt("bars", items, 0.5, 0, 0)).toBe(1);
        expect(indexAt("bars", items, 0.99, 0, 0)).toBe(2);
    });

    it("picks the reading in force at that moment of a line", () => {
        expect(indexAt("line", items, 0.45, 0, 30)).toBe(1);
        expect(indexAt("line", items, 0.9, 0, 30)).toBe(2);
    });
});

describe("the marker lines", () => {
    it("are taken from round values, 1, 2 and 5 times a power of ten, largest first", () => {
        expect(roundValues(12)).toEqual([10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]);
        expect(roundValues(0.1)).toEqual([0.1, 0.05, 0.02, 0.01]);
    });

    it.each([
        [2, [1, 2]],
        [3.3, [2]],
        [7, [2, 5]],
        [12, [5, 10]],
        [30, [20]],
        [8.4375, [2, 5]],
        [150, [100]],
        [1, [0.5, 1]],
        [0.1, [0.05, 0.1]],
        [0.05, [0.02, 0.05]],
        [24, [10, 20]],
        [1.2, [0.5, 1]],
        [0.005, []],
    ])("reach up the chart from the largest round value, apart enough for their values, at a top of %s", (top, marks) => {
        expect(marksUnder(top, roundValues(top))).toEqual(marks);
    });
});

describe("the chart's axis", () => {
    it.each([
        ["fi", "bars", [0.2, 0.6], 1, ["0,5", "1"]],
        ["en", "line", [0.2], 1, ["0.5", "1"]],
    ] as const)(
        "labels each line in the chart's language (%s, %s), at the line's height, with an unseen sizer for each label",
        async (language, kind, values, floor, texts) => {
            const element = document.createElement("compact-rain-gauge-chart") as CompactRainGaugeChart;
            element.kind = kind;
            element.floor = floor;
            element.language = language;
            element.start = 0;
            element.end = values.length;
            element.items = values.map((value, index) => ({ time: index, value, label: "" }));
            document.body.append(element);
            await element.updateComplete;
            const root = element.shadowRoot as ShadowRoot;
            const labels = [...root.querySelectorAll<HTMLElement>(".value")];
            const lines = [...root.querySelectorAll(".mark")];
            expect(labels.map((label) => label.textContent)).toEqual(texts);
            expect(labels.map((label) => parseFloat(label.style.top))).toEqual(
                lines.map((line) => (Number(line.getAttribute("y1")) / 32) * 100),
            );
            expect([...root.querySelectorAll(".sizer")].map((sizer) => sizer.textContent)).toEqual(texts);
            element.remove();
        },
    );

    it("is left out when no line fits, and the plot takes the whole width", async () => {
        const element = document.createElement("compact-rain-gauge-chart") as CompactRainGaugeChart;
        element.floor = 0.005;
        element.items = [];
        document.body.append(element);
        await element.updateComplete;
        expect(element.shadowRoot?.querySelector(".axis")).toBeNull();
        expect(element.shadowRoot?.querySelectorAll(".mark")).toHaveLength(0);
        element.remove();
    });
});

describe("the rate chart's floor", () => {
    it.each([
        ["mm/h", 1],
        ["mm", 1],
        ["mm/min", 1 / 60],
        ["mm/minute", 1 / 60],
        ["mm/d", 24],
        ["mm/day", 24],
        ["in/h", 0.05],
        ["in/min", 0.05 / 60],
        ["in/d", 1.2],
    ])("is 1 mm or 0.05 in an hour, in the sensor's own unit, %s", (unit, floor) => {
        expect(rateFloor(unit)).toBeCloseTo(floor, 10);
    });
});
