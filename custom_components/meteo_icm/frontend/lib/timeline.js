// Oś czasu nad panelami: noce, dni (od wschodu słońca), godziny i podziałki.

import { COLOR } from "./theme.js";
import { group, path, rectsPath, segmentsPath, text } from "./svg.js";

export const TIMELINE_HEIGHT = 80;
const AXIS_Y = 64.5;
const CLOCK_CLEARANCE = 22; // etykiety godzin bliżej lewej krawędzi zasłaniałaby ikona zegara
const DAY_LABEL_CHAR_WIDTH = 6.6; // przybliżona szerokość znaku etykiety dnia (12 px)

const clockIcon = (cx, cy) =>
  group(`<circle cx="${cx}" cy="${cy}" r="5.5"/>` + path(`M${cx} ${cy - 3}V${cy}L${cx + 2.2} ${cy + 1.6}M${cx - 1.8} ${cy - 7.6}H${cx + 1.8}`),
    { fill: "none", stroke: "#000", "stroke-width": 1.3 });

export function renderTimeline(f, lay) {
  const H = TIMELINE_HEIGHT;
  const nights = lay.nights;
  const majorTicks = new Set([0, ...lay.labelTicks]);
  const ticks = [[lay.left, AXIS_Y, lay.right, AXIS_Y]];
  for (let i = 0; i < f.n; i++) {
    if (majorTicks.has(i)) ticks.push([lay.x(i), AXIS_Y, lay.x(i), 72]);
    else if (i % lay.minorTickStep === 0) ticks.push([lay.x(i), AXIS_Y, lay.x(i), 68]);
  }

  const days = lay.dayStarts
    .map((ms) => ({ x: (ms === f.t0 ? lay.left : lay.xt(ms)) + 10, label: lay.dayLabel(ms) }))
    .filter(({ x, label }) => x + label.length * DAY_LABEL_CHAR_WIDTH <= lay.width);

  let svg = path(rectsPath(nights.map(([a, b]) => [a, 0, b - a, H])), { fill: COLOR.timelineNight });
  if (lay.nightLabels) {
    svg += group(
      nights.filter(([a, b]) => b - a > 24).map(([a, b]) => text((a + b) / 2, 16, "NOC")).join(""),
      { "font-size": 9, "font-weight": 700, fill: COLOR.nightLabel, "text-anchor": "middle" },
    );
  }
  svg += group(days.map(({ x, label }) => text(x, 14, label)).join(""), { "font-size": 12, "font-weight": 500, fill: COLOR.text });
  svg += clockIcon(lay.left + 6, 52);
  if (lay.mode === "left") {
    const lx = lay.legendWidth - 44;
    svg += text(lx, 56, "Czas lokalny", { "font-size": 10, fill: "#000", "text-anchor": "end" });
    svg += path(`M${lx + 4},53H${lay.left - 4}`, { stroke: "#555", "stroke-width": 0.8 });
  }
  svg += group(
    lay.labelTicks
      .filter((i) => lay.x(i) - lay.left >= CLOCK_CLEARANCE)
      .map((i) => text(lay.x(i), 56, lay.hourLabel(f.time(i))))
      .join(""),
    { "font-size": 12, fill: "#000", "text-anchor": "middle" },
  );
  svg += path(segmentsPath(ticks), { stroke: "#000", "stroke-width": 1 });
  return svg;
}
