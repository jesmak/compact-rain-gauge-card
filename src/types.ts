import { ActionConfig, LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';

declare global {
  interface HTMLElementTagNameMap {
    'compact-rain-gauge-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

export interface CompactRainGaugeCardConfig extends LovelaceCardConfig {
  type: string;
  name?: string;
  border_colour?: string;
  entity?: string;
  language?: string;
  is_imperial?: boolean;
  max_level?: number;
  hourly_rate_entity?: string;
  fill_drop_colour?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
