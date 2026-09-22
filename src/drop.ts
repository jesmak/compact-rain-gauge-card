/**
 * The drop: an outline, the rain inside it up to its level, marks on a scale, and, while it rains, a moving
 * surface with drops falling onto it.
 *
 * It is drawn in a 100 × 130 box: the tip at the top, a round bottom. The rain rises from the bottom of the
 * round (y 126) to the tip (y 4).
 */
import { svg } from 'lit';
import type { TemplateResult } from 'lit';

export const DROP_WIDTH = 100;
export const DROP_HEIGHT = 130;
const TOP = 4;
const BOTTOM = 126;
const OUTLINE = 'M50 4 C42 20 10 58 10 86 A40 40 0 0 0 90 86 C90 58 58 20 50 4 Z';

/** One wave of the moving surface is this wide; the surface slides by exactly that, so the loop is seamless. */
const WAVELENGTH = 25;
const WAVE_HEIGHT = 2.5;

/** The height of a level in the drawing, from 0 (empty) to 1 (full). */
export function levelY(fill: number): number {
  return BOTTOM - fill * (BOTTOM - TOP);
}

/** A round step for the scale, so that the marks fall on a few even values under the full level. */
export function scaleStep(maxLevel: number): number {
  const steps = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];
  return steps.find((step) => maxLevel / step <= 4) ?? steps[steps.length - 1];
}

/** The levels of the scale's marks, as shares of the full level: every step under it. */
export function scaleMarks(maxLevel: number): number[] {
  if (!(maxLevel > 0)) {
    return [];
  }
  const step = scaleStep(maxLevel);
  const marks: number[] = [];
  for (let value = step; value < maxLevel * 0.999; value += step) {
    marks.push(value / maxLevel);
  }
  return marks;
}

/** The rain's surface: flat, or a wave that is one wavelength wider than the drop on each side. */
function surface(raining: boolean): string {
  if (!raining) {
    return `M0 0 H${DROP_WIDTH} V${DROP_HEIGHT} H0 Z`;
  }
  let path = `M${-WAVELENGTH} 0`;
  for (let x = -WAVELENGTH; x < DROP_WIDTH + WAVELENGTH; x += WAVELENGTH) {
    path += ` q${WAVELENGTH / 4} ${-WAVE_HEIGHT} ${WAVELENGTH / 2} 0 t${WAVELENGTH / 2} 0`;
  }
  return `${path} V${DROP_HEIGHT} H${-WAVELENGTH} Z`;
}

export interface DropOptions {
  /** How full it is, from 0 to 1. */
  fill: number;
  /** The id of the drop's clip path, which must be unique in the card. */
  clipId: string;
  /** Moves the surface and lets drops fall. */
  raining: boolean;
  /** The marks, as shares of the full level. */
  marks: number[];
}

export function drop({ fill, clipId, raining, marks }: DropOptions): TemplateResult {
  const level = levelY(fill);
  // Falling drops need room above the surface to fall through.
  const falling = raining && level > 30;
  return svg`
    <defs><clipPath id=${clipId}><path d=${OUTLINE}></path></clipPath></defs>
    <g clip-path="url(#${clipId})">
      <g class="level" style="transform: translateY(${level}px)">
        <path class=${raining ? 'fill wave' : 'fill'} d=${surface(raining)}></path>
      </g>
      ${marks.map((mark) => {
        const y = levelY(mark);
        return svg`<line class="mark" x1="36" x2="48" y1=${y} y2=${y}></line>`;
      })}
      ${
        falling
          ? [36, 58, 47].map(
              (x, index) =>
                svg`<ellipse class="falling" cx=${x} cy="10" rx="1.6" ry="3"
                  style="--fall: ${level - 14}px; animation-delay: ${index * 0.45}s"></ellipse>`,
            )
          : ''
      }
    </g>
    <path class="outline" d=${OUTLINE}></path>
  `;
}
