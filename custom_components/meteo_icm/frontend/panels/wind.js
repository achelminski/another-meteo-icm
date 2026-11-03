import { axisTicks, colorBands } from "../lib/frame.js";
import { fmt, isNum, niceStep, ticksBetween, linearScale } from "../lib/math.js";
import { el, path, r1, segmentsPath } from "../lib/svg.js";
import { COLOR, windColor } from "../lib/theme.js";

const KMH = 3.6;

/** Smukła strzałka grotem w górę; jeden symbol w <defs>, instancje przez <use> obrócone o kierunek. */
function arrowSymbol(defs, uid) {
  const id = `${uid}-arrow`;
  defs.push(el("g", { id, transform: "scale(0.85)" },
    el("path", { d: "M0,-9L3.6,8L0,4.8L-3.6,8Z", fill: COLOR.arrow, stroke: COLOR.arrowDark, "stroke-width": 0.6, "stroke-linejoin": "round" }) +
    el("path", { d: "M0,-6V4.6", stroke: "#bbdefb", "stroke-width": 1 })));
  return (x, y, deg, scale = 1) =>
    el("use", { href: `#${id}`, transform: `translate(${r1(x)},${r1(y)}) rotate(${Math.round(deg)})${scale === 1 ? "" : ` scale(${scale})`}` });
}

/** Kierunek wiatru: grot wskazuje, dokąd wieje (kierunek meteorologiczny + 180°). */
const direction = {
  id: "direction",
  gap: 11,
  height: 19,
  isAvailable: (f) => f.has("wind_bearing"),

  render({ f, lay, defs, uid, top, h }) {
    const arrow = arrowSymbol(defs, uid);
    let svg = "";
    f.series("wind_bearing").forEach((v, i) => {
      if (isNum(v) && i % lay.arrowStep === 0) svg += arrow(lay.x(i), top + h / 2, v + 180);
    });
    return svg;
  },

  legendLeft(T, { defs, uid }) {
    const arrow = arrowSymbol(defs, `${uid}-legend`);
    let svg = "";
    for (let i = 0; i <= 12; i += 2) svg += arrow(T.X(i), T.top + T.h / 2, 160 + i * 9, 0.82);
    return {
      base: T.night + svg,
      layers: [{ label: { text: "Kierunek: grot = dokąd wieje", color: COLOR.arrowDark, at: [T.X(5), T.top + T.h / 2] } }],
      spread: [T.top + T.h / 2 + 4, T.top + T.h / 2 + 4],
    };
  },
};

export default {
  id: "wind",
  gap: 29,
  height: 70,
  isAvailable: (f) => f.has("wind_speed"),
  strip: direction,

  render({ f, lay, defs, uid, top, h }) {
    // skala = 1.2 × maksimum, więc poryw nigdy jej nie przekracza
    const vMax = Math.max(1, f.extent(["wind_speed", "wind_gust"])[1]) * 1.2;
    const step = niceStep(vMax, 3, [1, 2, 4, 5, 10]);
    const y = linearScale(0, vMax, top, h);
    const values = ticksBetween(0, vMax, step);
    const ticks = axisTicks(values, y, (v) => (v === 0 ? "-" : fmt(v)));
    const kmh = ticks.map((t, i) => ({ ...t, label: values[i] === 0 ? "-" : fmt(values[i] * KMH, 1).replace(/\.0$/, "").replace(".", ",") }));
    const { curve, fill } = colorBands(defs, `${uid}-wind-fill`, { values: f.series("wind_speed"), x: lay.x, y, top, h, colorOf: windColor });
    const half = lay.hourWidth / 2 - 0.5;
    const gusts = [];
    f.series("wind_gust").forEach((v, i) => {
      if (isNum(v)) gusts.push([lay.x(i) - half, y(v), lay.x(i) + half, y(v)]);
    });
    return {
      title: ["Wiatr", " m/s"],
      titleRight: ["Wiatr", " km/h"],
      left: ticks,
      right: kmh,
      data: fill +
        path(curve, { fill: "none", stroke: COLOR.windLine, "stroke-width": 3 }) +
        path(segmentsPath(gusts), { stroke: COLOR.gust, "stroke-width": 2 }),
    };
  },

  legend: {
    bottom: () => [[
      { kind: "line", color: COLOR.windLine, text: "Wiatr na wys. 10m" },
      { kind: "line", color: COLOR.gust, text: "Poryw wiatru", thin: true, requires: "wind_gust" },
    ]],

    left(T, { defs, uid }) {
      const y = T.scale(0, 12);
      const speed = (i) => 3.4 + 3 * T.wave(i, 0.2);
      const values = Array.from({ length: 13 }, (_, i) => speed(i));
      const { curve, fill } = colorBands(defs, `${uid}-legend-wind-fill`, { values, x: T.X, y, top: T.top, h: T.h, colorOf: windColor });
      const half = T.hourWidth / 2 - 0.5;
      const gusts = values.map((v, i) => {
        const g = y(v + 3 + (i % 3) * 0.4);
        return [T.X(i) - half, g, T.X(i) + half, g];
      });
      return {
        base: T.night + T.grid([4, 8].map(y)),
        layers: [
          {
            order: 1,
            svg: fill + path(curve, { fill: "none", stroke: COLOR.windLine, "stroke-width": 2 }),
            label: { text: "Wiatr na wys. 10m", color: COLOR.windLine, at: [T.X(9), y(speed(9))] },
          },
          {
            requires: "wind_gust", order: 0,
            svg: path(segmentsPath(gusts), { stroke: COLOR.gust, "stroke-width": 1.6 }),
            label: { text: "Poryw wiatru", color: COLOR.gust, at: [T.X(6), y(speed(6) + 3)] },
          },
          { order: 2, label: { text: "Kolor: prędkość wiatru", color: "#0082ff", at: [T.X(3), T.top + T.h - 6] } },
        ],
        spread: [T.top + T.h / 2 - 16, T.top + T.h / 2 + 16],
      };
    },
  },
};
