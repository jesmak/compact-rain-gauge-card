/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { LitElement, html, TemplateResult, css, PropertyValues, CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators';
import {
  HomeAssistant,
  hasConfigOrEntityChanged,
  hasAction,
  ActionHandlerEvent,
  handleAction,
  LovelaceCardEditor,
  getLovelace,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import type { CompactRainGaugeCardConfig } from './types';
import { actionHandler } from './action-handler-directive';
import { CARD_VERSION } from './const';
import { localize } from './localize/localize';

/* eslint no-console: 0 */
console.info(
  `%c  COMPACT-RAIN-GAUGE-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'compact-rain-gauge-card',
  name: 'Compact rain gauge card',
  description: 'A compact rain gauge card for displaying the amount of precipitation',
});

@customElement('compact-rain-gauge-card')
export class CompactRainGaugeCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('compact-rain-gauge-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private config!: CompactRainGaugeCardConfig;

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: CompactRainGaugeCardConfig): void {
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    this.config = {
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    const entityId = this.config.entity;
    const entityState = entityId ? this.hass.states[entityId] : undefined;
    const stateValue: number = entityState ? parseFloat(entityState.state) : 0;
    let totalRainValue = stateValue;
    let maxLevelOverride: number = this.config.max_level ? this.config.max_level : 0;

    let maxLevel = 40;

    let unitOfMeasurement = 'mm';
    if (this.config.is_imperial) {
      unitOfMeasurement = 'in';
      totalRainValue = this._inches2mm(totalRainValue);
      if (maxLevelOverride > 0) {
        maxLevelOverride = this._inches2mm(maxLevelOverride);
      }
    }

    if (maxLevelOverride) {
      maxLevel = maxLevelOverride;
    }

    const rainDropBoxHeight = 188;
    let rainLevel = rainDropBoxHeight;
    if (totalRainValue > 0 && totalRainValue < maxLevel) {
      rainLevel = rainDropBoxHeight - Math.round((rainDropBoxHeight / maxLevel) * totalRainValue);
    }
    if (totalRainValue >= maxLevel) {
      rainLevel = 0;
    }

    let borderColour = '#000000';
    if (this.config.border_colour) {
      borderColour = this.config.border_colour;
    }

    let fillDropColour = '#04ACFF';
    if (this.config.fill_drop_colour) {
      fillDropColour = this.config.fill_drop_colour;
    }

    const hourlyRateEntityId = this.config.hourly_rate_entity;
    const hourlyRateEntityState = hourlyRateEntityId ? this.hass.states[hourlyRateEntityId] : undefined;
    const hourlyRateStateValue: number = hourlyRateEntityState ? parseFloat(hourlyRateEntityState.state) : 0;

    return html`
      <ha-card
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this.config.hold_action),
          hasDoubleClick: hasAction(this.config.double_tap_action),
        })}
        tabindex="0"
        .label=${`Rain Gauge: ${this.config.entity || 'No Entity Defined'}`}
      >
        <div>
          <div class="image-container">
            <svg
              version="1.1"
              id="logo"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              xml:space="preserve"
              height="80px"
              viewBox="0 0 200 200"
            >
              <defs>
                <clipPath id="drop">
                  <path
                    d="M68.2,6.7c0,0-62.4,70.9-62.4,124.7c0,32.3,28,58.4,62.4,58.4s62.4-26.2,62.4-58.4 C130.7,77.6,68.3,6.7,68.2,6.7z"
                  ></path>
                </clipPath>
              </defs>
              <g clip-path="url(#drop)">
                <g class="fill2">
                  <rect
                    width="130"
                    height="190"
                    style="fill:${fillDropColour};"
                    transform="translate(0, ${rainLevel})"
                  />
                </g>
              </g>
              <g>
                <path
                  transform=""
                  class="st0"
                  d="M68.2,6.7c0,0-62.4,70.9-62.4,124.7c0,32.3,28,58.4,62.4,58.4s62.4-26.2,62.4-58.4 C130.7,77.6,68.3,6.7,68.2,6.7z"
                  style="fill:none; stroke:${borderColour}; stroke-width:4; stroke-miterlimit:5;"
                ></path>
              </g>
            </svg>
          </div>
          <div class="text-container">
            <div class="title">${localize('common.total', '', '', this.config.language)}</div>
            <div class="contents">${stateValue} ${unitOfMeasurement}</div>
            ${this._showHourlyRate(hourlyRateEntityState, hourlyRateStateValue, unitOfMeasurement)}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _showHourlyRate(
    hourlyRateEntityState: any | undefined,
    hourlyRateStateValue: number,
    unitOfMeasurement: string,
  ): TemplateResult | void {
    if (hourlyRateEntityState === undefined) return;
    return html`
      <div class="title">${localize('common.rate', '', '', this.config.language)}</div>
      <div class="contents">${hourlyRateStateValue} ${unitOfMeasurement}/h</div>
    `;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this.config && ev.detail.action) {
      handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  private _inches2mm(value: number): number {
    const valueConverted = value * 25.4;
    return Math.round((valueConverted + Number.EPSILON) * 100) / 100;
  }

  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css`
      .title {
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
      }

      .contents {
        line-height: 11px;
        padding-bottom: 5px;
      }

      .image-container {
        padding: 5px 0 0 8px;
        display: inline-block;
        width: 73px;
      }

      .text-container {
        margin-left: -10px;
        font-size: 11px;
        max-width: calc(100% - 73px);
        display: inline-block;
        position: absolute;
        padding-top: 8px;
      }
    `;
  }
}
