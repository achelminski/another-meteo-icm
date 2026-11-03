// Układ poziomy meteogramu: tryb legendy, skala czasu i kroki zależne od gęstości osi.
// Wszystko, co zależy od liczby godzin, wynika tu z szerokości godziny w pikselach - dzięki temu
// ten sam kod rysuje prognozę 60 h (UM) i 240 h (GFS).

import { clamp, pickStep } from "./math.js";
import { dateFormat } from "./time.js";

export const AXIS_LEFT = 50;
export const AXIS_RIGHT = 50;
export const LEGEND_WIDTH = 300;

// Prognoza 60 h mieści się w typowej karcie przy 12 px/h (wtedy etykiety godzin się nie zlewają).
// 240 h przy takiej gęstości miałoby prawie 3000 px, dlatego długie prognozy dostają 3 px/h,
// a etykiety, okna szansy opadu i strzałki wiatru są odpowiednio rzadsze.
const LONG_FORECAST = 120;
const MIN_HOUR_WIDTH_SHORT = 12;
const MIN_HOUR_WIDTH_LONG = 3;
const MIN_HOUR_WIDTH_LEFT_LEGEND = 10; // kolumna legendy zabiera miejsce, więc przy niej wystarcza 10 px/h

const HOUR_STEPS = [3, 6, 12, 24];
const ARROW_STEPS = [1, 2, 3, 6, 12];
const LABEL_MIN_PX = 28; // etykieta "05" z odstępem
const LABEL_WITH_MINUTES_MIN_PX = 39; // etykieta "05:00"
const PROBABILITY_MIN_PX = 16;
const ARROW_MIN_PX = 11;

/**
 * @param {import("./forecast.js").Forecast} f
 * @param {number} cardWidth szerokość miejsca na wykres (px)
 * @param {{legend: "left"|"bottom"|"none", min_hour_width?: number}} config
 * @param {string|undefined} timeZone strefa czasowa HA
 */
export function computeLayout(f, cardWidth, config, timeZone) {
  const span = Math.max(f.n - 1, 1);
  const minHourWidth = config.min_hour_width ?? (f.n > LONG_FORECAST ? MIN_HOUR_WIDTH_LONG : MIN_HOUR_WIDTH_SHORT);
  const minHourWidthLeft = Math.min(minHourWidth, MIN_HOUR_WIDTH_LEFT_LEGEND);

  // Legenda po lewej przechodzi pod panele, gdy przy kolumnie legendy wykres byłby zbyt gęsty (np. telefon).
  let mode = config.legend;
  if (mode === "left" && (cardWidth - AXIS_LEFT - LEGEND_WIDTH - AXIS_RIGHT) / span < minHourWidthLeft) mode = "bottom";
  const legendWidth = mode === "left" ? LEGEND_WIDTH : 0;
  const left = AXIS_LEFT + legendWidth;
  const hourWidth = Math.max((cardWidth - left - AXIS_RIGHT) / span, mode === "left" ? minHourWidthLeft : minHourWidth);
  const right = left + hourWidth * span;
  const x = (i) => left + i * hourWidth;
  const xt = (ms) => left + ((ms - f.t0) / f.dt) * hourWidth;

  // Podziałki co `step` godzin. Krok 3 h liczony od początku prognozy, jak na meteo.pl;
  // dłuższe kroki wyrównane do pełnych godzin zegara (00, 06, 12, 18), żeby oś była czytelna.
  const localHour = dateFormat(timeZone, { hour: "numeric", hourCycle: "h23" });
  const indicesEvery = (step) => {
    let first = step;
    if (step > 3) {
      for (let i = 1; i <= step; i++) {
        if (Number(localHour.format(f.time(i))) % step === 0) {
          first = i;
          break;
        }
      }
    }
    const indices = [];
    for (let i = first; i < f.n; i += step) indices.push(i);
    return indices;
  };

  const labelStep = pickStep(HOUR_STEPS, hourWidth, LABEL_MIN_PX);
  const probabilityWindow = pickStep(HOUR_STEPS, hourWidth, PROBABILITY_MIN_PX);
  const probabilityBounds = [0, ...indicesEvery(probabilityWindow).filter((i) => i < f.n - 1), f.n - 1];

  const hourFormat = dateFormat(
    timeZone,
    labelStep * hourWidth >= LABEL_WITH_MINUTES_MIN_PX ? { hour: "2-digit", minute: "2-digit" } : { hour: "2-digit" },
  );
  const dayWidth = (86_400_000 / f.dt) * hourWidth;
  const compactDays = dayWidth < 130;
  const dayFormat = dateFormat(timeZone, {
    ...(!compactDays ? { weekday: "long" } : dayWidth >= 70 ? { weekday: "short" } : {}),
    day: "2-digit",
    month: "2-digit",
  });
  const dayLabel = (ms) => {
    const part = {};
    for (const { type, value } of dayFormat.formatToParts(ms)) part[type] = value;
    return part.weekday ? `${part.weekday} ${part.day}.${part.month}` : `${part.day}.${part.month}`;
  };

  // Noce przycięte do obszaru wykresu; dni zaczynają się o wschodzie słońca (albo z początkiem prognozy).
  const nights = f.sun.nights
    .map(([set, rise]) => [Math.max(xt(set), left), Math.min(xt(rise), right)])
    .filter(([a, b]) => b > a);
  const dayStarts = f.sun.sunrises.filter((ms) => ms >= f.t0 && ms <= f.t1);
  if (!nights.length || nights[0][0] > left + 1) dayStarts.unshift(f.t0);

  return Object.freeze({
    mode,
    legendWidth,
    left,
    right,
    width: right + AXIS_RIGHT,
    hourWidth,
    x,
    xt,
    labelTicks: indicesEvery(labelStep),
    minorTickStep: hourWidth >= 3 ? 1 : 3,
    probabilityWindow,
    probabilityBounds,
    arrowStep: pickStep(ARROW_STEPS, hourWidth, ARROW_MIN_PX),
    dotRadius: clamp(hourWidth * 0.42, 1.2, 4.2),
    hourLabel: (ms) => hourFormat.format(ms),
    dayLabel,
    nightLabels: !compactDays, // przy gęstej osi napis "NOC" nachodziłby na etykiety dni
    nights,
    dayStarts,
  });
}
