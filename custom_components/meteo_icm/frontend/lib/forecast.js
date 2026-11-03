// Widok danych meteogramu z atrybutów sensora `sensor.meteo_icm_*_meteogram`.

import { extent, isNum } from "./math.js";
import { sunSchedule } from "./time.js";

const EMPTY = Object.freeze([]);
const NO_SUN = Object.freeze({ nights: EMPTY, sunrises: EMPTY });
const cache = new WeakMap();

/**
 * Jedna instancja na obiekt atrybutów. HA tworzy nowy obiekt stanu tylko przy zmianie encji,
 * więc wartości pochodne (dostępność serii, zakresy, noce) liczą się raz na przebieg modelu,
 * a nie przy każdej zmianie rozmiaru karty.
 */
export function forecastOf(attributes) {
  let forecast = cache.get(attributes);
  if (!forecast) {
    forecast = new Forecast(attributes);
    cache.set(attributes, forecast);
  }
  return forecast;
}

export class Forecast {
  #attributes;
  #has = new Map();
  #extents = new Map();
  #sun = null;

  constructor(attributes) {
    this.#attributes = attributes;
    this.n = attributes.temperature.length;
    this.t0 = attributes.first_ts * 1000;
    this.dt = (attributes.interval ?? 3600) * 1000;
    this.t1 = this.t0 + (this.n - 1) * this.dt;
    this.latitude = isNum(attributes.latitude) ? attributes.latitude : null;
    this.longitude = isNum(attributes.longitude) ? attributes.longitude : null;
  }

  /** Seria godzinowa; pusta tablica, gdy model jej nie podaje (np. GFS nie ma temperatur min/max). */
  series(key) {
    const values = this.#attributes[key];
    return Array.isArray(values) ? values : EMPTY;
  }

  /** Czy seria ma choć jedną wartość. */
  has(key) {
    let result = this.#has.get(key);
    if (result === undefined) {
      result = this.series(key).some(isNum);
      this.#has.set(key, result);
    }
    return result;
  }

  hasAny(keys) {
    return keys.some((key) => this.has(key));
  }

  /** [min, max] z podanych serii albo null. */
  extent(keys) {
    const id = keys.join();
    if (!this.#extents.has(id)) this.#extents.set(id, extent(keys.map((key) => this.series(key))));
    return this.#extents.get(id);
  }

  time(i) {
    return this.t0 + i * this.dt;
  }

  /** Punkty [x(i), y(v)] serii; null w miejscu brakującej wartości (przerywa linię). */
  points(key, x, y) {
    return this.series(key).map((v, i) => (isNum(v) ? [x(i), y(v)] : null));
  }

  /** Noce i wschody słońca dla współrzędnych prognozy. */
  get sun() {
    if (!this.#sun) {
      this.#sun = this.latitude === null || this.longitude === null
        ? NO_SUN
        : sunSchedule(this.t0, this.t1, this.latitude, this.longitude);
    }
    return this.#sun;
  }
}
