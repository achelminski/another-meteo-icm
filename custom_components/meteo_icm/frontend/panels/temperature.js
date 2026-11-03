import { axisTicks } from "../lib/frame.js";
import { isNum, linearScale, niceStep, ticksBetween } from "../lib/math.js";
import { bandPath, dotsPath, path, rect, segmentsPath, smoothPath } from "../lib/svg.js";
import { COLOR } from "../lib/theme.js";

const SERIES = [
  "temperature", "temperature_min", "temperature_max",
  "apparent_temperature", "apparent_temperature_min", "apparent_temperature_max",
  "ground_temperature_min", "ground_temperature_max", "dew_point",
];

const line = (color) => ({ fill: "none", stroke: color, "stroke-width": 3 });

export default {
  id: "temperature",
  height: 82,
  isAvailable: (f) => f.has("temperature"),

  render({ f, lay, top, h }) {
    const [min, max] = f.extent(SERIES);
    const step = Math.max(5, niceStep(max - min, 4));
    const lo = Math.floor(min / step) * step;
    const hi = Math.max(Math.ceil(max / step) * step, lo + step);
    const y = linearScale(lo, hi, top, h);
    const pts = (key) => f.points(key, lay.x, y);
    const ticks = axisTicks(ticksBetween(lo, hi, step), y);

    const groundMin = f.series("ground_temperature_min");
    const ground = [];
    f.series("ground_temperature_max").forEach((v, i) => {
      if (isNum(v) && isNum(groundMin[i])) ground.push([lay.x(i), y(v), lay.x(i), y(groundMin[i])]);
    });

    return {
      title: ["Temperatura", " °C"],
      titleRight: ["Temperatura", " °C"],
      left: ticks,
      right: ticks,
      background: lo < 0 ? rect(lay.left, y(0), lay.right - lay.left, top + h - y(0), { fill: COLOR.sky }) : "",
      data:
        path(bandPath(pts("temperature_max"), pts("temperature_min")), { fill: COLOR.tempBand }) +
        path(bandPath(pts("apparent_temperature_max"), pts("apparent_temperature_min")), { fill: COLOR.apparentBand }) +
        path(segmentsPath(ground), { stroke: COLOR.ground, "stroke-width": 2 }) +
        path(dotsPath(pts("dew_point").filter(Boolean), lay.dotRadius), { fill: COLOR.dew }) +
        path(smoothPath(pts("apparent_temperature")), line(COLOR.apparent)) +
        path(smoothPath(pts("temperature")), line(COLOR.temp)),
    };
  },

  legend: {
    bottom: () => [
      [
        { kind: "line", color: COLOR.temp, text: "Temp. powietrza 1.5m" },
        { kind: "vbar", color: COLOR.ground, text: "Temp. pow. gruntu max/min", requires: "ground_temperature_max" },
        { kind: "line", color: COLOR.apparent, text: "Temp. odczuwalna", right: true, requires: "apparent_temperature" },
        { kind: "block", color: COLOR.apparentBand, text: "Temp. odczuwalna max/min", right: true, requires: "apparent_temperature_max" },
      ],
      [
        { kind: "block", color: COLOR.tempBand, text: "Temp. powietrza 1.5m max/min", requires: "temperature_max" },
        { kind: "dot", color: COLOR.dew, text: "Temp. punktu rosy", right: true, requires: "dew_point" },
      ],
    ],

    left(T) {
      const y = T.scale(-5, 15);
      const air = (i) => 6 + 4 * T.wave(i);
      const apparent = (i) => air(i) - 2.5;
      const dew = (i) => air(i) - 5;
      const band = (fn) => bandPath(T.points((i) => y(fn(i) + 1.5)), T.points((i) => y(fn(i) - 1.5)));
      const curve = (fn, color) => path(smoothPath(T.points((i) => y(fn(i)))), { fill: "none", stroke: color, "stroke-width": 2 });
      const odd = [1, 3, 5, 7, 9, 11];
      const even = [0, 2, 4, 6, 8, 10, 12];
      return {
        base: rect(T.x, y(0), T.w, T.top + T.h - y(0), { fill: COLOR.sky }) + T.night + T.grid([y(0), y(5), y(10)]),
        layers: [
          {
            requires: "temperature_max", order: 1,
            svg: path(band(air), { fill: COLOR.tempBand }),
            label: { text: "Temp. powietrza 1.5m min/max", color: "#e57373", at: [T.X(3), y(air(3) + 1.2)] },
          },
          {
            requires: "apparent_temperature_max", order: 3,
            svg: path(band(apparent), { fill: COLOR.apparentBand }),
            label: { text: "Temp. odczuwalna min/max", color: "#4a9de0", at: [T.X(10), y(apparent(10) - 1.2)] },
          },
          {
            requires: "ground_temperature_max", order: 4,
            svg: path(segmentsPath(odd.map((i) => [T.X(i), y(air(i) + 3), T.X(i), y(air(i) - 6)])), { stroke: COLOR.ground, "stroke-width": 1.5 }),
            label: { text: "Temp. gruntu min/max", color: COLOR.ground, at: [T.X(5), y(air(5) + 3)] },
          },
          {
            requires: "dew_point", order: 5,
            svg: path(dotsPath(even.map((i) => [T.X(i), y(dew(i))]), 2.6), { fill: COLOR.dew }),
            label: { text: "Temp. punktu rosy", color: COLOR.dew, at: [T.X(4), y(dew(4))] },
          },
          {
            requires: "apparent_temperature", order: 2,
            svg: curve(apparent, COLOR.apparent),
            label: { text: "Temp. odczuwalna", color: COLOR.apparent, at: [T.X(8), y(apparent(8))] },
          },
          {
            order: 0,
            svg: curve(air, COLOR.temp),
            label: { text: "Temp. powietrza 1.5m", color: COLOR.temp, at: [T.X(6), y(air(6))] },
          },
        ],
      };
    },
  },
};
