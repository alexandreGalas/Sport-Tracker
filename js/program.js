// Logique calendrier : quelle séance quel jour. Lit le programme via store.getProgram().
import { getProgram, getLog } from './store.js';
import { DAY_KEYS, parseISO, addDays, mondayOf } from './util.js';

const DAY_MS = 86400000;

function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

export function weekIndexFor(iso) {
  const p = getProgram();
  return Math.floor(daysBetween(mondayOf(p.startDate), iso) / 7);
}

function clampedWeek(index) {
  const weeks = getProgram().weeks;
  return Math.min(Math.max(index, 0), weeks.length - 1);
}

export function weekInfo(iso) {
  const p = getProgram();
  const index = weekIndexFor(iso);
  const n = p.weeks.length;
  const week = p.weeks[clampedWeek(index)];
  const num = clampedWeek(index) + 1;
  return {
    index,
    label: week.label || `Semaine ${num}`,
    mondayISO: mondayOf(iso),
    beforeStart: index < 0,
    finished: index >= n,
    number: num,
    total: n,
  };
}

function itemsFor(week, dayKey) {
  const key = dayKey === 'sat' || dayKey === 'sun' ? 'weekend' : dayKey;
  const bonus = key === 'weekend';
  const sessions = getProgram().sessions;
  return (week.days[key] || []).filter((id) => sessions[id]).map((sessionId) => ({ sessionId, session: sessions[sessionId], bonus }));
}

export function sessionsForDate(iso) {
  const week = getProgram().weeks[clampedWeek(weekIndexFor(iso))];
  return itemsFor(week, DAY_KEYS[(parseISO(iso).getDay() + 6) % 7]);
}

export function plannedWeek(mondayISO) {
  const monday = mondayOf(mondayISO);
  return DAY_KEYS.map((dayKey, i) => {
    const date = addDays(monday, i);
    return { date, dayKey, items: sessionsForDate(date) };
  });
}

export function getSession(sessionId) {
  if (sessionId === 'extra-run') {
    return {
      type: 'run', runType: 'easy', title: 'Course libre',
      plan: { distanceKm: 0, durationSec: 0 },
      description: 'Sortie hors programme.',
    };
  }
  return getProgram().sessions[sessionId];
}

export function getExercise(exId) {
  return getProgram().exercises[exId];
}

export function weekendDone(mondayISO) {
  const monday = mondayOf(mondayISO);
  const days = [addDays(monday, 5), addDays(monday, 6)];
  const ids = new Set(sessionsForDate(days[0]).map((i) => i.sessionId));
  return getLog().entries.some((e) => days.includes(e.date) && ids.has(e.sessionId) && e.status !== 'skipped');
}
