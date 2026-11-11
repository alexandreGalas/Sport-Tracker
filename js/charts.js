// Graphiques SVG faits main. Couleurs via variables CSS (--accent, --muted, --grid).
const NS = 'http://www.w3.org/2000/svg';
const W = 340;
const PAD = { l: 38, r: 10, t: 12, b: 24 };

function s(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
function root(height) {
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${height}`,
    width: '100%',
    class: 'chart',
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.style.display = 'block';
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  return svg;
}
function empty(height) {
  const svg = root(height);
  svg.appendChild(
    s('text', { x: W / 2, y: height / 2, 'text-anchor': 'middle', fill: 'var(--muted, #888)', 'font-size': 13 }, 'Pas encore de données')
  );
  return svg;
}
function niceStep(range, ticks) {
  const raw = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}
function scale(min, max, zeroBase) {
  if (zeroBase) min = Math.min(0, min);
  // Plage minimale (évite des graduations dupliquées quand les valeurs sont proches)
  const minSpan = Math.max(1, Math.abs(max) * 0.1);
  if (max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2; max = mid + minSpan / 2;
    if (zeroBase) min = Math.min(0, min);
  }
  const step = niceStep(max - min, 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}
function xLabels(svg, labels, xs, height) {
  const maxLabels = 6;
  const every = Math.max(1, Math.ceil(labels.length / maxLabels));
  labels.forEach((l, i) => {
    if (i % every !== 0) return;
    const anchor = xs[i] > W - PAD.r - 22 ? 'end' : xs[i] < PAD.l + 4 ? 'start' : 'middle';
    svg.appendChild(s('text', { x: anchor === 'end' ? W - 2 : anchor === 'start' ? PAD.l - 2 : xs[i], y: height - 7, 'text-anchor': anchor, fill: 'var(--muted, #888)', 'font-size': 10 }, l));
  });
}
function grid(svg, sc, yOf, yFormat) {
  for (const v of sc.ticks) {
    const y = yOf(v);
    svg.appendChild(s('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: 'var(--grid, #444)', 'stroke-width': 1, opacity: 0.6 }));
    svg.appendChild(s('text', { x: PAD.l - 5, y: y + 3.5, 'text-anchor': 'end', fill: 'var(--muted, #888)', 'font-size': 10 }, yFormat(v)));
  }
}

export function lineChart({ points = [], yFormat = (v) => String(Math.round(v * 10) / 10), height = 180, invert = false } = {}) {
  if (!points.length) return empty(height);
  const svg = root(height);
  const ys = points.map((p) => p.y);
  const sc = scale(Math.min(...ys), Math.max(...ys), false);
  const innerH = height - PAD.t - PAD.b;
  const yOf = (v) => {
    const t = (v - sc.lo) / (sc.hi - sc.lo);
    return PAD.t + (invert ? t : 1 - t) * innerH;
  };
  const innerW = W - PAD.l - PAD.r;
  const xs = points.map((_, i) => (points.length === 1 ? PAD.l + innerW / 2 : PAD.l + (innerW * i) / (points.length - 1)));
  grid(svg, sc, yOf, yFormat);
  xLabels(svg, points.map((p) => p.x), xs, height);
  if (points.length > 1) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${yOf(p.y).toFixed(1)}`).join(' ');
    svg.appendChild(s('path', { d, fill: 'none', stroke: 'var(--accent, #4ade80)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }
  points.forEach((p, i) => {
    const c = s('circle', { cx: xs[i], cy: yOf(p.y), r: 3.5, fill: 'var(--accent, #4ade80)' });
    c.appendChild(s('title', {}, `${p.x} : ${yFormat(p.y)}`));
    svg.appendChild(c);
  });
  return svg;
}

export function barChart({ bars = [], yFormat = (v) => String(Math.round(v * 10) / 10), height = 180, target } = {}) {
  if (!bars.length) return empty(height);
  const svg = root(height);
  const ys = bars.map((b) => b.y);
  const top = Math.max(...ys, target || 0);
  const sc = scale(0, top, true);
  const innerH = height - PAD.t - PAD.b;
  const yOf = (v) => PAD.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * innerH;
  const innerW = W - PAD.l - PAD.r;
  const slot = innerW / bars.length;
  const bw = Math.min(28, slot * 0.62);
  const xs = bars.map((_, i) => PAD.l + slot * i + slot / 2);
  grid(svg, sc, yOf, yFormat);
  xLabels(svg, bars.map((b) => b.x), xs, height);
  bars.forEach((b, i) => {
    const y = yOf(b.y);
    const h = Math.max(b.y > 0 ? 2 : 0, yOf(0) - y);
    const r = s('rect', { x: xs[i] - bw / 2, y: yOf(0) - h, width: bw, height: h, rx: 3, fill: 'var(--accent, #4ade80)' });
    r.appendChild(s('title', {}, `${b.x} : ${yFormat(b.y)}`));
    svg.appendChild(r);
  });
  if (typeof target === 'number') {
    const y = yOf(target);
    svg.appendChild(s('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: 'var(--muted, #888)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
  }
  return svg;
}
