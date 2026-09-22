/**
 * How hard it is raining, by the rate in millimetres an hour, in the steps meteorologists use: light below
 * 2.5 mm/h, moderate below 7.6 mm/h, heavy below 50 mm/h and violent above that.
 */
import { MM_PER_INCH } from './const';
import { isInches } from './gauge';

export type Intensity = 'none' | 'light' | 'moderate' | 'heavy' | 'violent';

const STEPS: Array<[number, Intensity]> = [
  [50, 'violent'],
  [7.6, 'heavy'],
  [2.5, 'moderate'],
  [0, 'light'],
];

/**
 * The intensity of a rate. A sensor that gives the rain of the current hour as an amount, such as millimetres,
 * is read as that many an hour; inches are turned into millimetres.
 */
export function intensityOf(rate: number | null, unit: string): Intensity {
  if (rate === null || rate <= 0) {
    return 'none';
  }
  const amountUnit = unit.split('/')[0].trim();
  const perHour = /\/\s*(min|minute)/i.test(unit) ? rate * 60 : /\/\s*(d|day)/i.test(unit) ? rate / 24 : rate;
  const mm = isInches(amountUnit) ? perHour * MM_PER_INCH : perHour;
  return STEPS.find(([floor]) => mm > floor)?.[1] ?? 'light';
}

/** How many of the indicator's three bars are filled. */
export function barsOf(intensity: Intensity): number {
  return { none: 0, light: 1, moderate: 2, heavy: 3, violent: 3 }[intensity];
}
