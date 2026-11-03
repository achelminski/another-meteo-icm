import { axisTicks } from "../lib/frame.js";
import { isNum, linearScale } from "../lib/math.js";
import { areaPath, path, rectsPath, smoothPath } from "../lib/svg.js";
import { COLOR } from "../lib/theme.js";

// Zachmurzenie w oktantach (seria w % → 0..8) i mgła (frakcja 0..1).
const LAYERS = [
  { key: "cloud_medium", color: COLOR.cloudMedium },
  { key: "cloud_low", color: COLOR.cloudLow },
  { key: "cloud_very_low", color: COLOR.cloudVeryLow },
];
const COVER_KEYS = ["cloud_coverage", "cloud_high", ...LAYERS.map((l) => l.key), "fog"];
const TENSION = 0.25;

const outline = (points, color, width) => path(smoothPath(points, TENSION), { fill: "none", stroke: color, "stroke-width": width });

export default {
  id: "cloud-cover",
  height: 80,
  isAvailable: (f) => f.hasAny(COVER_KEYS),

  render({ f, lay, top, h }) {
    const y = linearScale(0, 8, top, h);
    const yFog = linearScale(0, 1, top, h);
    const oktas = (key) => f.points(key, lay.x, (v) => y((v / 100) * 8));
    const bottom = top + h;
    const barWidth = lay.hourWidth * 0.6;
    const fog = [];
    f.series("fog").forEach((v, i) => {
      if (isNum(v) && v > 0.5) fog.push([lay.x(i) - barWidth / 2, yFog(v / 100), barWidth, bottom - yFog(v / 100)]);
    });
    return {
      title: ["Zachmurzenie", " oktanty"],
      titleRight: f.has("fog") ? ["Mgła", " frakcja"] : null,
      left: axisTicks([0, 2, 4, 6, 8], y),
      right: f.has("fog") ? [0, 0.25, 0.5, 0.75, 1].map((v, i) => ({ y: yFog(v), label: String(v), bold: i % 2 === 0 })) : [],
      bg: COLOR.sky,
      data:
        LAYERS.map(({ key, color }) => path(areaPath(oktas(key), bottom, TENSION), { fill: color })).join("") +
        outline(oktas("cloud_high"), COLOR.cloudHigh, 2.5) +
        path(rectsPath(fog), { fill: COLOR.fog }) +
        outline(oktas("cloud_coverage"), COLOR.cloudTotal, 2.5),
    };
  },

  legend: {
    bottom: () => [[
      { kind: "line", color: COLOR.cloudTotal, text: "Zachmurzenie ogólne", requires: "cloud_coverage" },
      { kind: "none", text: "Chmury:", requires: ["cloud_very_low", "cloud_low", "cloud_medium", "cloud_high"] },
      { kind: "line", color: COLOR.cloudVeryLow, text: "Bardzo niskie", requires: "cloud_very_low" },
      { kind: "line", color: COLOR.cloudLow, text: "Niskie", requires: "cloud_low" },
      { kind: "line", color: COLOR.cloudMedium, text: "Średnie", requires: "cloud_medium" },
      { kind: "outline", color: "#999", text: "Wysokie", requires: "cloud_high" },
      { kind: "block", color: COLOR.fog, text: "Mgła", right: true, small: true, requires: "fog" },
    ]],

    left(T) {
      const y = T.scale(0, 8);
      const yFog = T.scale(0, 1);
      const medium = (i) => 4.2 + 2.6 * T.wave(i, -0.4);
      const low = (i) => 2.6 + 2.2 * T.wave(i, 0.3);
      const veryLow = (i) => 1 + 0.7 * T.wave(i, 0.9);
      const high = (i) => 5 + 1.8 * T.wave(i, -1.2);
      const total = (i) => Math.min(7.8, Math.max(medium(i), low(i), high(i)) + 0.8);
      const curve = (fn) => T.points((i) => y(fn(i)));
      const area = (fn, color) => path(areaPath(curve(fn), T.top + T.h, TENSION), { fill: color });
      const barWidth = T.hourWidth * 0.6;
      const fog = [[7, 0.3], [8, 0.55], [9, 0.8], [10, 0.6], [11, 0.4]]
        .map(([i, v]) => [T.X(i) - barWidth / 2, yFog(v), barWidth, T.top + T.h - yFog(v)]);
      return {
        bg: COLOR.sky,
        base: T.night + T.grid([2, 4, 6].map(y)),
        layers: [
          { requires: "cloud_medium", order: 2, svg: area(medium, COLOR.cloudMedium), label: { text: "Średnie", color: "#8a8a8a", at: [T.X(4), y(medium(4) - 0.6)] } },
          { requires: "cloud_low", order: 3, svg: area(low, COLOR.cloudLow), label: { text: "Niskie", color: "#5a5a5a", at: [T.X(6), y(low(6) - 0.6)] } },
          { requires: "cloud_very_low", order: 4, svg: area(veryLow, COLOR.cloudVeryLow), label: { text: "Bardzo niskie", color: COLOR.cloudVeryLow, at: [T.X(3), y(veryLow(3) - 0.4)] } },
          { requires: "cloud_high", order: 1, svg: outline(curve(high), COLOR.cloudHigh, 2), label: { text: "Wysokie", color: "#fff", box: "#333", lineColor: "#555", at: [T.X(2), y(high(2))] } },
          { requires: "fog", order: 5, svg: path(rectsPath(fog), { fill: COLOR.fog }), label: { text: "Mgła", color: COLOR.fog, box: "#333", lineColor: "#555", at: [T.X(9), yFog(0.4)] } },
          { requires: "cloud_coverage", order: 0, svg: outline(curve(total), COLOR.cloudTotal, 2), label: { text: "Zachmurzenie ogólne", color: COLOR.cloudTotal, at: [T.X(5), y(total(5))] } },
        ],
      };
    },
  },
};
