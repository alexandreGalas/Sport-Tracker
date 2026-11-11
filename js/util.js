// Helpers dates / durées / allures / DOM. Aucun effet de bord à l'import.
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const pad = (n) => String(n).padStart(2, '0');

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d); // minuit local
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function mondayOf(iso) {
  const d = parseISO(iso);
  const back = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - back);
  return toISO(d);
}

export function formatDateFr(iso, { weekday = true } = {}) {
  const d = parseISO(iso);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return weekday ? `${WEEKDAYS[d.getDay()]} ${base}` : base;
}

export function formatDuration(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return '–';
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (!s) return null;
  if (!s.includes(':')) {
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return Math.round(parseFloat(s) * 60); // minutes
  }
  const parts = s.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 3) {
    const [h, m, sec] = nums;
    if (m >= 60 || sec >= 60) return null;
    return h * 3600 + m * 60 + sec;
  }
  const [m, sec] = nums;
  if (sec >= 60) return null;
  return m * 60 + sec;
}

export function formatPace(secPerKm) {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return '–';
  const t = Math.round(secPerKm);
  return `${Math.floor(t / 60)}:${pad(t % 60)} /km`;
}

// el('div', {class:'card', onclick: fn, dataset:{a:1}}, 'texte', autreNoeud, [liste])
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'text') node.textContent = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) c.forEach(add);
    else node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return node;
}

// Extra (hors contrat) : toast non bloquant, réutilisable par les vues.
export function toast(message, ms = 2600) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = el('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = el('div', { class: 'toast', role: 'status' }, message);
  host.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}
