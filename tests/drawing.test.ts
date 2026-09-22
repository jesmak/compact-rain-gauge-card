import { describe, expect, it } from 'vitest';

import { indexAt } from '../src/chart';
import { levelY, scaleMarks, scaleStep } from '../src/drop';
import { barsOf, intensityOf } from '../src/intensity';

describe('the scale', () => {
  it('marks a few round values under the full level', () => {
    expect(scaleStep(40)).toBe(10);
    expect(scaleMarks(40)).toEqual([0.25, 0.5, 0.75]);
    expect(scaleMarks(20).length).toBe(3);
    expect(scaleMarks(1.575).map((mark) => Math.round(mark * 1.575 * 100) / 100)).toEqual([0.5, 1, 1.5]);
    expect(scaleMarks(0)).toEqual([]);
  });

  it('runs from the bottom of the drop to its tip', () => {
    expect(levelY(0)).toBe(126);
    expect(levelY(1)).toBe(4);
  });
});

describe('the intensity', () => {
  it('follows the usual limits in millimetres an hour', () => {
    expect(intensityOf(0, 'mm')).toBe('none');
    expect(intensityOf(null, 'mm')).toBe('none');
    expect(intensityOf(1, 'mm')).toBe('light');
    expect(intensityOf(5, 'mm/h')).toBe('moderate');
    expect(intensityOf(10, 'mm/h')).toBe('heavy');
    expect(intensityOf(60, 'mm/h')).toBe('violent');
  });

  it('turns inches and other periods into millimetres an hour', () => {
    expect(intensityOf(0.2, 'in/h')).toBe('moderate');
    expect(intensityOf(0.1, 'mm/min')).toBe('moderate');
    expect(intensityOf(48, 'mm/d')).toBe('light');
  });

  it('fills a bar for each step, three at most', () => {
    expect(['none', 'light', 'moderate', 'heavy', 'violent'].map((level) => barsOf(level as never))).toEqual([
      0, 1, 2, 3, 3,
    ]);
  });
});

describe('pointing at a chart', () => {
  const items = [0, 10, 20].map((time) => ({ time, value: 1, label: '' }));

  it('picks the bar in that slot', () => {
    expect(indexAt('bars', items, 0.1, 0, 0)).toBe(0);
    expect(indexAt('bars', items, 0.5, 0, 0)).toBe(1);
    expect(indexAt('bars', items, 0.99, 0, 0)).toBe(2);
  });

  it('picks the reading in force at that moment of a line', () => {
    expect(indexAt('line', items, 0.45, 0, 30)).toBe(1);
    expect(indexAt('line', items, 0.9, 0, 30)).toBe(2);
  });
});
