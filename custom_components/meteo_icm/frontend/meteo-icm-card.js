/*
 * Meteo ICM card - meteogram w układzie znanym z www.meteo.pl, rysowany jako SVG z atrybutów
 * sensora `sensor.meteo_icm_<miasto>_meteogram` (integracja meteo_icm). Ta sama karta obsługuje
 * prognozę 60 h (UM 4 km) i 240 h (GFS): panele i legenda dopasowują się do serii, które podaje model.
 *
 *   type: custom:meteo-icm-card
 *   entity: sensor.meteo_icm_warszawa_meteogram
 *   legend: left             # left (domyślnie) | bottom | none
 *   min_hour_width: 12       # px na godzinę; domyślnie 12 dla 60 h, 3 dla 240 h
 *   title: Warszawa          # opcjonalny nagłówek
 */

import { forecastOf } from "./lib/forecast.js";
import { renderMeteogram } from "./lib/render.js";
import { esc } from "./lib/svg.js";
import { COLOR, FONT } from "./lib/theme.js";

const CARD_VERSION = "0.3.0";
const TAG = "meteo-icm-card";
const LEGEND_MODES = ["left", "bottom", "none"];

const STYLE = `
  :host { display: block; }
  ha-card { background: #fafafa; overflow: hidden; }
  .card-header { color: ${COLOR.text}; }
  .scroll { overflow-x: auto; overflow-y: hidden; }
  svg { display: block; font-family: ${FONT}; }
  .message { padding: 16px; color: var(--error-color, #b00020); }
  .message:empty { display: none; }
`;

let instanceCount = 0;

function normalizeConfig(config) {
  if (!config?.entity) throw new Error("Podaj encję sensora meteogramu (entity)");
  const legend = config.legend ?? (config.show_legend === false ? "none" : "left");
  if (!LEGEND_MODES.includes(legend)) throw new Error(`legend: dozwolone wartości to ${LEGEND_MODES.join(", ")}`);
  if (config.min_hour_width !== undefined && !(Number(config.min_hour_width) > 0)) {
    throw new Error("min_hour_width musi być liczbą dodatnią");
  }
  return Object.freeze({
    ...config,
    legend,
    min_hour_width: config.min_hour_width === undefined ? undefined : Number(config.min_hour_width),
  });
}

