// Testy karty bez przeglądarki: `node --test tests/frontend`.
// Fikstury to atrybuty sensorów meteogramu (Warszawa) dla prognozy 60 h (UM) i 240 h (GFS).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { forecastOf } from "../../custom_components/meteo_icm/frontend/lib/forecast.js";
import { computeLayout } from "../../custom_components/meteo_icm/frontend/lib/layout.js";
import { renderMeteogram } from "../../custom_components/meteo_icm/frontend/lib/render.js";
import { smoothPath } from "../../custom_components/meteo_icm/frontend/lib/svg.js";
import { pressureColor } from "../../custom_components/meteo_icm/frontend/lib/theme.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const UM = fixture("um4_60_warszawa");
const GFS = fixture("gfs_warszawa");
const TZ = "Europe/Warsaw";

const render = (attributes, width, config = {}) =>
  renderMeteogram(forecastOf(attributes), { width, config: { legend: "left", ...config }, timeZone: TZ, uid: "t" });

function assertWellFormed(svg) {
  assert.doesNotMatch(svg, /NaN|undefined|Infinity|\[object/);
  assert.equal((svg.match(/<svg/g) ?? []).length, 1);
}

test("60 h: wszystkie panele i legenda po lewej mieszczą się w szerokości karty", () => {
  const { svg, width } = render(UM, 1024);
  assertWellFormed(svg);
  assert.equal(width, 1024);
  for (const title of ["Temperatura", "Opad", "Ciśnienie atmosferyczne", "Wiatr", "Pionowa rozciągłość chmur", "Zachmurzenie"]) {
    assert.match(svg, new RegExp(`>${title}<`));
  }
  assert.match(svg, /Temp\. powietrza 1\.5m min\/max/);
  assert.match(svg, /Czas lokalny/);
});

test("240 h: brak paneli i podpisów dla serii, których GFS nie podaje", () => {
  const { svg, width } = render(GFS, 1024);
  assertWellFormed(svg);
  assert.equal(width, 1024);
  assert.doesNotMatch(svg, /Pionowa rozciągłość chmur|Wierzchołek chmur/);
  assert.match(svg, />Widzialność</);
  assert.doesNotMatch(svg, /max\/min|Burza|Bardzo niskie|Opad max/);
});

test("240 h: legenda po lewej przechodzi pod panele, gdy wykres byłby zbyt gęsty", () => {
  assert.equal(computeLayout(forecastOf(GFS), 1024, { legend: "left" }, TZ).mode, "bottom");
  assert.equal(computeLayout(forecastOf(GFS), 1600, { legend: "left" }, TZ).mode, "left");
});

test("kroki osi wynikają z szerokości godziny", () => {
  const um = computeLayout(forecastOf(UM), 1024, { legend: "none" }, TZ);
  assert.equal(um.labelTicks[0], 3);
  assert.equal(um.labelTicks[1] - um.labelTicks[0], 3);
  assert.equal(um.arrowStep, 1);

  const gfs = computeLayout(forecastOf(GFS), 1024, { legend: "none" }, TZ);
  assert.equal(gfs.labelTicks[1] - gfs.labelTicks[0], 12);
  assert.ok(gfs.arrowStep > 1);
  // długie kroki wyrównane do pełnych godzin zegara
  const f = forecastOf(GFS);
  assert.ok(gfs.labelTicks.every((i) => ["00:00", "12:00"].includes(gfs.hourLabel(f.time(i)))));
});

test("wąska karta przewija się zamiast ściskać godziny poniżej minimum", () => {
  assert.equal(render(UM, 500, { legend: "bottom" }).width, 50 + 50 + 12 * 59);
  assert.equal(render(UM, 500, { legend: "bottom", min_hour_width: 6 }).width, 500);
});

test("dane pochodne liczone raz na obiekt atrybutów", () => {
  assert.equal(forecastOf(UM), forecastOf(UM));
  assert.notEqual(forecastOf({ ...UM }), forecastOf(UM));
});

test("pomocniki rysowania", () => {
  assert.equal(pressureColor(1018.0), pressureColor(1019.8)); // to samo pasmo 2 hPa
  assert.notEqual(pressureColor(1018.0), pressureColor(1020.0));
  assert.equal((smoothPath([[0, 0], [1, 1], null, [3, 3], [4, 4]]).match(/M/g) ?? []).length, 2);
});
