// Składanie meteogramu: oś czasu, kolejne dostępne panele z paskami i legendami.

import PANELS from "../panels/index.js";
import { panelFrame, stripFrame } from "./frame.js";
import { computeLayout } from "./layout.js";
import { bottomLegend, leftLegend } from "./legend.js";
import { TIMELINE_HEIGHT, renderTimeline } from "./timeline.js";

const PANEL_GAP = 22; // odstęp nad panelem (mieści tytuł)
const PANEL_AFTER = 8; // odstęp pod panelem, gdy nie ma pod nim legendy

/**
 * @param {import("./forecast.js").Forecast} f
 * @param {{width: number, config: object, timeZone?: string, uid: string}} options
 *   uid - prefiks identyfikatorów (clipPath, symbole), unikalny dla instancji karty
 * @returns {{svg: string, width: number, height: number}}
 */
export function renderMeteogram(f, { width, config, timeZone, uid }) {
  const lay = computeLayout(f, width, config, timeZone);
  const defs = [];
  const body = [renderTimeline(f, lay)];
  let y = TIMELINE_HEIGHT + PANEL_AFTER;

  for (const panel of PANELS) {
    if (!panel.isAvailable(f)) continue;
    const ctx = { f, lay, defs, uid };
    const top = y + (panel.gap ?? PANEL_GAP);
    const { height: h } = panel;
    body.push(panelFrame(lay, defs, `${uid}-${panel.id}`, top, h, {
      gridExtra: panel.gridExtra,
      ...panel.render({ ...ctx, top, h }),
    }));
    if (lay.mode === "left") body.push(leftLegend(lay, f, defs, `${uid}-legend-${panel.id}`, top, h, (T) => panel.legend.left(T, ctx)));
    y = top + h;

    const { strip } = panel;
    if (strip?.isAvailable(f)) {
      const sTop = y + strip.gap;
      body.push(stripFrame(lay, sTop, strip.height, strip.render({ ...ctx, top: sTop, h: strip.height })));
      if (lay.mode === "left") {
        body.push(leftLegend(lay, f, defs, `${uid}-legend-${strip.id}`, sTop, strip.height, (T) => strip.legendLeft(T, ctx)));
      }
      y = sTop + strip.height;
    }

    const legend = lay.mode === "bottom" ? bottomLegend(lay, f, panel.legend.bottom(f, lay), y) : null;
    if (legend?.height) {
      body.push(legend.svg);
      y += legend.height;
    } else {
      y += PANEL_AFTER;
    }
  }

  const height = Math.ceil(y);
  const svgWidth = Math.round(lay.width); // round, nie ceil: 958.0000001 px nie może dać paska przewijania
  return {
    width: svgWidth,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${height}" viewBox="0 0 ${svgWidth} ${height}">` +
      `<defs>${defs.join("")}</defs>${body.join("")}</svg>`,
  };
}
