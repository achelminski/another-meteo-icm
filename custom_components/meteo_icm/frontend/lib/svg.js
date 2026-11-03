// Składanie znaczników SVG jako tekstu. Karta podmienia cały wykres jednym innerHTML, co przy
// tysiącach elementów jest szybsze niż budowanie drzewa DOM węzeł po węźle. Serie punktów,
// słupków i odcinków składamy w pojedyncze ścieżki, żeby liczba węzłów nie rosła z długością prognozy.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);

/** Współrzędne z dokładnością 0.1 px: krótszy znacznik bez widocznej różnicy. */
export const r1 = (v) => Math.round(v * 10) / 10;

function attrs(a) {
  let s = "";
  for (const key in a) {
    const v = a[key];
    if (v !== undefined && v !== null && v !== false) s += ` ${key}="${v}"`;
  }
  return s;
}

export const el = (tag, a = {}, inner) => (inner === undefined ? `<${tag}${attrs(a)}/>` : `<${tag}${attrs(a)}>${inner}</${tag}>`);
export const path = (d, a) => (d ? el("path", { d, ...a }) : "");
export const rect = (x, y, width, height, a) => el("rect", { x: r1(x), y: r1(y), width: r1(width), height: r1(height), ...a });
export const text = (x, y, content, a) => el("text", { x: r1(x), y: r1(y), ...a }, esc(content));
/** Grupa ze wspólnymi atrybutami (np. czcionką) - pomijana, gdy pusta. */
export const group = (inner, a) => (inner ? el("g", a, inner) : "");

/** Prostokąty [x, y, w, h] jako jedna ścieżka. */
export const rectsPath = (rects) => rects.map(([x, y, w, h]) => `M${r1(x)},${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z`).join("");

/** Odcinki [x1, y1, x2, y2] jako jedna ścieżka. */
export const segmentsPath = (segments) => segments.map(([x1, y1, x2, y2]) => `M${r1(x1)},${r1(y1)}L${r1(x2)},${r1(y2)}`).join("");

/** Kółka o promieniu r w punktach [x, y] jako jedna ścieżka (dwa półokręgi na kółko). */
export function dotsPath(points, r) {
  const rr = r1(r);
  const d = r1(2 * r);
  return points.map(([x, y]) => `M${r1(x - r)},${r1(y)}a${rr},${rr} 0 1,0 ${d},0a${rr},${rr} 0 1,0 ${-d},0`).join("");
}

/** Gładka krzywa (spline Catmull-Rom zamieniony na krzywe Béziera) przez punkty; null przerywa linię. */
export function smoothPath(points, tension = 0.4) {
  const k = tension / 2;
  let d = "";
  let seg = [];
  const flush = () => {
    if (seg.length === 1) d += `M${r1(seg[0][0])},${r1(seg[0][1])}`;
    for (let i = 0; i < seg.length - 1; i++) {
      const p0 = seg[i - 1] ?? seg[i];
      const p1 = seg[i];
      const p2 = seg[i + 1];
      const p3 = seg[i + 2] ?? p2;
      if (i === 0) d += `M${r1(p1[0])},${r1(p1[1])}`;
      d += `C${r1(p1[0] + (p2[0] - p0[0]) * k)},${r1(p1[1] + (p2[1] - p0[1]) * k)} ` +
        `${r1(p2[0] - (p3[0] - p1[0]) * k)},${r1(p2[1] - (p3[1] - p1[1]) * k)} ${r1(p2[0])},${r1(p2[1])}`;
    }
    seg = [];
  };
  for (const p of points) {
    if (p) seg.push(p);
    else flush();
  }
  flush();
  return d;
}

/** Obszar pod krzywą domknięty do poziomu `baseY` (przerwy w danych są pomijane). */
export function areaPath(points, baseY, tension) {
  const pts = points.filter(Boolean);
  if (!pts.length) return "";
  return `${smoothPath(pts, tension)}L${r1(pts.at(-1)[0])},${r1(baseY)}L${r1(pts[0][0])},${r1(baseY)}Z`;
}

/** Pas między krzywą górną a dolną (np. temperatura max/min). */
export function bandPath(upper, lower, tension) {
  const up = upper.filter(Boolean);
  const down = lower.filter(Boolean).reverse();
  if (!up.length || !down.length) return "";
  return `${smoothPath(up, tension)}L${r1(down[0][0])},${r1(down[0][1])}${smoothPath(down, tension).replace(/^M[^C]*/, "")}Z`;
}
