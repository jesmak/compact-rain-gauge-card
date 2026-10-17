/**
 * The card's visual editor: the rain sensors, the language, what the card shows, its charts, and
 * what tapping it does. Home Assistant's own form draws it, so the card bundles no form components.
 */
import { LitElement, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { HomeAssistant } from "./hass";
import { MAX_RATE_CHART_HOURS } from "./history";
import { LANGUAGE_CODES, browserLanguage, translate } from "./localize/localize";
import { DEFAULTS, checkNumbers } from "./types";
import type { CompactRainGaugeCardConfig } from "./types";

interface SchemaEntry {
    name: string;
}

/** The form's data: the configuration with its defaults filled in. */
type FormData = Record<string, unknown>;

/** Keys that are left out of the configuration when they are emptied, so it stays short. */
const OPTIONAL = [
    "hourly_rate_entity",
    "max_level",
    "border_colour",
    "fill_drop_colour",
    "language",
    "daily_chart_days",
    "rate_chart_hours",
] as const;

function languageName(code: string, viewer: string): string {
    try {
        const name = new Intl.DisplayNames([viewer], { type: "language" }).of(code);
        return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
    } catch {
        return code;
    }
}

export function schema(viewer: string) {
    const sensor = { entity: { domain: "sensor" } };
    const toggle = (name: string) => ({ name, selector: { boolean: {} } });
    return [
        { name: "entity", required: true, selector: sensor },
        { name: "hourly_rate_entity", selector: sensor },
        {
            name: "language",
            selector: {
                select: {
                    mode: "dropdown",
                    options: LANGUAGE_CODES.map((code) => ({ value: code, label: languageName(code, viewer) })),
                },
            },
        },
        {
            type: "expandable",
            name: "display",
            flatten: true,
            schema: [
                { name: "max_level", selector: { number: { min: 0, step: "any", mode: "box" } } },
                toggle("is_imperial"),
                {
                    type: "grid",
                    name: "",
                    schema: [
                        toggle("animate_rain"),
                        toggle("show_scale"),
                        toggle("show_intensity"),
                        toggle("show_yesterday"),
                        toggle("show_week"),
                        toggle("show_month"),
                    ],
                },
                {
                    type: "grid",
                    name: "",
                    schema: [
                        { name: "fill_drop_colour", selector: { text: {} } },
                        { name: "border_colour", selector: { text: {} } },
                    ],
                },
            ],
        },
        {
            type: "expandable",
            name: "charts",
            flatten: true,
            schema: [
                {
                    type: "grid",
                    name: "",
                    schema: [
                        toggle("show_daily_chart"),
                        { name: "daily_chart_days", selector: { number: { min: 2, max: 60, step: 1, mode: "box" } } },
                        toggle("show_rate_chart"),
                        {
                            name: "rate_chart_hours",
                            selector: { number: { min: 1, max: MAX_RATE_CHART_HOURS, step: 1, mode: "box" } },
                        },
                    ],
                },
            ],
        },
        {
            type: "expandable",
            name: "interactions",
            flatten: true,
            schema: [
                { name: "tap_action", selector: { ui_action: { default_action: "more-info" } } },
                { name: "hold_action", selector: { ui_action: { default_action: "none" } } },
                { name: "double_tap_action", selector: { ui_action: { default_action: "none" } } },
            ],
        },
    ];
}

/** What the form shows for a configuration: the defaults filled in. */
export function formData(config: CompactRainGaugeCardConfig): FormData {
    return { ...DEFAULTS, ...config };
}

/** The configuration for what the form holds: short, without defaults or emptied options. */
export function configOf(data: FormData): CompactRainGaugeCardConfig {
    const config = { ...data } as CompactRainGaugeCardConfig;
    for (const key of OPTIONAL) {
        const value = config[key];
        if (value === undefined || value === null || String(value).trim() === "") {
            delete config[key];
        }
    }
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (config[key] === value) {
            delete config[key];
        }
    }
    return config;
}

@customElement("compact-rain-gauge-card-editor")
export class CompactRainGaugeCardEditor extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @state() private config: CompactRainGaugeCardConfig = {
        type: "custom:compact-rain-gauge-card",
        entity: "",
    };

    /** A number option the form can't show sends Home Assistant to the YAML editor instead. */
    public setConfig(config: CompactRainGaugeCardConfig): void {
        checkNumbers(config, true);
        this.config = { ...config };
    }

    protected render(): TemplateResult | typeof nothing {
        if (!this.hass) {
            return nothing;
        }
        const data = formData(this.config);
        return html`
            <ha-form
                .hass=${this.hass}
                .data=${data}
                .schema=${schema(this.language())}
                .computeLabel=${(entry: SchemaEntry) => this.text(`editor.${entry.name}`)}
                .computeHelper=${(entry: SchemaEntry) => this.helper(entry.name)}
                @value-changed=${this.valueChanged}
            ></ha-form>
        `;
    }

    private valueChanged(event: CustomEvent<{ value: FormData }>): void {
        this.config = configOf(event.detail.value);
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this.config }, bubbles: true, composed: true }));
    }

    private text(key: string): string {
        return translate(this.language(), key);
    }

    private helper(name: string): string | undefined {
        const key = `editor.${name}_helper`;
        const helper = translate(this.language(), key);
        return helper === key ? undefined : helper;
    }

    /** The editor speaks the viewer's language, not the one chosen for the card. */
    private language(): string {
        return this.hass?.locale?.language ?? this.hass?.language ?? browserLanguage();
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "compact-rain-gauge-card-editor": CompactRainGaugeCardEditor;
    }
}
