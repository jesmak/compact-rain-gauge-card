import { beforeEach, describe, expect, it } from 'vitest';

import { formData } from '../src/editor';
import type { CompactRainGaugeCardEditor } from '../src/editor';
import type { HomeAssistant } from '../src/hass';
import type { CompactRainGaugeCardConfig } from '../src/types';

const hass: HomeAssistant = { locale: { language: 'fi' }, states: {} };

async function editor(config: Partial<CompactRainGaugeCardConfig> = {}): Promise<CompactRainGaugeCardEditor> {
  const element = document.createElement('compact-rain-gauge-card-editor') as CompactRainGaugeCardEditor;
  element.setConfig({ type: 'custom:compact-rain-gauge-card', entity: 'sensor.rain', ...config } as never);
  element.hass = hass;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

type Form = HTMLElement & {
  schema: Array<Record<string, unknown>>;
  computeLabel: (entry: { name: string }) => string;
  computeHelper: (entry: { name: string }) => string | undefined;
};

function form(element: CompactRainGaugeCardEditor): Form {
  const found = element.shadowRoot?.querySelector('ha-form');
  if (!found) {
    throw new Error('the editor rendered no form');
  }
  return found as Form;
}

function names(schema: Array<Record<string, unknown>>): string[] {
  return schema.flatMap((entry) =>
    Array.isArray(entry.schema)
      ? names(entry.schema as Array<Record<string, unknown>>)
      : [String(entry.name)],
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the editor', () => {
  it("offers every option, in the viewer's language", async () => {
    const found = form(await editor());
    expect(names(found.schema)).toEqual([
      'entity',
      'hourly_rate_entity',
      'language',
      'max_level',
      'animate_rain',
      'show_scale',
      'show_intensity',
      'show_yesterday',
      'show_week',
      'show_month',
      'fill_drop_colour',
      'border_colour',
      'show_daily_chart',
      'daily_chart_days',
      'show_rate_chart',
      'rate_chart_hours',
      'tap_action',
      'hold_action',
      'double_tap_action',
    ]);
    expect(found.computeLabel({ name: 'entity' })).toBe('Sademäärän sensori');
    expect(found.computeHelper({ name: 'max_level' })).toContain('40 mm');
    expect(found.computeHelper({ name: 'fill_drop_colour' })).toBeUndefined();
  });

  it('offers the languages the card has', async () => {
    const found = form(await editor());
    const language = found.schema.find((entry) => entry.name === 'language') as
      { selector: { select: { options: Array<{ value: string }> } } } | undefined;
    expect(language?.selector.select.options.map((option) => option.value)).toEqual(['en', 'fi']);
  });

  it('leaves defaults and emptied options out of the configuration', async () => {
    const element = await editor({ max_level: 20 });
    const changes: CompactRainGaugeCardConfig[] = [];
    element.addEventListener('config-changed', (event) => {
      changes.push((event as CustomEvent<{ config: CompactRainGaugeCardConfig }>).detail.config);
    });
    form(element).dispatchEvent(
      new CustomEvent('value-changed', {
        detail: {
          value: {
            ...formData({ type: 'custom:compact-rain-gauge-card', entity: 'sensor.rain' } as never),
            language: '',
            show_daily_chart: true,
          },
        },
      }),
    );
    expect(changes).toEqual([
      { type: 'custom:compact-rain-gauge-card', entity: 'sensor.rain', show_daily_chart: true },
    ]);
  });
});
