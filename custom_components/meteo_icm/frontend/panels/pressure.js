import { axisTicks, colorBands } from "../lib/frame.js";
import { fmt, isNum, linearScale, niceStep, ticksBetween } from "../lib/math.js";
import { path } from "../lib/svg.js";
import { COLOR, pressureColor } from "../lib/theme.js";

// Lewa oś: ciśnienie na poziomie stacji (to ono wyznacza kolor wypełnienia), prawa: zredukowane do
// poziomu morza - podziałki lewej osi przesunięte o różnicę z pierwszej godziny, jak na meteo.pl.
export default {
  id: "pressure",
  height: 82,
  isAvailable: (f) => f.has("pressure_station"),

  render({ f, lay, defs, uid, top, h }) {
    const station = f.series("pressure_station");
    const reduced = f.series("pressure");
    const [min, max] = f.extent(["pressure_station"]);
    const step = niceStep(max - min + 2, 4);
    const lo = Math.floor((min - 1) / step) * step;
    const hi = Math.ceil((max + 1) / step) * step;
    const y = linearScale(lo, hi, top, h);
    const values = ticksBetween(lo, hi, step);
    const ticks = axisTicks(values, y);
    const offset = isNum(reduced[0]) && isNum(station[0]) ? Math.floor(reduced[0] - station[0]) : 0;
    const { curve, fill } = colorBands(defs, `${uid}-pressure-fill`, { values: station, x: lay.x, y, top, h, colorOf: pressureColor });
    return {
      title: ["Ciśnienie atmosferyczne", " hPa"],
      titleRight: f.has("pressure") ? ["Ciśnienie zredukowane", " hPa"] : null,
      left: ticks,
      right: f.has("pressure") ? ticks.map((t, i) => ({ ...t, label: fmt(values[i] + offset) })) : [],
      data: fill + path(curve, { fill: "none", stroke: COLOR.pressureLine, "stroke-width": 2 }),
    };
  },

  legend: {
    bottom: () => [],

    left(T, { defs, uid }) {
      const y = T.scale(1008, 1032);
      const pressure = (i) => 1013 + 14 * (i / 12) + 2 * T.wave(i * 1.5);
      const values = Array.from({ length: 13 }, (_, i) => pressure(i));
      const { curve, fill } = colorBands(defs, `${uid}-legend-pressure-fill`, { values, x: T.X, y, top: T.top, h: T.h, colorOf: pressureColor });
      return {
        base: T.night + T.grid([1016, 1024].map(y)),
        layers: [
          {
            svg: fill + path(curve, { fill: "none", stroke: COLOR.pressureLine, "stroke-width": 1.6 }),
            label: { text: "Ciśnienie na poziomie stacji", color: "#000", at: [T.X(7), y(pressure(7))] },
          },
          { label: { text: "Kolor: wartość ciśnienia", color: "#d84315", at: [T.X(4), T.top + T.h - 8] } },
        ],
        spread: [T.top + T.h / 2 - 8, T.top + T.h / 2 + 12],
      };
    },
  },
};
