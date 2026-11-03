// Legendy: wiersze pod panelami ("bottom") i kolumna miniatur po lewej ("left", układ jak
// w klasycznym meteogramie ICM). Elementy z `requires` są pomijane, gdy model nie podaje danej serii
// (np. GFS nie ma temperatur min/max ani burz), więc legenda opisuje tylko to, co może się pojawić.

import { COLOR } from "./theme.js";
import { linearScale } from "./math.js";
import { clip } from "./frame.js";
import { el, group, path, r1, rect, segmentsPath, text } from "./svg.js";

export const LEGEND_ROW_HEIGHT = 18;

const isAvailable = (f, requires) => !requires || f.hasAny([].concat(requires));

// ------------------------------------------------------------------ legenda pod panelami

const MARKER_WIDTH = { none: 0, tri: 38, tribar: 22, tridot: 28 };
const markerWidth = (item) => MARKER_WIDTH[item.kind] ?? 14;
const itemWidth = (item) => markerWidth(item) + item.text.length * 5.1 + (markerWidth(item) ? 5 : 0);

function marker(item, x, cy) {
  switch (item.kind) {
    case "line":
      return rect(x, cy - (item.thin ? 1 : 1.5), 12, item.thin ? 2 : 3, { fill: item.color });
    case "block":
      return item.small ? rect(x, cy - 4, 6, 8, { fill: item.color }) : rect(x, cy - 2.5, 12, 5, { fill: item.color });
    case "outline":
      return rect(x + 0.5, cy - 2.5, 11, 5, { fill: "none", stroke: item.color });
    case "vbar":
      return rect(x + 5, cy - 6, 1.5, 11, { fill: item.color });
    case "dot":
      return el("circle", { cx: x + 4, cy, r: 3, fill: item.color, stroke: item.stroke, "stroke-width": item.stroke && 0.8 });
    case "tri":
      return item.colors.map((c, k) => rect(x + k * 13, cy - 2, 11, 5, { fill: c })).join("");
    case "tribar":
      return item.colors.map((c, k) => rect(x + 2 + k * 7, cy - 6, 1.5, 11, { fill: c })).join("");
    case "tridot":
      return item.colors.map((c, k) => el("circle", { cx: x + 4 + k * 10, cy, r: 3.5, fill: c })).join("");
    default:
      return "";
  }
}

function legendItem(item, x, y) {
  const m = markerWidth(item);
  return marker(item, x, y - 4) + text(x + m + (m ? 3 : 0), y, item.text);
}

/**
 * Wiersze legendy pod panelem; elementy z `right: true` wyrównane do prawej krawędzi.
 * @returns {{svg: string, height: number}}
 */
export function bottomLegend(lay, f, rows, y) {
  const visible = rows.map((row) => row.filter((item) => isAvailable(f, item.requires))).filter((row) => row.length);
  let svg = "";
  visible.forEach((row, k) => {
    const yy = y + 13 + k * LEGEND_ROW_HEIGHT;
    let xl = lay.left;
    for (const item of row.filter((i) => !i.right)) {
      svg += legendItem(item, xl, yy);
      xl += itemWidth(item) + 14;
    }
    let xr = lay.right - 30;
    for (const item of row.filter((i) => i.right).reverse()) {
      xr -= itemWidth(item);
      svg += legendItem(item, xr, yy);
      xr -= 14;
    }
  });
  return {
    svg: group(svg, { "font-size": 10, fill: COLOR.legend }),
    height: visible.length ? visible.length * LEGEND_ROW_HEIGHT + 4 : 0,
  };
}

// ------------------------------------------------------------------ legenda po lewej

const THUMB_WIDTH = 92;
const THUMB_HOURS = 12;

/**
 * Pomocniki do rysowania miniatury panelu (12 "godzin" syntetycznych danych).
 * @typedef {ReturnType<typeof thumbContext>} Thumb
 */
function thumbContext(lay, top, h) {
  const x = lay.legendWidth - 10 - THUMB_WIDTH;
  const X = (i) => x + (i * THUMB_WIDTH) / THUMB_HOURS;
  return {
    top,
    h,
    x,
    w: THUMB_WIDTH,
    hourWidth: THUMB_WIDTH / THUMB_HOURS,
    X,
    scale: (lo, hi) => linearScale(lo, hi, top, h),
    wave: (i, phase = 0) => Math.sin((i / THUMB_HOURS) * Math.PI * 1.4 + phase),
    points: (fy, from = 0, to = THUMB_HOURS) => Array.from({ length: to - from + 1 }, (_, k) => [X(from + k), fy(from + k)]),
    night: rect(x, top, THUMB_WIDTH * 0.25, h, { fill: COLOR.night }),
    grid: (ys) => path(segmentsPath([
      ...ys.map((yy) => [x, yy, x + THUMB_WIDTH, yy]),
      ...[3, 6, 9].map((i) => [X(i), top, X(i), top + h]),
    ]), { stroke: COLOR.grid }),
  };
}

/**
 * Miniatura panelu z podpisami połączonymi liniami z elementami miniatury.
 * `build(T)` zwraca { bg, base, layers, fontSize, spread }; warstwa (`layers`) to
 * { requires?, svg?, label?: { text, color, at?, box?, lineColor? }, order? } - rysowana w kolejności
 * tablicy, a podpisy ustawiane od góry według `order`. Warstwy bez danych w modelu są pomijane.
 */
export function leftLegend(lay, f, defs, id, top, h, build) {
  const T = thumbContext(lay, top, h);
  const { bg = "#fff", base = "", layers = [], fontSize = 10, spread = [top - 6, top + h + 2] } = build(T);
  const visible = layers.filter((layer) => isAvailable(f, layer.requires));
  const labels = visible
    .filter((layer) => layer.label)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((layer) => layer.label);

  const clipPath = clip(defs, id, rect(T.x, top, T.w, h));
  let s = rect(T.x, top, T.w, h, { fill: bg }) +
    group(base + visible.map((layer) => layer.svg ?? "").join(""), { "clip-path": clipPath }) +
    rect(T.x, top, T.w, h, { fill: "none", stroke: "#9e9e9e", "stroke-width": 0.8 });

  // podpisy równomiernie w pionie, wyrównane do prawej; linia odniesienia do elementu miniatury
  const lx = T.x - 34;
  const step = labels.length > 1 ? Math.min((spread[1] - spread[0]) / (labels.length - 1), fontSize + 6) : 0;
  const start = (spread[0] + spread[1]) / 2 - (step * (labels.length - 1)) / 2;
  labels.forEach((label, k) => {
    const ly = start + k * step + fontSize / 2 - 1;
    if (label.box) {
      const w = label.text.length * fontSize * 0.55 + 6;
      s += rect(lx - w + 3, ly - fontSize + 0.5, w, fontSize + 3, { rx: 2, fill: label.box });
    }
    s += text(lx, ly, label.text, { fill: label.color });
    if (label.at) {
      const [ax, ay] = label.at;
      const stroke = label.lineColor ?? label.color;
      s += path(`M${r1(lx + 4)},${r1(ly - fontSize / 3)}H${r1(T.x - 12)}L${r1(ax)},${r1(ay)}`,
        { fill: "none", stroke, "stroke-width": 0.8, opacity: 0.9 });
      s += el("circle", { cx: r1(ax), cy: r1(ay), r: 1.3, fill: stroke });
    }
  });
  return group(s, { "font-size": fontSize, "text-anchor": "end" });
}
