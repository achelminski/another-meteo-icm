// Funkcje liczbowe wspólne dla paneli: skale osi, zakresy serii, dobór kroków.

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Zaokrąglenie do `digits` miejsc po przecinku jako tekst. */
export const fmt = (v, digits = 0) => (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits);

/** Najmniejsza i największa skończona wartość z kilku tablic; null, gdy żadnej nie ma. */
export function extent(arrays) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const values of arrays) {
    for (const v of values) {
      if (!isNum(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** "Ładny" krok osi: mnożnik × 10^n, przy którym zakres dzieli się na ok. `ticks` przedziałów. */
export function niceStep(range, ticks, multipliers = [1, 2, 5, 10]) {
  const raw = range / ticks;
  if (!(raw > 0)) return multipliers[0];
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return multipliers.map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
}

/** Wartości lo, lo + step, ... ≤ hi (liczone mnożeniem, bez kumulacji błędu zaokrągleń). */
export function ticksBetween(lo, hi, step) {
  const values = [];
  for (let k = 0; lo + k * step <= hi + 1e-9; k++) values.push(lo + k * step);
  return values;
}

/** Skala liniowa: wartość → y w pikselach (oś rośnie w górę). */
export const linearScale = (lo, hi, top, h) => (v) => top + h - ((v - lo) / (hi - lo)) * h;

/** Skala odcinkowo liniowa: kolejne wartości `stops` trafiają na równe części wysokości. */
export function piecewiseScale(stops, top, h) {
  const last = stops.length - 1;
  return (v) => {
    const c = clamp(v, stops[0], stops[last]);
    let i = 0;
    while (i < last - 1 && c > stops[i + 1]) i++;
    return top + h - ((i + (c - stops[i]) / (stops[i + 1] - stops[i])) / last) * h;
  };
}

/** Pierwszy krok z listy, dla którego odstęp `step × unit` px wynosi co najmniej `minPx`. */
export const pickStep = (steps, unit, minPx) => steps.find((s) => s * unit >= minPx) ?? steps.at(-1);
