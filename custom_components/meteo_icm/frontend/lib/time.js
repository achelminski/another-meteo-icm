// Czas: formatowanie w strefie czasowej HA oraz wschody i zachody słońca.

const DAY_MS = 86_400_000;
const formatters = new Map();

/** Intl.DateTimeFormat jest kosztowny w tworzeniu, więc trzymamy jedną instancję na strefę i format. */
export function dateFormat(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("pl-PL", { ...options, timeZone });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Wschód i zachód słońca (ms UTC) dla doby zawierającej `ms` - równanie wschodu słońca;
 * -0.833° uwzględnia refrakcję i promień tarczy. Zwraca null w dzień lub noc polarną.
 */
export function sunTimes(ms, lat, lon) {
  const rad = Math.PI / 180;
  const n = Math.ceil(ms / DAY_MS + 2440587.5 - 2451545.0 + 0.0008);
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW) / rad / 360;
  const toMs = (j) => (j - 2440587.5) * DAY_MS;
  return { rise: toMs(transit - w), set: toMs(transit + w) };
}

/** Noce [zachód, wschód następnego dnia] i wschody słońca w zakresie [t0, t1] z zapasem doby po obu stronach. */
export function sunSchedule(t0, t1, lat, lon) {
  const nights = [];
  const sunrises = [];
  let today = sunTimes(t0 - DAY_MS, lat, lon);
  for (let day = t0 - DAY_MS; day <= t1 + DAY_MS; day += DAY_MS) {
    const next = sunTimes(day + DAY_MS, lat, lon);
    if (today && next) nights.push([today.set, next.rise]);
    if (today) sunrises.push(today.rise);
    today = next;
  }
  return { nights, sunrises };
}
