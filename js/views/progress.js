// Vue Progrès : objectifs, régularité, sections Course / Calisthénie.
import * as store from '../store.js';
import { el, formatDuration, formatPace, parseISO } from '../util.js';
import * as stats from '../stats.js';
import { lineChart, barChart } from '../charts.js';

let tab = 'run';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function shortDate(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function weekLabel(iso) {
  const d = parseISO(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
const fmtKm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const fmtInt = (v) => String(Math.round(v));

function goalValue(goal, v) {
  if (goal.metric === 'best5k' || goal.metric === 'best10k') return formatDuration(v);
  if (goal.metric === 'weeklyKm') return `${fmtKm(v)} km`;
  if (goal.metric === 'maxLsit') return `${fmtInt(v)} s`;
  return `${fmtInt(v)} reps`;
}

function goalCard(g) {
  const done = g.pct >= 100;
  return el('div', { class: 'card pg-goal' },
    el('div', { class: 'pg-goal-head' },
      el('span', { class: 'pg-goal-label' }, g.goal.label),
      el('span', { class: 'pg-goal-pct' + (done ? ' is-done' : '') }, done ? 'Atteint' : `${g.pct} %`)),
    el('div', { class: 'pg-goal-values' },
      el('strong', {}, goalValue(g.goal, g.current)),
      el('span', { class: 'muted' }, ` → ${goalValue(g.goal, g.goal.target)}`)),
    el('div', { class: 'pg-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(g.pct) },
      el('div', { class: 'pg-bar-fill' + (done ? ' is-done' : ''), style: `width:${g.pct}%` })));
}

function chartCard(title, chart, note) {
  return el('div', { class: 'card pg-chart' },
    el('h3', { class: 'pg-chart-title' }, title),
    chart,
    note ? el('p', { class: 'muted pg-note' }, note) : null);
}

function adherenceChart(adh) {
  // barres empilées : fait / partiel sur prévu
  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (t, a, txt) => {
    const n = document.createElementNS(svgNS, t);
    for (const k in a) n.setAttribute(k, a[k]);
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const H = 120, W = 340, padL = 10, padB = 22, padT = 14;
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', class: 'chart', role: 'img' });
  svg.style.display = 'block';
  const maxN = Math.max(3, ...adh.map((a) => Math.max(a.planned, a.done + a.partial)));
  const slot = (W - padL * 2) / adh.length;
  const bw = Math.min(26, slot * 0.6);
  const unit = (H - padT - padB) / maxN;
  adh.forEach((a, i) => {
    const cx = padL + slot * i + slot / 2;
    const base = H - padB;
    // prévu : contour
    if (a.planned > 0) svg.appendChild(mk('rect', { x: cx - bw / 2, y: base - a.planned * unit, width: bw, height: a.planned * unit, rx: 3, fill: 'none', stroke: 'var(--grid, #444)', 'stroke-width': 1.5 }));
    if (a.done > 0) svg.appendChild(mk('rect', { x: cx - bw / 2, y: base - a.done * unit, width: bw, height: a.done * unit, rx: 3, fill: 'var(--accent, #4ade80)' }));
    if (a.partial > 0) svg.appendChild(mk('rect', { x: cx - bw / 2, y: base - (a.done + a.partial) * unit, width: bw, height: a.partial * unit, rx: 3, fill: 'var(--warn, #f59e0b)' }));
    if (a.bonusDone > 0) svg.appendChild(mk('circle', { cx, cy: base - Math.max(a.planned, a.done + a.partial) * unit - 7, r: 3.5, fill: 'var(--accent, #4ade80)' }));
    svg.appendChild(mk('text', { x: cx, y: H - 6, 'text-anchor': 'middle', fill: 'var(--muted, #888)', 'font-size': 10 }, weekLabel(a.mondayISO)));
    const t = mk('title', {}, `Sem. du ${shortDate(a.mondayISO)} : ${a.done} faites, ${a.partial} partielles sur ${a.planned}`);
    svg.appendChild(t);
  });
  return svg;
}

function renderRun(log, program) {
  const km = stats.weeklyRunKm(log, program, { weeks: 8 });
  const paces = stats.runPaces(log).slice(-20);
  const best = stats.bestTimes(log, program);
  const bestCell = (label, b) => el('div', { class: 'pg-best' },
    el('div', { class: 'muted' }, label),
    el('div', { class: 'pg-best-val' }, b ? formatDuration(b.sec) : '—'),
    el('div', { class: 'muted pg-best-date' }, b ? shortDate(b.date) : 'pas encore'));
  return el('div', { class: 'stack' },
    el('div', { class: 'card pg-chart' },
      el('h3', { class: 'pg-chart-title' }, 'Meilleurs temps'),
      el('div', { class: 'pg-best-row' }, bestCell('5 km', best.best5k), bestCell('10 km', best.best10k)),
      el('p', { class: 'muted pg-note' }, 'Ramenés au prorata de l’allure sur les sorties plus longues ; le test chrono est prioritaire.')),
    chartCard('Kilomètres par semaine',
      barChart({ bars: km.map((w) => ({ x: weekLabel(w.mondayISO), y: w.km })), yFormat: fmtKm, target: 15 }),
      'Pointillés : objectif 15 km.'),
    chartCard('Allure des sorties',
      lineChart({ points: paces.map((p) => ({ x: shortDate(p.date), y: p.paceSecPerKm })), yFormat: (v) => formatPace(v).replace(' /km', ''), invert: true }),
      'Plus haut = plus rapide.'));
}

function renderCali(log, program) {
  const pu = stats.maxPullups(log, program);
  const vol = stats.weeklyPullupVolume(log, program, { weeks: 8 });
  const ls = stats.maxLsit(log, program);
  return el('div', { class: 'stack' },
    chartCard('Max de tractions (une série)',
      lineChart({ points: pu.map((p) => ({ x: shortDate(p.date), y: p.value })), yFormat: fmtInt })),
    chartCard('Volume de tractions par semaine',
      barChart({ bars: vol.map((w) => ({ x: weekLabel(w.mondayISO), y: w.reps })), yFormat: fmtInt }),
      'Total de répétitions (pronation, supination, tests).'),
    chartCard('Max L-sit (secondes)',
      lineChart({ points: ls.map((p) => ({ x: shortDate(p.date), y: p.value })), yFormat: fmtInt })));
}

export function render(container, params) {
  const log = store.getLog();
  const program = store.getProgram();
  container.innerHTML = '';
  if (!program) {
    container.appendChild(el('p', { class: 'muted' }, 'Programme indisponible.'));
    return;
  }
  const goals = stats.goalProgress(log, program);
  const adh = stats.adherence(log, program, { weeks: 8 });
  const streak = stats.streakWeeks(log, program);
  const totalPlanned = adh.reduce((s, a) => s + a.planned, 0);
  const totalDone = adh.reduce((s, a) => s + a.done + a.partial, 0);

  const body = el('div', { class: 'pg-body' });
  const show = () => {
    body.innerHTML = '';
    body.appendChild(tab === 'run' ? renderRun(log, program) : renderCali(log, program));
    tabs.forEach(([k, b]) => b.classList.toggle('active', k === tab));
    tabs.forEach(([k, b]) => b.setAttribute('aria-selected', String(k === tab)));
  };
  const tabs = [['run', null], ['cali', null]].map(([k]) => [k, el('button', {
    type: 'button', role: 'tab', class: 'pg-tab', onclick: () => { tab = k; show(); },
  }, k === 'run' ? 'Course' : 'Calisthénie')]);

  container.appendChild(el('section', { class: 'pg stack' },
    el('h2', { class: 'section-title' }, 'Objectifs'),
    el('div', { class: 'stack' }, ...goals.map(goalCard)),
    el('h2', { class: 'section-title' }, 'Régularité'),
    el('div', { class: 'card pg-chart' },
      el('div', { class: 'pg-streak-row' },
        el('div', { class: 'pg-streak' },
          el('div', { class: 'pg-streak-num' }, String(streak)),
          el('div', { class: 'muted' }, streak > 1 ? 'semaines de suite' : 'semaine de suite')),
        el('div', { class: 'pg-streak' },
          el('div', { class: 'pg-streak-num' }, totalPlanned ? `${totalDone}/${totalPlanned}` : '—'),
          el('div', { class: 'muted' }, 'séances sur 8 semaines'))),
      adherenceChart(adh),
      el('p', { class: 'muted pg-note' }, 'Vert : fait · orange : partiel · contour : prévu · point : bonus week-end.')),
    el('div', { class: 'pg-tabs', role: 'tablist' }, ...tabs.map(([, b]) => b)),
    body));
  show();
}
