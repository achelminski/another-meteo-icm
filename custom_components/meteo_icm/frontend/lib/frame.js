// Wspólna "rama" paneli: tytuły, tło, noce, siatka, linia "teraz", podpisy osi.
// Panele dostarczają tylko warstwę danych i podziałki osi.

import { COLOR } from "./theme.js";
import { fmt, isNum } from "./math.js";
import { el, esc, group, path, r1, rect, rectsPath, segmentsPath, smoothPath, text } from "./svg.js";

/** Podziałki osi; co druga pogrubiona, zaczynając od `boldFrom` (0 lub 1). */
export const axisTicks = (values, scale, label = (v) => fmt(v), boldFrom = 0) =>
  values.map((v, i) => ({ y: scale(v), label: label(v), bold: i % 2 === boldFrom }));

/** Dodaje clipPath do <defs> i zwraca wartość atrybutu clip-path. */
export function clip(defs, id, shape) {
  defs.push(el("clipPath", { id }, shape));
  return `url(#${id})`;
}

/** Pasy nocy w pasie [top, top + h] jako jedna ścieżka. */
export const nightBands = (lay, top, h, fill = COLOR.night) =>
  path(rectsPath(lay.nights.map(([a, b]) => [a, top, b - a, h])), { fill });

const nowLine = (lay, top, h) => path(`M${r1(lay.left + 1)},${r1(top)}v${r1(h)}`, { stroke: COLOR.now, "stroke-width": 2 });

const axisLabels = (ticks, x, anchor) =>
  group(
    ticks.map((t) => text(x, t.y + 4, t.label, t.bold ? { "font-weight": 600 } : undefined)).join(""),
    { "font-size": 11, fill: COLOR.axis, "text-anchor": anchor },
  );

const titleText = (title, x, y, anchor) =>
  title
    ? el("text", { x: r1(x), y: r1(y), "font-size": 12, fill: COLOR.text, "text-anchor": anchor },
      `<tspan font-weight="500">${esc(title[0])}</tspan><tspan>${esc(title[1])}</tspan>`)
    : "";

/**
 * Panel z osiami. `spec` pochodzi z `panel.render()`:
 * title/titleRight: [część pogrubiona, jednostka], left/right: podziałki, bg: kolor tła,
 * background: warstwa pod nocami i siatką, data: warstwa danych, gridExtra: przedłużenie siatki w dół.
 */
export function panelFrame(lay, defs, id, top, h, spec) {
  const { title, titleRight, left, right = [], bg, background = "", data, gridExtra = 0 } = spec;
  const width = lay.right - lay.left;
  const clipPath = clip(defs, id, rect(lay.left, top, width, h));
  const hGrid = segmentsPath(left.map((t) => [lay.left, t.y, lay.right, t.y]));
  const vGrid = segmentsPath(lay.labelTicks.map((i) => [lay.x(i), top, lay.x(i), top + h + 6 + gridExtra]));
  return (
    titleText(title, lay.left, top - 9, "start") +
    titleText(titleRight, lay.right, top - 9, "end") +
    (bg ? rect(lay.left, top, width, h, { fill: bg }) : "") +
    group(background + nightBands(lay, top, h) + path(hGrid, { stroke: COLOR.grid }), { "clip-path": clipPath }) +
    path(vGrid, { stroke: COLOR.grid }) +
    group(data, { "clip-path": clipPath }) +
    nowLine(lay, top, h) +
    axisLabels(left, lay.left - 12, "end") +
    axisLabels(right, lay.right + 10, "start")
  );
}

/** Pasek pod panelem bez osi (szansa opadu, kierunek wiatru). */
export const stripFrame = (lay, top, h, content) =>
  rect(lay.left, top, lay.right - lay.left, h, { fill: "#fff" }) + nightBands(lay, top, h) + content + nowLine(lay, top, h);

/**
 * Wypełnienie pod krzywą kolorem zależnym od wartości (ciśnienie, wiatr): przedział i..i+1 ma kolor
 * wartości z jego końca. Sąsiednie przedziały tego samego koloru łączymy w jeden prostokąt,
 * a prostokąty jednego koloru w jedną ścieżkę - zamiast prostokąta na każdą godzinę.
 */
export function colorBands(defs, id, { values, x, y, top, h, colorOf }) {
  const curve = smoothPath(values.map((v, i) => (isNum(v) ? [x(i), y(v)] : null)));
  const last = values.length - 1;
  const rects = new Map();
  let start = 0;
  let color = null;
  const flush = (end) => {
    if (!color) return;
    if (!rects.has(color)) rects.set(color, []);
    rects.get(color).push([x(start) - 0.3, top, x(end) - x(start) + 0.6, h]);
  };
  for (let i = 0; i < last; i++) {
    const v = values[i + 1] ?? values[i];
    const c = isNum(v) ? colorOf(v) : null;
    if (c !== color) {
      flush(i);
      start = i;
      color = c;
    }
  }
  flush(last);
  const clipPath = clip(defs, id, path(`${curve}L${r1(x(last))},${r1(top + h)}L${r1(x(0))},${r1(top + h)}Z`));
  const fill = [...rects].map(([c, list]) => path(rectsPath(list), { fill: c })).join("");
  return { curve, fill: group(fill, { "clip-path": clipPath }) };
}
