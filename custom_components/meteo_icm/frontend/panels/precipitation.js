import { axisTicks } from "../lib/frame.js";
import { clamp, isNum, linearScale } from "../lib/math.js";
import { dotsPath, group, path, rect, rectsPath, segmentsPath, smoothPath, text } from "../lib/svg.js";
import { COLOR, STORM_COLORS, STORM_STROKE, precipitationColor, stormColor } from "../lib/theme.js";

const AXIS_MAX = 5; // mm/h; wyższy opad maksymalny zaznaczany kolorem "powyżej skali"
const MIN_SHOWN = 0.05; // mm/h; mniejsze opady nie są rysowane

/** Wartości pogrupowane według koloru, żeby każdy kolor był jedną ścieżką. */
function byColor() {
  const map = new Map();
  return {
    add(color, item) {
      if (!map.has(color)) map.set(color, []);
      map.get(color).push(item);
    },
    entries: () => map.entries(),
  };
}

/** Pasek szansy opadu: maksimum z okna godzin kończącego się na kolejnej podziałce. */
const probability = {
  id: "probability",
  gap: 6,
  height: 19,
  isAvailable: (f) => f.has("precipitation_probability"),

  render({ f, lay, top, h }) {
    const values = f.series("precipitation_probability");
    const bounds = lay.probabilityBounds;
    const labels = [];
    const separators = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      let max = -Infinity;
      for (let i = bounds[k] + 1; i <= bounds[k + 1]; i++) if (isNum(values[i]) && values[i] > max) max = values[i];
      const x0 = lay.x(bounds[k]);
      if (max > -Infinity) labels.push(text((x0 + lay.x(bounds[k + 1])) / 2, top + 15, Math.round(max)));
      if (k > 0) separators.push([x0, top, x0, top + h]);
    }
    const fontSize = lay.probabilityWindow * lay.hourWidth >= 30 ? 14 : 11;
    return (
      path(segmentsPath(separators), { stroke: COLOR.grid }) +
      group(labels.join(""), { "font-size": fontSize, "font-weight": 700, fill: COLOR.probability, "text-anchor": "middle" })
    );
  },

  legendLeft(T, { lay }) {
    const values = ["0", "23", "45", "10"];
    return {
      base: T.night +
        path(segmentsPath([1, 2, 3].map((k) => [T.X(3 * k), T.top, T.X(3 * k), T.top + T.h])), { stroke: COLOR.grid }) +
        group(values.map((v, k) => text((T.X(3 * k) + T.X(3 * k + 3)) / 2, T.top + 14, v)).join(""),
          { "font-size": 11, "font-weight": 700, fill: COLOR.probability, "text-anchor": "middle" }),
      layers: [{ label: { text: `Szansa opadu % (max z ${lay.probabilityWindow} h)`, color: COLOR.probability, at: [T.X(4.5), T.top + T.h / 2] } }],
      spread: [T.top + T.h / 2 + 4, T.top + T.h / 2 + 4],
    };
  },
};

