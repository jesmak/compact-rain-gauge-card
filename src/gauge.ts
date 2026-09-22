/** Reading the rain sensors: their value and unit, how full the drop is, and how the figures are written. */
import { DEFAULT_MAX_LEVEL_MM, MM_PER_INCH } from './const';
import type { HassEntity, HomeAssistant } from './hass';
import type { CompactRainGaugeCardConfig } from './types';

/** Shown in place of a figure the sensor can't give. */
export const NO_VALUE = '—';

/** The sensor's number, or nothing while it is unavailable or unknown. */
export function valueOf(entity: HassEntity | undefined): number | null {
  if (!entity) {
    return null;
  }
  const value = Number.parseFloat(entity.state);
  return Number.isFinite(value) ? value : null;
}

/** The sensor's own unit; one without a unit is millimetres, or inches when `is_imperial` says so. */
export function unitOf(entity: HassEntity | undefined, config: CompactRainGaugeCardConfig): string {
  const unit = entity?.attributes.unit_of_measurement;
  if (typeof unit === 'string' && unit.trim() !== '') {
    return unit.trim();
  }
  return config.is_imperial ? 'in' : 'mm';
}

export function isInches(unit: string): boolean {
  return ['in', 'inch', 'inches', '″', '"'].includes(unit.toLowerCase());
}

/** The rain that fills the drop, in the sensor's unit. */
export function maxLevelOf(config: CompactRainGaugeCardConfig, unit: string): number {
  const configured = Number(config.max_level);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return isInches(unit) ? DEFAULT_MAX_LEVEL_MM / MM_PER_INCH : DEFAULT_MAX_LEVEL_MM;
}

/** How full the drop is, from 0 to 1. More rain than the maximum fills it, and no reading leaves it empty. */
export function fillOf(value: number | null, maxLevel: number): number {
  if (value === null || value <= 0 || maxLevel <= 0) {
    return 0;
  }
  return Math.min(value / maxLevel, 1);
}

/**
 * A figure as Home Assistant would show it: in the viewer's locale and the sensor's precision, with its unit.
 * A rate whose sensor counts rain per hour in a plain amount unit, such as millimetres, gets "/h" after it.
 */
export function formatReading(
  hass: HomeAssistant,
  entity: HassEntity | undefined,
  unit: string,
  language: string,
  perHour = false,
): string {
  const value = valueOf(entity);
  if (!entity || value === null) {
    return NO_VALUE;
  }
  const hasUnit = typeof entity.attributes.unit_of_measurement === 'string';
  const text =
    hasUnit && hass.formatEntityState
      ? hass.formatEntityState(entity)
      : `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)} ${unit}`;
  return perHour && !unit.includes('/') ? `${text}/h` : text;
}

/** A rain sensor to offer when the card is added from the picker: a precipitation amount, if there is one. */
export function findRainSensor(hass: HomeAssistant | undefined): string | undefined {
  const sensors = Object.values(hass?.states ?? {}).filter(
    (entity): entity is HassEntity =>
      !!entity &&
      entity.entity_id.startsWith('sensor.') &&
      entity.attributes.device_class === 'precipitation',
  );
  const daily = sensors.find((entity) => /daily|day|today|vuorokau|päivä/i.test(entity.entity_id));
  return (daily ?? sensors[0])?.entity_id;
}
