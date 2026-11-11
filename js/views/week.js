// Vue Semaine.
// Route lue : #/week?offset=<n>  -> params.query.offset ou params.offset (entier, relatif à la semaine courante, défaut 0)
// Exporte aussi weekSummary(mondayISO) utilisé par today.js.
import { getLog, getEntry, getProgram } from '../store.js';
import { plannedWeek, weekInfo } from '../program.js';
import { todayISO, mondayOf, addDays, parseISO, formatDateFr } from '../util.js';
import { h, fmtKm, sessionTitle, sessionKind, statusBadge, entrySummary, exInfo } from './session.js';

const PULL = ['pullup', 'chinup', 'pullup-test'];

function weekEntries(monday) {
  const end = addDays(monday, 6);
  return (getLog().entries || []).filter(e => e.date >= monday && e.date <= end);
}

export function weekSummary(monday) {
  const entries = weekEntries(monday);
  const plan = plannedWeek(monday);
  let planned = 0, done = 0;
  for (const d of plan) {
    for (const it of d.items) {
      if (it.bonus) continue;
      planned++;
      const e = getEntry(d.date, it.sessionId);
      if (e && (e.status === 'done' || e.status === 'partial')) done++;
    }
  }
  let km = 0, pull = 0, bonusDone = 0;
  for (const e of entries) {
    if (e.status === 'skipped') continue;
    if (e.run) km += Number(e.run.distanceKm) || 0;
    for (const x of e.exercises || []) {
      if (!x.skipped && PULL.includes(x.id)) pull += (x.sets || []).reduce((a, b) => a + (Number(b) || 0), 0);
    }
  }
  return { planned, done, km: Math.round(km * 10) / 10, pullups: pull, bonusDone, entries };
}

function rangeLabel(monday) {
  const a = parseISO(monday), b = parseISO(addDays(monday, 6));
  const end = formatDateFr(addDays(monday, 6), { weekday: false });
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${end}`;
  return `${formatDateFr(monday, { weekday: false })}–${end}`;
}

export function render(container, params = {}) {
  const q = params.query || {};
  const offset = parseInt(q.offset ?? params.offset, 10) || 0;
  const today = todayISO();
  const monday = addDays(mondayOf(today), 7 * offset);
  const info = weekInfo(monday);
  const plan = plannedWeek(monday);
  const sum = weekSummary(monday);
  const nb = Math.max(1, info.index + 1);
  const go = (n) => { location.hash = n === 0 ? '#/week' : `#/week?offset=${n}`; };

  container.replaceChildren();
  const root = h('div', { class: 'v-week stack' });
  container.append(root);

  root.append(h('div', { class: 'v-weeknav' },
    h('button', { type: 'button', class: 'btn v-nav-btn', 'aria-label': 'Semaine précédente', onclick: () => go(offset - 1) }, '‹'),
    h('div', { class: 'v-weeknav-title' }, h('strong', {}, `Semaine ${nb} · ${rangeLabel(monday)}`),
      offset !== 0 ? h('button', { type: 'button', class: 'v-link', onclick: () => go(0) }, 'Revenir à cette semaine') : null),
    h('button', { type: 'button', class: 'btn v-nav-btn', 'aria-label': 'Semaine suivante', onclick: () => go(offset + 1) }, '›')));

  if (info.beforeStart) root.append(h('div', { class: 'banner' }, `Aperçu : le programme démarre le ${formatDateFr(getProgram().startDate)}.`));
  if (info.finished) root.append(h('div', { class: 'banner' }, 'Programme terminé : demande une mise à jour au coach'));

  const extras = sum.entries.filter(e => e.sessionId === 'extra-run');

  const line = (date, sessionId, bonus, entry) => {
    const kind = sessionKind(sessionId, entry);
    const st = entry ? entry.status : (date < today && !bonus && !info.beforeStart ? 'missed' : 'todo');
    const dot = entry ? entry.status : 'todo';
    const sumTxt = entry ? entrySummary(entry) : '';
    const target = entry ? entry.date : date;
    return h('a', { class: 'v-line', href: `#/session/${target}/${sessionId}` },
      h('span', { class: `v-dot ${dot}` }),
      h('span', { class: 'v-line-main' },
        h('span', { class: 'v-line-title' }, (kind === 'run' ? '🏃 ' : '💪 ') + sessionTitle(sessionId, entry)),
        sumTxt ? h('span', { class: 'muted v-line-sum' }, sumTxt) : null),
      st === 'missed' ? h('span', { class: 'badge badge-todo' }, 'Non saisi') : statusBadge(st));
  };

  const dayRow = (label, dateForHighlight, isToday, lines) =>
    h('div', { class: 'card v-day' + (isToday ? ' today' : '') },
      h('div', { class: 'v-day-head' }, h('strong', {}, label), isToday ? h('span', { class: 'badge badge-done' }, 'Aujourd’hui') : null),
      lines.length ? lines : h('div', { class: 'muted' }, 'Repos'));

  const byDate = {};
  plan.forEach(d => { byDate[d.date] = d; });
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  dates.slice(0, 5).forEach(date => {
    const d = byDate[date];
    const lines = [];
    (d ? d.items : []).forEach(it => lines.push(line(date, it.sessionId, it.bonus, getEntry(date, it.sessionId))));
    extras.filter(e => e.date === date).forEach(e => lines.push(line(date, 'extra-run', false, e)));
    root.append(dayRow(formatDateFr(date), date, date === today, lines));
  });

  // week-end regroupé
  const sat = dates[5], sun = dates[6];
  const wLines = [];
  const seen = new Set();
  [sat, sun].forEach(date => {
    (byDate[date] ? byDate[date].items : []).forEach(it => {
      if (seen.has(it.sessionId)) return;
      seen.add(it.sessionId);
      const e = getEntry(sat, it.sessionId) || getEntry(sun, it.sessionId);
      wLines.push(line(e ? e.date : sat, it.sessionId, true, e));
    });
  });
  extras.filter(e => e.date === sat || e.date === sun).forEach(e => wLines.push(line(e.date, 'extra-run', false, e)));
  const wk = h('div', { class: 'card v-day' + (today === sat || today === sun ? ' today' : '') },
    h('div', { class: 'v-day-head' }, h('strong', {}, 'Week-end'), h('span', { class: 'badge badge-bonus' }, 'Bonus'),
      (today === sat || today === sun) ? h('span', { class: 'badge badge-done' }, 'Aujourd’hui') : null),
    wLines.length ? wLines : h('div', { class: 'muted' }, 'Repos'));
  root.append(wk);

  root.append(h('div', { class: 'card v-summary' },
    h('div', { class: 'section-title' }, 'Résumé de la semaine'),
    h('div', { class: 'v-stats' },
      h('div', {}, h('strong', {}, `${sum.done}/${sum.planned}`), h('span', { class: 'muted' }, 'séances')),
      h('div', {}, h('strong', {}, `${fmtKm(sum.km)} km`), h('span', { class: 'muted' }, 'courus')),
      h('div', {}, h('strong', {}, String(sum.pullups)), h('span', { class: 'muted' }, 'tractions')))));
}
