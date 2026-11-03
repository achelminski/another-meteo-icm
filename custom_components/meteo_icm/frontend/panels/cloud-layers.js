import { fmt, isNum, piecewiseScale } from "../lib/math.js";
import { dotsPath, path, smoothPath } from "../lib/svg.js";
import { CLOUD_BASES, COLOR } from "../lib/theme.js";

// Pionowa rozciągłość chmur (podstawy wg pokrycia i wierzchołek) oraz widzialność.
// GFS nie podaje chmur w pionie - wtedy panel pokazuje samą widzialność.
const CLOUD_KEYS = ["cloud_top", ...CLOUD_BASES.map((b) => b.key)];
const HEIGHT_STOPS = [0, 0.5, 2, 7, 15]; // km
const VISIBILITY_STOPS = [0, 1, 5, 20, 100]; // km

const ticksOf = (stops, scale, label) => stops.map((v, i) => ({ y: scale(v), label: label(v), bold: i % 2 === 0 }));
const visibilityLine = (points, width) => path(smoothPath(points), { fill: "none", stroke: COLOR.visibility, "stroke-width": width });

export default {
  id: "cloud-layers",
  height: 80,
  isAvailable: (f) => f.hasAny(CLOUD_KEYS) || f.has("visibility"),

  render({ f, lay, top, h }) {
    const yHeight = piecewiseScale(HEIGHT_STOPS, top, h);
    const yVisibility = piecewiseScale(VISIBILITY_STOPS, top, h);
    const visibilityTicks = ticksOf(VISIBILITY_STOPS, yVisibility, String);
    let data = visibilityLine(f.points("visibility", lay.x, yVisibility), 2.5);
    if (!f.hasAny(CLOUD_KEYS)) {
      return { title: ["Widzialność", " km"], left: visibilityTicks, right: visibilityTicks, bg: COLOR.sky, data };
    }

    const dots = (key, keep) => f.series(key).flatMap((v, i) => (isNum(v) && keep(v) ? [[lay.x(i), yHeight(v)]] : []));
    for (const { key, fill, stroke } of CLOUD_BASES) {
      data += path(dotsPath(dots(key, (v) => v >= 0), lay.dotRadius * 0.88), { fill, stroke, "stroke-width": 0.8 });
    }
    data += path(dotsPath(dots("cloud_top", (v) => v > 0), lay.dotRadius * 0.88), { fill: COLOR.cloudTop });
    return {
      title: ["Pionowa rozciągłość chmur", " km"],
      titleRight: f.has("visibility") ? ["Widzialność", " km"] : null,
      left: ticksOf(HEIGHT_STOPS, yHeight, (v) => fmt(v, 1)),
      right: f.has("visibility") ? visibilityTicks : [],
      bg: COLOR.sky,
      data,
    };
  },

  legend: {
    bottom: () => [[
      { kind: "dot", color: COLOR.cloudTop, text: "Wierzchołek chmur", requires: "cloud_top" },
      { kind: "none", text: "Podstawa chmur o pokryciu:", requires: CLOUD_BASES.map((b) => b.key) },
      ...[...CLOUD_BASES].reverse().map(({ key, fill, stroke, label }) => ({ kind: "dot", color: fill, stroke, text: label, requires: key })),
      { kind: "line", color: COLOR.visibility, text: "Widzialność", right: true, requires: "visibility" },
    ]],

    left(T) {
      const yHeight = piecewiseScale(HEIGHT_STOPS, T.top, T.h);
      const yVisibility = piecewiseScale(VISIBILITY_STOPS, T.top, T.h);
      const visibility = (i) => 12 + 6 * T.wave(i, 0.5);
      const cloudTop = (i) => 9 + 1.5 * T.wave(i);
      // rząd kropek każdej podstawy: [od, do, wysokość km]; kolory podpisów czytelne na tle nieba
      const rows = [[0, 12, 0.25, "#fff"], [1, 11, 0.5, "#a0a0a0"], [2, 10, 0.85, "#7a7a7a"], [3, 9, 1.25, "#4d4d4d"], [4, 7, 1.7, "#000"]];
      const bases = CLOUD_BASES.map(({ key, fill, stroke, label }, k) => {
        const [from, to, km, color] = rows[k];
        const points = Array.from({ length: to - from + 1 }, (_, j) => [T.X(from + j), yHeight(km)]);
        return {
          requires: key,
          order: 7 - k,
          svg: path(dotsPath(points, 2.6), { fill, stroke, "stroke-width": 0.6 }),
          label: k === 0
            ? { text: label, color, box: "#333", lineColor: "#555", at: [T.X(4), yHeight(km)] }
            : { text: label, color, at: [T.X([0, 1, 2, 3, 5][k]), yHeight(km)] },
        };
      });
      return {
        bg: COLOR.sky,
        base: T.night + T.grid([0.5, 2, 7].map(yHeight)),
        layers: [
          {
            requires: "visibility", order: 1,
            svg: visibilityLine(T.points((i) => yVisibility(visibility(i))), 2),
            label: { text: "Widzialność", color: "#e69500", at: [T.X(8), yVisibility(visibility(8))] },
          },
          ...bases,
          {
            requires: "cloud_top", order: 0,
            svg: path(dotsPath(T.points((i) => yHeight(cloudTop(i))), 2.6), { fill: COLOR.cloudTop }),
            label: { text: "Wierzchołek chmur", color: COLOR.cloudTop, at: [T.X(5), yHeight(cloudTop(5))] },
          },
          { requires: CLOUD_BASES.map((b) => b.key), order: 2, label: { text: "Podstawa chmur o pokryciu:", color: COLOR.text } },
        ],
        fontSize: 9,
        spread: [T.top - 10, T.top + T.h + 2],
      };
    },
  },
};