export default {
  id: "precipitation",
  height: 81,
  gridExtra: 4,
  isAvailable: (f) => f.hasAny(["precipitation", "humidity"]),
  strip: probability,

  render({ f, lay, top, h }) {
    const scale = linearScale(0, AXIS_MAX, top, h);
    const y = (v) => scale(Math.min(v, AXIS_MAX));
    const yHumidity = (v) => top + h - ((clamp(v, 50, 100) - 50) / 50) * h;
    const bottom = top + h;
    const types = f.series("precipitation_type");
    const precipitationMax = f.series("precipitation_max");
    const barWidth = lay.hourWidth * 0.7;
    // Opad i burza to sumy za godzinę kończącą się o czasie i - środek tej godziny, jak na meteo.pl.
    const xHour = (i) => lay.x(i - 0.5);

    const bars = byColor();
    const maxLines = byColor();
    const overScale = [];
    f.series("precipitation").forEach((v, i) => {
      const x = xHour(i);
      const color = precipitationColor(types[i]);
      if (!color) return; // opad śladowy - bez słupka
      const vMax = precipitationMax[i];
      if (isNum(vMax) && vMax > MIN_SHOWN) {
        if (vMax > AXIS_MAX) overScale.push([x, bottom, x, top]);
        else maxLines.add(color, [x, bottom, x, y(vMax)]);
      }
      if (isNum(v) && v >= MIN_SHOWN) bars.add(color, [x - barWidth / 2, y(v), barWidth, bottom - y(v)]);
    });

    const storms = byColor();
    const flash = f.series("flash");
    f.series("storm").forEach((v, i) => {
      if (isNum(v) && v > 0) storms.add(stormColor(flash[i]), [xHour(i), top + 6]);
    });
    const stormRadius = Math.min(4, lay.dotRadius);

    let data = "";
    for (const [color, lines] of maxLines.entries()) data += path(segmentsPath(lines), { stroke: color, "stroke-width": 1.2, opacity: 0.3 });
    data += path(segmentsPath(overScale), { stroke: COLOR.overScale, "stroke-width": 1.2 });
    for (const [color, rects] of bars.entries()) data += path(rectsPath(rects), { fill: color });
    for (const [color, points] of storms.entries()) {
      data += path(dotsPath(points, stormRadius), { fill: color, stroke: STORM_STROKE, "stroke-width": 1 });
    }
    data += path(smoothPath(f.points("humidity", lay.x, yHumidity)), { fill: "none", stroke: COLOR.humidity, "stroke-width": 3 });

    return {
      title: ["Opad", " mm/h"],
      titleRight: f.has("humidity") ? ["Wilgotność wzgl.", " %"] : null,
      left: axisTicks([1, 2, 3, 4, 5], scale, undefined, 1),
      right: f.has("humidity") ? [70, 90].map((v) => ({ y: yHumidity(v), label: String(v), bold: true })) : [],
      data,
    };
  },

  legend: {
    bottom: () => [[
      { kind: "tri", colors: [COLOR.rain, COLOR.snow, COLOR.sleet], text: "Deszcz/Śnieg/Deszcz ze śniegiem" },
      { kind: "tribar", colors: [COLOR.rain, COLOR.snow, COLOR.sleet], text: "Opad max", requires: "precipitation_max" },
      { kind: "vbar", color: COLOR.overScale, text: "Opad maks. powyżej skali", requires: "precipitation_max" },
      { kind: "tridot", colors: STORM_COLORS, stroke: STORM_STROKE, text: "Burza możliwa/słaba/umiark./silna", requires: "storm" },
      { kind: "line", color: COLOR.humidity, text: "Wilgotność wzgl.", right: true, requires: "humidity" },
    ]],

    left(T) {
      const y = T.scale(0, AXIS_MAX);
      const yHumidity = T.scale(50, 100);
      const humidity = (i) => 82 + 10 * T.wave(i, 0.8);
      const barWidth = T.hourWidth * 0.7;
      const kinds = [
        { color: COLOR.rain, values: [[1, 0.6], [2, 1.5], [3, 2.6], [4, 1.2]] },
        { color: COLOR.sleet, values: [[5, 1.2], [6, 2.0], [7, 0.8]] },
        { color: COLOR.snow, values: [[8, 1.6], [9, 2.4], [10, 1.1], [11, 0.5]] },
      ];
      const bars = kinds.map(({ color, values }) =>
        path(rectsPath(values.map(([i, v]) => [T.X(i) - barWidth / 2, y(v), barWidth, T.top + T.h - y(v)])), { fill: color })).join("");
      const maxLines = kinds.map(({ color, values }) =>
        path(segmentsPath(values.map(([i, v]) => [T.X(i), T.top + T.h, T.X(i), y(v + 1.3)])), { stroke: color, "stroke-width": 1.2, opacity: 0.3 })).join("");
      return {
        base: T.night + T.grid([1, 2, 3, 4].map(y)),
        layers: [
          {
            requires: "precipitation_max", order: 3,
            svg: maxLines,
            label: { text: "Opad maksymalny", color: "#5cb85c", at: [T.X(2), y(2.8)] },
          },
          {
            requires: "precipitation_max", order: 1,
            svg: path(`M${T.X(3)},${T.top + T.h}V${T.top}`, { stroke: COLOR.overScale, "stroke-width": 1.2 }),
            label: { text: "Opad maks. powyżej skali", color: COLOR.overScale, at: [T.X(3), T.top + 14] },
          },
          { svg: bars, order: 4, label: { text: "Deszcz", color: COLOR.rain, at: [T.X(1), y(0.3)] } },
          { order: 5, label: { text: "Deszcz ze śniegiem", color: COLOR.sleet, at: [T.X(6), y(1)] } },
          { order: 6, label: { text: "Śnieg", color: COLOR.snow, at: [T.X(9), y(1.2)] } },
          {
            requires: "storm", order: 0,
            svg: STORM_COLORS.map((c, k) => path(dotsPath([[T.X(8 + k), T.top + 6]], 3), { fill: c, stroke: STORM_STROKE, "stroke-width": 0.8 })).join(""),
            label: { text: "Burza możliwa/słaba/umiark./silna", color: "#c62828", at: [T.X(9.5), T.top + 6] },
          },
          {
            requires: "humidity", order: 2,
            svg: path(smoothPath(T.points((i) => yHumidity(humidity(i)))), { fill: "none", stroke: COLOR.humidity, "stroke-width": 2 }),
            label: { text: "Wilgotność wzgl.", color: COLOR.humidity, at: [T.X(6), yHumidity(humidity(6))] },
          },
        ],
      };
    },
  },
};
