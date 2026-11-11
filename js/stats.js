// Calculs de progression : fonctions pures (log, program) -> données. Aucun accès DOM / localStorage.
import { addDays, mondayOf, parseISO, todayISO } from './util.js';

const PULLUP_IDS = ['pullup', 'pullup-test'];
const VOLUME_IDS = ['pullup', 'chinup', 'pullup-test'];
const LSIT_IDS = ['lsit', 'lsit-test'];
const REGULAR_DAYS = ['mon', 'wed', 'fri'];

function entriesOf(log) {
  return ((log && log.entries) || []).filter((e) => e && e.date);
}
function counts(e) {
  return e.status !== 'skipped';
}
function dayDiff(a, b) {
  return Math.round((parseISO(a) - parseISO(b)) / 86400000);
}
function lastWeeks(n, today) {
  const cur = mondayOf(today || todayISO());
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(cur, -7 * i));
  return out;
}
// Semaine du programme pour un lundi donné (répète la dernière ; null avant le départ).
function programWeek(program, mondayISO) {
  if (!program || !program.weeks || !program.weeks.length) return null;
  const idx = Math.floor(dayDiff(mondayISO, program.startDate) / 7);
  if (idx < 0) return null;
  return program.weeks[Math.min(idx, program.weeks.length - 1)];
}
function weekIds(week, keys) {
  const ids = [];
  for (const k of keys) for (const id of (week.days && week.days[k]) || []) ids.push(id);
  return ids;
}
function sumByWeek(entries, mondays, fn) {
  const map = new Map(mondays.map((m) => [m, 0]));
  for (const e of entries) {
    const m = mondayOf(e.date);
    if (map.has(m)) map.set(m, map.get(m) + fn(e));
  }
  return mondays.map((m) => map.get(m));
}
function setsMax(e, ids) {
  let best = null;
  for (const ex of e.exercises || []) {
    if (!ids.includes(ex.id) || ex.skipped) continue;
    for (const v of ex.sets || []) {
      if (typeof v === 'number' && isFinite(v) && (best === null || v > best)) best = v;
    }
  }
  return best;
}
function maxByDate(log, ids) {
  const byDate = new Map();
  for (const e of entriesOf(log)) {
    if (!counts(e)) continue;
    const v = setsMax(e, ids);
    if (v !== null && v > 0 && (!byDate.has(e.date) || v > byDate.get(e.date))) byDate.set(e.date, v);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

export function weeklyRunKm(log, program, { weeks = 12, today } = {}) {
  const mondays = lastWeeks(weeks, today);
  const runs = entriesOf(log).filter((e) => counts(e) && e.run && e.run.distanceKm > 0);
  const kms = sumByWeek(runs, mondays, (e) => e.run.distanceKm);
  return mondays.map((mondayISO, i) => ({ mondayISO, km: Math.round(kms[i] * 100) / 100 }));
}

export function runPaces(log) {
  return entriesOf(log)
    .filter((e) => counts(e) && e.run && e.run.distanceKm > 0 && e.run.durationSec > 0)
    .map((e) => ({
      date: e.date,
      paceSecPerKm: e.run.durationSec / e.run.distanceKm,
      runType: e.run.runType || (e.sessionId === 'extra-run' ? 'easy' : ''),
      distanceKm: e.run.distanceKm,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function bestTimes(log, program) {
  const runs = entriesOf(log).filter(
    (e) => counts(e) && e.run && e.run.distanceKm > 0 && e.run.durationSec > 0
  );
  const pick = (d) => {
    const cands = runs
      .filter((e) => e.run.distanceKm >= d)
      .map((e) => ({
        sec: Math.round((e.run.durationSec * d) / e.run.distanceKm),
        date: e.date,
        test: e.run.runType === 'test',
      }));
    if (!cands.length) return null;
    const tests = cands.filter((c) => c.test);
    const pool = tests.length ? tests : cands;
    pool.sort((a, b) => a.sec - b.sec);
    return { sec: pool[0].sec, date: pool[0].date };
  };
  return { best5k: pick(5), best10k: pick(10) };
}

export function maxPullups(log, program) {
  return maxByDate(log, PULLUP_IDS);
}
export function maxLsit(log, program) {
  return maxByDate(log, LSIT_IDS);
}

export function weeklyPullupVolume(log, program, { weeks = 12, today } = {}) {
  const mondays = lastWeeks(weeks, today);
  const entries = entriesOf(log).filter(counts);
  const vols = sumByWeek(entries, mondays, (e) => {
    let t = 0;
    for (const ex of e.exercises || []) {
      if (!VOLUME_IDS.includes(ex.id) || ex.skipped) continue;
      for (const v of ex.sets || []) if (typeof v === 'number' && isFinite(v)) t += v;
    }
    return t;
  });
  return mondays.map((mondayISO, i) => ({ mondayISO, reps: vols[i] }));
}

export function adherence(log, program, { weeks = 8, today } = {}) {
  const entries = entriesOf(log).filter((e) => e.status === 'done' || e.status === 'partial');
  return lastWeeks(weeks, today).map((mondayISO) => {
    const w = programWeek(program, mondayISO);
    const res = { mondayISO, planned: 0, done: 0, partial: 0, bonusDone: 0 };
    if (!w) return res;
    const regular = weekIds(w, REGULAR_DAYS);
    const bonus = weekIds(w, ['weekend']);
    res.planned = regular.length;
    const sunday = addDays(mondayISO, 6);
    const seen = new Set();
    for (const e of entries) {
      if (e.date < mondayISO || e.date > sunday || seen.has(e.id)) continue;
      if (regular.includes(e.sessionId)) {
        if (e.status === 'done') res.done++;
        else res.partial++;
        seen.add(e.id);
      } else if (bonus.includes(e.sessionId)) {
        res.bonusDone++;
        seen.add(e.id);
      }
    }
    return res;
  });
}

export function goalProgress(log, program, { today } = {}) {
  const goals = (program && program.goals) || [];
  const times = bestTimes(log, program);
  const allKm = weeklyRunKm(log, program, { weeks: 104, today }).map((w) => w.km);
  const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));
  return goals.map((goal) => {
    const start = goal.current;
    let current = start;
    let pct = 0;
    const lowerIsBetter = goal.metric === 'best5k' || goal.metric === 'best10k';
    if (goal.metric === 'maxPullups' || goal.metric === 'maxLsit') {
      const series = goal.metric === 'maxPullups' ? maxPullups(log, program) : maxLsit(log, program);
      current = Math.max(start, ...series.map((s) => s.value));
    } else if (lowerIsBetter) {
      const t = goal.metric === 'best5k' ? times.best5k : times.best10k;
      current = t ? Math.min(start, t.sec) : start;
    } else if (goal.metric === 'weeklyKm') {
      current = Math.max(start, ...allKm);
    }
    const span = lowerIsBetter ? start - goal.target : goal.target - start;
    const gain = lowerIsBetter ? start - current : current - start;
    pct = span > 0 ? clamp((gain / span) * 100) : current === goal.target || gain >= 0 ? 100 : 0;
    if (lowerIsBetter ? current <= goal.target : current >= goal.target) pct = 100;
    return { goal, current, pct };
  });
}

export function streakWeeks(log, program, { today } = {}) {
  const adh = adherence(log, program, { weeks: 60, today });
  const ok = (w) => w.planned > 0 && w.done + w.partial >= w.planned;
  let i = adh.length - 2; // semaine passée
  let n = 0;
  while (i >= 0 && ok(adh[i])) {
    n++;
    i--;
  }
  if (ok(adh[adh.length - 1])) n++; // semaine en cours déjà complète
  return n;
}
