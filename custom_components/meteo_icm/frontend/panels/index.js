// Panele meteogramu od góry. Panel bez danych w danym modelu jest pomijany, więc kolejność
// i odstępy dopasowują się same (np. GFS: bez pionowej rozciągłości chmur, z samą widzialnością).
//
// Panel: { id, height, gap?, gridExtra?, isAvailable(f), render(ctx) → spec ramki (lib/frame.js),
//          strip?: { id, gap, height, isAvailable(f), render(ctx) → svg, legendLeft(T, ctx) },
//          legend: { bottom(f, lay) → wiersze elementów, left(T, ctx) → miniatura (lib/legend.js) } }

import temperature from "./temperature.js";
import precipitation from "./precipitation.js";
import pressure from "./pressure.js";
import wind from "./wind.js";
import cloudLayers from "./cloud-layers.js";
import cloudCover from "./cloud-cover.js";

export default Object.freeze([temperature, precipitation, pressure, wind, cloudLayers, cloudCover]);
