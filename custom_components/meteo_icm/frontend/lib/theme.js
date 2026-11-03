// Kolory i skale barwne meteogramu (skalibrowane na meteogramie www.meteo.pl).

import { isNum } from "./math.js";

export const FONT = "Roboto, 'Noto Sans', sans-serif";

export const COLOR = Object.freeze({
  text: "#202020",
  axis: "#555",
  legend: "#666",
  grid: "rgba(0,0,0,0.16)",
  night: "rgba(0,0,0,0.105)",
  timelineNight: "#eceff3",
  nightLabel: "#96a2b4",
  now: "#ff0000",
  sky: "#87cefa",
  temp: "#ff0000",
  tempBand: "rgba(255,182,193,0.55)",
  apparent: "#0000ff",
  apparentBand: "rgba(135,206,250,0.7)",
  ground: "#a01414",
  dew: "#6a5acd",
  rain: "#00a000",
  snow: "#1e3cc8",
  sleet: "#c800c8",
  overScale: "#ff0000",
  humidity: "#e0481c",
  probability: "#00a000",
  pressureLine: "#000",
  windLine: "#555",
  gust: "#14196e",
  arrow: "#1e88e5",
  arrowDark: "#0d47a1",
  cloudTop: "#b22222",
  visibility: "#ffb400",
  cloudVeryLow: "#333",
  cloudLow: "#5a5a5a",
  cloudMedium: "#9a9a9a",
  cloudHigh: "#fff",
  cloudTotal: "#e64a19",
  fog: "#ffb400",
});

/** Burza słaba / umiarkowana / silna. */
export const STORM_COLORS = Object.freeze(["#f0a030", "#e02020", "#8b4513"]);
export const stormColor = (v) => STORM_COLORS[v >= 3 ? 2 : v >= 2 ? 1 : 0];

/** Podstawy chmur od najmniejszego pokrycia (rysowane najpierw, większe pokrycie na wierzchu). */
export const CLOUD_BASES = Object.freeze([
  { key: "cloud_base_01", fill: "#ffffff", stroke: "#8a8a8a", label: ">0.1 okt." },
  { key: "cloud_base_25", fill: "#c8c8c8", stroke: "#8a8a8a", label: ">2.5 okt." },
  { key: "cloud_base_45", fill: "#8c8c8c", stroke: "#6e6e6e", label: ">4.5 okt." },
  { key: "cloud_base_65", fill: "#4d4d4d", stroke: "#3a3a3a", label: ">6.5 okt." },
  { key: "cloud_base_79", fill: "#000000", stroke: "#000000", label: ">7.9 okt." },
]);

/**
 * Rodzaj opadu nie jest w API opisany, więc wynika z temperatury powietrza:
 * ≤ 0 °C śnieg, ≤ 2 °C deszcz ze śniegiem, powyżej deszcz.
 */
export function precipitationColor(temperature) {
  if (isNum(temperature) && temperature <= 0) return COLOR.snow;
  if (isNum(temperature) && temperature <= 2) return COLOR.sleet;
  return COLOR.rain;
}

// Ciśnienie na poziomie stacji (hPa): pasma co 2 hPa z granicami w x1.9, x3.9, ...;
// kolor pasma interpolowany między punktami kontrolnymi.
const PRESSURE_STOPS = [
  [916, [240, 240, 240]], [940, [195, 200, 235]], [960, [120, 120, 215]], [975, [40, 60, 175]],
  [985, [20, 100, 225]], [990, [0, 140, 245]], [995, [0, 200, 250]], [999, [0, 230, 200]],
  [1004, [0, 190, 90]], [1009, [100, 210, 40]], [1013, [210, 230, 30]], [1016.9, [255, 205, 0]],
  [1018.9, [255, 175, 0]], [1020.9, [255, 135, 0]], [1022.9, [250, 95, 0]], [1024.9, [245, 55, 0]],
  [1026.9, [240, 25, 0]], [1028.9, [228, 10, 35]], [1030.9, [220, 20, 60]], [1040, [170, 0, 90]],
  [1060, [110, 0, 110]], [1085, [40, 0, 40]],
];
const pressureColors = new Map();

export function pressureColor(p) {
  const band = Math.floor((p - 1.9) / 2); // kolor zależy tylko od pasma, więc liczymy go raz na pasmo
  let color = pressureColors.get(band);
  if (color) return color;
  const mid = Math.min(Math.max(band * 2 + 2.9, PRESSURE_STOPS[0][0]), PRESSURE_STOPS.at(-1)[0]);
  let i = 0;
  while (i < PRESSURE_STOPS.length - 2 && mid > PRESSURE_STOPS[i + 1][0]) i++;
  const [p0, c0] = PRESSURE_STOPS[i];
  const [p1, c1] = PRESSURE_STOPS[i + 1];
  const t = (mid - p0) / (p1 - p0);
  color = `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * t)).join(",")})`;
  pressureColors.set(band, color);
  return color;
}

// Prędkość wiatru (m/s): górne granice pasm (~1.1 m/s) i ich kolory.
const WIND_BANDS = [
  [0.75, "#80ffff"], [1.8, "#00ffff"], [2.92, "#00c3ff"], [4.05, "#0082ff"], [5.2, "#004b82"],
  [6.3, "#008200"], [7.4, "#1ec800"], [8.6, "#4bff1e"], [10.5, "#c8ff82"], [13, "#ffff00"],
  [16, "#ffaa00"], [20, "#ff5000"], [Infinity, "#c80000"],
];

export const windColor = (v) => WIND_BANDS.find(([max]) => v < max)[1];