class MeteoIcmCard extends HTMLElement {
  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states ?? {}).find(
      (id) => id.startsWith("sensor.") && hass.states[id].attributes?.first_ts !== undefined,
    );
    return { entity: entity ?? "sensor.meteo_icm_meteogram" };
  }

  #uid = `meteo-icm-${++instanceCount}`;
  #config = null;
  #hass = null;
  #shell = null; // { message, scroll } - szkielet tworzony raz na konfigurację
  #width = 0; // szerokość miejsca na wykres zgłoszona przez ResizeObserver
  #frame = 0;
  #rendered = null; // dane ostatniego renderu - pozwalają pominąć zbędne przerysowanie
  #height = 0;
  #observer = new ResizeObserver((entries) => {
    // contentRect nie wymusza przeliczenia układu (w przeciwieństwie do getBoundingClientRect);
    // floor, bo ułamek piksela ponad szerokość kontenera dałby pasek przewijania
    const width = Math.floor(entries.at(-1).contentRect.width);
    if (width > 0 && width !== this.#width) {
      this.#width = width;
      this.#schedule();
    }
  });

  setConfig(config) {
    this.#config = normalizeConfig(config);
    this.#shell = null; // nagłówek mógł się zmienić - szkielet budujemy od nowa
    this.#schedule();
  }

  set hass(hass) {
    const previous = this.#hass;
    this.#hass = hass;
    // HA wywołuje ten setter przy każdej zmianie dowolnej encji; obiekt stanu naszej encji
    // jest podmieniany tylko przy jej zmianie, więc porównanie referencji wystarcza.
    const entity = this.#config?.entity;
    if (!previous || previous.states[entity] !== hass.states[entity] || previous.config?.time_zone !== hass.config?.time_zone) {
      this.#schedule();
    }
  }

  getCardSize() {
    return this.#height ? Math.ceil(this.#height / 50) : 14;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6 };
  }

  connectedCallback() {
    if (this.#shell) this.#observer.observe(this.#shell.scroll);
    this.#schedule();
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** Zmiany konfiguracji, stanu i rozmiaru z jednej klatki dają jeden render. */
  #schedule() {
    if (this.#frame || !this.isConnected) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#render();
    });
  }

  /**
   * Szkielet (ha-card + kontener) powstaje raz: ha-card renderuje się asynchronicznie, więc świeżo
   * utworzony kontener ma szerokość 0 - rysujemy dopiero, gdy ResizeObserver poda jego wymiary.
   */
  #ensureShell() {
    if (this.#shell) return this.#shell;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const header = this.#config.title ? `<h1 class="card-header">${esc(this.#config.title)}</h1>` : "";
    root.innerHTML = `<style>${STYLE}</style><ha-card>${header}<div class="message"></div><div class="scroll"></div></ha-card>`;
    this.#shell = { message: root.querySelector(".message"), scroll: root.querySelector(".scroll") };
    this.#width = 0;
    this.#rendered = null;
    this.#observer.disconnect();
    this.#observer.observe(this.#shell.scroll);
    return this.#shell;
  }

  #render() {
    if (!this.#config) return;
    const shell = this.#ensureShell();
    const { entity } = this.#config;
    const state = this.#hass?.states[entity];
    let message = "";
    if (this.#hass && !state) message = `Nie znaleziono encji ${entity}`;
    else if (state && !Array.isArray(state.attributes.temperature)) message = `Encja ${entity} nie zawiera danych meteogramu`;
    shell.message.textContent = message;
    if (message || !state) {
      shell.scroll.replaceChildren();
      this.#rendered = null;
      return;
    }
    if (!this.#width) return; // ResizeObserver wywoła render, gdy kontener dostanie wymiary

    const timeZone = this.#hass.config?.time_zone;
    const last = this.#rendered;
    if (last && last.state === state && last.width === this.#width && last.config === this.#config && last.timeZone === timeZone) return;
    this.#rendered = { state, width: this.#width, config: this.#config, timeZone };

    const { svg, height } = renderMeteogram(forecastOf(state.attributes), {
      width: this.#width,
      config: this.#config,
      timeZone,
      uid: this.#uid,
    });
    this.#height = height;
    shell.scroll.innerHTML = svg;
  }
}

// Rejestracja elementu. Integracja ładuje kartę bardzo wcześnie (extra_module_url), a frontend HA
// po starcie podmienia window.customElements na własny rejestr (polyfill scoped registry) - definicja
// z pierwotnego rejestru jest wtedy dla Lovelace niewidoczna ("Custom element doesn't exist").
// Dlatego przez pierwsze 30 s pilnujemy, by karta była zdefiniowana w aktualnym rejestrze.
// Każda rejestracja używa nowej podklasy, bo jednego konstruktora nie można zarejestrować dwa razy.
function registerCard() {
  const registry = window.customElements;
  if (!registry.get(TAG)) registry.define(TAG, class extends MeteoIcmCard {});
  return registry;
}

if (!window.__meteoIcmCardLoaded) {
  window.__meteoIcmCardLoaded = true;
  const initial = registerCard();
  let attempts = 0;
  const timer = setInterval(() => {
    if (registerCard() !== initial || ++attempts >= 300) clearInterval(timer);
  }, 100);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: TAG,
    name: "Meteo ICM - meteogram",
    description: "Meteogram ICM (meteo.pl) 60 h lub 240 h z danych integracji meteo_icm",
    preview: false,
  });
  console.info(`%c METEO-ICM-CARD %c ${CARD_VERSION} `, "color:#fff;background:#0d47a1", "color:#0d47a1;background:#e3f2fd");
}
