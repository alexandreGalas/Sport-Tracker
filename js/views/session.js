// Vue Saisie (formulaire course / calisthénie).
// Routes lues :
//   #/session/<date>/<sessionId>  -> params.date, params.sessionId
//   #/log/<entryId>               -> params.entryId (ou params.id, ou segments[0])  (entryId = `${date}-${sessionId}`, date = 10 premiers caractères)
// Exports utilitaires partagés avec today.js / week.js / history.js :
//   h, toast, fmtKm, safeSession, exInfo, sessionTitle, sessionKind, statusLabel, statusBadge, entrySummary
import { getEntry, saveEntry, deleteEntry, getProgram } from '../store.js';
import { getSession, getExercise } from '../program.js';
import { formatDateFr, formatDuration, parseDuration, formatPace, toast as utilToast } from '../util.js';

/* ---------- helpers partagés ---------- */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(msg) { utilToast(msg); }

export function fmtKm(n) {
  if (n == null || isNaN(n)) return '–';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function safeSession(sessionId, entry) {
  let s = null;
  try { s = getSession(sessionId); } catch (e) { s = null; }
  if (!s) {
    if (entry && entry.run) s = { type: 'run', title: 'Course', runType: entry.run.runType, plan: {} };
    else if (entry && entry.exercises) {
      s = {
        type: 'calisthenics', title: sessionId,
        exercises: entry.exercises.map(e => ({ id: e.id, sets: (e.sets || []).length || 1, target: (e.sets || [])[0] || 0 })),
      };
    }
  }
  if (s && sessionId === 'extra-run') s = { ...s, type: 'run', title: s.title || 'Course libre' };
  return s;
}

export function exInfo(ex) {
  let def = null;
  try { def = getExercise(ex.id); } catch (e) { def = null; }
  if (!def) { const p = getProgram(); def = (p && p.exercises && p.exercises[ex.id]) || { name: ex.id, metric: 'reps' }; }
  return {
    name: def.name || ex.id,
    metric: def.metric || 'reps',
    tip: def.tip || '',
    perSide: !!(ex.perSide ?? def.perSide),
    optional: !!(ex.optional ?? def.optional),
    test: ex.test ?? def.test ?? null,
  };
}

export function sessionTitle(sessionId, entry) {
  if (sessionId === 'extra-run') return 'Course libre';
  const s = safeSession(sessionId, entry);
  return (s && s.title) || sessionId;
}

export function sessionKind(sessionId, entry) {
  if (sessionId === 'extra-run') return 'run';
  if (entry && entry.run) return 'run';
  if (entry && entry.exercises) return 'calisthenics';
  const s = safeSession(sessionId, entry);
  return s ? s.type : 'run';
}

const STATUS = { done: 'Fait', partial: 'Partiel', skipped: 'Sauté', todo: 'À faire' };
export const statusLabel = (st) => STATUS[st] || STATUS.todo;
export function statusBadge(st, label) {
  const k = STATUS[st] ? st : 'todo';
  return h('span', { class: `badge badge-${k}` }, label || STATUS[k]);
}

export function entrySummary(entry) {
  if (!entry || entry.status === 'skipped') return entry && entry.status === 'skipped' ? 'Séance sautée' : '';
  if (entry.run) {
    const r = entry.run;
    const parts = [`${fmtKm(r.distanceKm)} km`, formatDuration(r.durationSec)];
    if (r.distanceKm > 0 && r.durationSec > 0) parts.push(formatPace(r.durationSec / r.distanceKm));
    return parts.join(' · ');
  }
  if (entry.exercises) {
    return entry.exercises.filter(e => !e.skipped && e.sets && e.sets.length).map(e => {
      const info = exInfo({ id: e.id });
      const total = e.sets.reduce((a, b) => a + (Number(b) || 0), 0);
      const unit = info.metric === 'seconds' ? 's' : 'reps';
      return info.test ? `${info.name} max ${e.sets[0]} ${unit}` : `${info.name} ${total} ${unit}`;
    }).join(' · ');
  }
  return '';
}

const FEELINGS = [[1, 'Très dur'], [2, 'Dur'], [3, 'Correct'], [4, 'Facile'], [5, 'Très facile']];
const RUN_TYPES = [['easy', 'Facile'], ['intervals', 'Fractionné'], ['tempo', 'Tempo'], ['long', 'Sortie longue'], ['test', 'Test']];

/* ---------- vue ---------- */
export function render(container, params = {}) {
  const entryId = params.entryId ?? params.id ?? (params.route === 'log' && params.segments ? params.segments[0] : undefined);
  const isLog = entryId != null;
  let date, sessionId;
  if (isLog) {
    date = String(entryId).slice(0, 10);
    sessionId = String(entryId).slice(11);
  } else {
    date = params.date;
    sessionId = params.sessionId;
  }
  const back = isLog ? '#/history' : '#/today';
  const existing = date && sessionId ? getEntry(date, sessionId) : undefined;
  const session = safeSession(sessionId, existing);
  container.replaceChildren();
  const root = h('div', { class: 'v-session stack' });
  container.append(root);

  if (!session) {
    root.append(h('div', { class: 'card' }, h('p', {}, 'Séance introuvable.'),
      h('a', { class: 'btn', href: back }, 'Retour')));
    return;
  }

  const isRun = session.type === 'run';
  const isExtra = sessionId === 'extra-run';
  const plan = session.plan || {};

  /* ----- état ----- */
  const st = {
    status: existing ? existing.status : 'done',
    feeling: existing ? existing.feeling || null : null,
    note: existing ? existing.note || '' : '',
  };
  const run = {
    distanceKm: plan.distanceKm || 5,
    durationSec: plan.durationSec || 1800,
    runType: session.runType || 'easy',
  };
  if (existing && existing.run) Object.assign(run, existing.run);
  if (isExtra && !existing) run.runType = 'easy';

  const exs = isRun ? [] : (session.exercises || []).map(ex => {
    const info = exInfo(ex);
    const prev = existing && existing.exercises && existing.exercises.find(e => e.id === ex.id);
    const planned = Array.from({ length: info.test ? 1 : ex.sets }, () => ex.target);
    return {
      ex, info, planned,
      skipped: prev ? !!prev.skipped : false,
      sets: prev && prev.sets && prev.sets.length ? prev.sets.slice() : planned.slice(),
      sel: null,
    };
  });

  /* ----- en-tête ----- */
  root.append(
    h('div', { class: 'v-head' },
      h('a', { class: 'v-back', href: back, 'aria-label': 'Retour' }, '‹'),
      h('div', {},
        h('h2', { class: 'v-title' }, (isRun ? '🏃 ' : '💪 ') + sessionTitle(sessionId, existing)),
        h('div', { class: 'muted' }, formatDateFr(date) + (existing ? ' · modification' : '')))),
  );
  if (session.description && !isExtra) {
    root.append(h('details', { class: 'v-desc card' }, h('summary', {}, 'Consigne du coach'), h('p', {}, session.description)));
  }

  /* ----- statut ----- */
  const body = h('div', { class: 'stack v-body' });
  const refreshers = [];
  const segBtns = {};
  const statuses = isExtra ? [['done', 'Fait'], ['partial', 'Partiel']] : [['done', 'Fait'], ['partial', 'Partiel'], ['skipped', 'Sauté']];
  if (isExtra && st.status === 'skipped') st.status = 'done';
  const allPlanBtn = h('button', { type: 'button', class: 'btn v-plan', onclick: resetAll }, 'Tout comme prévu');
  function applyStatus() {
    for (const [k, b] of Object.entries(segBtns)) {
      b.classList.toggle('active', k === st.status);
      b.setAttribute('aria-pressed', k === st.status ? 'true' : 'false');
    }
    body.hidden = st.status === 'skipped';
    allPlanBtn.hidden = st.status === 'skipped';
  }
  const seg = h('div', { class: 'segmented v-seg', role: 'group', 'aria-label': 'Statut' },
    statuses.map(([k, label]) => (segBtns[k] = h('button', { type: 'button', class: 'v-seg-btn v-seg-' + k, onclick: () => { st.status = k; applyStatus(); } }, label))));
  root.append(seg, allPlanBtn, body);

  /* ----- course ----- */
  if (isRun) {
    const distInput = h('input', { class: 'v-input', type: 'text', inputmode: 'decimal', 'aria-label': 'Distance en km', autocomplete: 'off' });
    const durInput = h('input', { class: 'v-input', type: 'text', inputmode: 'numeric', 'aria-label': 'Durée', autocomplete: 'off', placeholder: 'mm:ss' });
    const paceEl = h('div', { class: 'v-pace' });
    const typeSel = h('select', { class: 'v-input v-select', 'aria-label': 'Type de course', onchange: () => { run.runType = typeSel.value; } },
      RUN_TYPES.map(([k, l]) => h('option', { value: k }, l)));
    const syncPace = () => {
      const ok = run.distanceKm > 0 && run.durationSec > 0;
      paceEl.textContent = ok ? formatPace(run.durationSec / run.distanceKm) : '–';
    };
    const syncRun = () => {
      distInput.value = fmtKm(run.distanceKm);
      durInput.value = formatDuration(run.durationSec);
      durInput.classList.remove('invalid');
      typeSel.value = run.runType;
      syncPace();
    };
    const setDist = (d) => { run.distanceKm = Math.max(0, Math.round(d * 10) / 10); distInput.value = fmtKm(run.distanceKm); syncPace(); };
    const setDur = (s) => { run.durationSec = Math.max(0, Math.round(s)); durInput.value = formatDuration(run.durationSec); durInput.classList.remove('invalid'); syncPace(); };
    distInput.addEventListener('input', () => {
      const v = parseFloat(distInput.value.replace(',', '.'));
      if (isFinite(v) && v >= 0) { run.distanceKm = v; distInput.classList.remove('invalid'); } else distInput.classList.add('invalid');
      syncPace();
    });
    distInput.addEventListener('blur', () => { distInput.value = fmtKm(run.distanceKm); distInput.classList.remove('invalid'); });
    durInput.addEventListener('input', () => {
      const v = parseDuration(durInput.value);
      if (v != null) { run.durationSec = v; durInput.classList.remove('invalid'); } else durInput.classList.add('invalid');
      syncPace();
    });
    durInput.addEventListener('blur', () => { durInput.value = formatDuration(run.durationSec); durInput.classList.remove('invalid'); });
    const sb = (label, fn) => h('button', { type: 'button', class: 'v-step-btn', onclick: fn }, label);

    body.append(h('div', { class: 'card stack' },
      h('label', { class: 'v-label' }, 'Distance (km)'),
      h('div', { class: 'v-step-row' }, sb('−1', () => setDist(run.distanceKm - 1)), sb('−0,1', () => setDist(run.distanceKm - 0.1)),
        distInput, sb('+0,1', () => setDist(run.distanceKm + 0.1)), sb('+1', () => setDist(run.distanceKm + 1))),
      h('label', { class: 'v-label' }, 'Durée (mm:ss ou h:mm:ss)'),
      h('div', { class: 'v-step-row v-step-row-3' }, sb('−1 min', () => setDur(run.durationSec - 60)),
        durInput, sb('+1 min', () => setDur(run.durationSec + 60))),
      h('div', { class: 'v-pace-row' }, h('span', { class: 'muted' }, 'Allure'), paceEl),
      h('label', { class: 'v-label' }, 'Type'), typeSel,
    ));
    refreshers.push(syncRun);
    syncRun();
  } else {
    /* ----- calisthénie ----- */
    exs.forEach(s => {
      let node = null;
      const unit = s.info.metric === 'seconds' ? 's' : 'reps';
      const step = s.info.metric === 'seconds' ? 5 : 1;
      const planTxt = s.info.test ? 'Test : valeur maximale' :
        `${s.ex.sets} × ${s.ex.target} ${unit}` + (s.info.perSide ? ' · par jambe' : '');
      const stepper = (get, set) => {
        const inp = h('input', { class: 'v-input v-num', type: 'text', inputmode: 'numeric', 'aria-label': 'Valeur', value: String(get()) });
        inp.addEventListener('input', () => { const v = parseInt(inp.value, 10); if (isFinite(v) && v >= 0) { set(v, true); } });
        const upd = (v) => { set(Math.max(0, v)); };
        return h('div', { class: 'v-step-row v-step-row-3' },
          h('button', { type: 'button', class: 'v-step-btn', 'aria-label': 'Moins', onclick: () => upd(get() - step) }, '−'),
          inp,
          h('button', { type: 'button', class: 'v-step-btn', 'aria-label': 'Plus', onclick: () => upd(get() + step) }, '+'));
      };
      const draw = () => {
        const head = h('div', { class: 'v-ex-head' },
          h('div', { class: 'v-ex-name' },
            h('strong', {}, s.info.name),
            s.info.optional ? h('span', { class: 'badge badge-todo v-opt' }, 'facultatif') : null,
            h('div', { class: 'muted v-ex-plan' }, planTxt)),
          h('label', { class: 'v-skip' },
            h('input', { type: 'checkbox', checked: s.skipped, onchange: (e) => { s.skipped = e.target.checked; s.sel = null; refresh(); } }),
            h('span', {}, 'Sauté')));
        const card = h('div', { class: 'card v-ex stack' + (s.skipped ? ' is-skipped' : '') }, head,
          s.info.tip && !s.skipped ? h('div', { class: 'muted v-tip' }, s.info.tip) : null);
        if (!s.skipped) {
          if (s.info.test) {
            card.append(h('label', { class: 'v-label' }, `Max (${unit})`),
              stepper(() => s.sets[0] ?? 0, (v, typing) => { s.sets[0] = v; if (!typing) refresh(); }));
          } else {
            const chips = h('div', { class: 'v-chips' }, s.sets.map((v, i) =>
              h('button', {
                type: 'button',
                class: 'v-chip' + (s.sel === i ? ' sel' : '') + (v !== s.planned[i] ? ' changed' : ''),
                'aria-label': `Série ${i + 1} : ${v}`,
                onclick: () => { s.sel = s.sel === i ? null : i; refresh(); },
              }, String(v))));
            card.append(chips);
            if (s.sel != null && s.sel < s.sets.length) {
              const i = s.sel;
              card.append(h('div', { class: 'v-sel-panel' },
                h('div', { class: 'muted' }, `Série ${i + 1} (${unit})`),
                stepper(() => s.sets[i], (v, typing) => { s.sets[i] = v; if (!typing) refresh(); })));
            }
            card.append(h('div', { class: 'v-set-btns' },
              h('button', { type: 'button', class: 'btn v-small', onclick: () => { s.sets.push(s.sets.length ? s.sets[s.sets.length - 1] : s.ex.target); s.sel = s.sets.length - 1; refresh(); } }, '+ série'),
              h('button', { type: 'button', class: 'btn v-small', disabled: s.sets.length <= 1, onclick: () => { s.sets.pop(); if (s.sel != null && s.sel >= s.sets.length) s.sel = null; refresh(); } }, '− série')));
          }
        }
        return card;
      };
      const refresh = () => {
        const n = draw();
        if (node && node.parentNode) node.replaceWith(n);
        node = n;
      };
      node = draw();
      body.append(node);
      refreshers.push(() => { s.sel = null; refresh(); });
      s._reset = () => { s.skipped = false; s.sets = s.planned.slice(); s.sel = null; };
    });
  }

  function resetAll() {
    st.status = 'done';
    if (isRun) { run.distanceKm = plan.distanceKm || run.distanceKm; run.durationSec = plan.durationSec || run.durationSec; run.runType = session.runType || run.runType; }
    else exs.forEach(s => s._reset());
    refreshers.forEach(f => f());
    applyStatus();
    toast('Valeurs du plan restaurées');
  }

  /* ----- ressenti + note ----- */
  const fBtns = FEELINGS.map(([n, label]) => h('button', {
    type: 'button', class: 'v-feel', 'aria-label': `${n} ${label}`,
    onclick: () => { st.feeling = st.feeling === n ? null : n; syncFeel(); },
  }, h('strong', {}, String(n)), h('span', {}, label)));
  const syncFeel = () => fBtns.forEach((b, i) => { b.classList.toggle('sel', st.feeling === i + 1); b.setAttribute('aria-pressed', st.feeling === i + 1 ? 'true' : 'false'); });
  syncFeel();
  const noteEl = h('textarea', { class: 'v-input v-note', rows: 3, placeholder: 'Note (facultative)', 'aria-label': 'Note' });
  noteEl.value = st.note;
  noteEl.addEventListener('input', () => { st.note = noteEl.value; });
  root.append(h('div', { class: 'card stack' }, h('div', { class: 'v-label' }, 'Ressenti'), h('div', { class: 'v-feels' }, fBtns), noteEl));
  applyStatus();

  /* ----- suppression ----- */
  if (existing) {
    const zone = h('div', { class: 'v-delete' });
    const showBtn = () => {
      zone.replaceChildren(h('button', { type: 'button', class: 'btn btn-ghost v-del', onclick: showConfirm }, 'Supprimer cette saisie'));
    };
    const showConfirm = () => {
      zone.replaceChildren(h('div', { class: 'card stack v-confirm' }, h('p', {}, 'Supprimer définitivement cette saisie ?'),
        h('div', { class: 'row v-confirm-btns' },
          h('button', { type: 'button', class: 'btn', onclick: showBtn }, 'Annuler'),
          h('button', {
            type: 'button', class: 'btn v-danger', onclick: async (e) => {
              e.target.disabled = true;
              try {
                const r = await deleteEntry(existing.id);
                toast(r && r.synced === false ? 'Supprimé hors ligne, synchro en attente' : 'Supprimé');
                location.hash = back;
              } catch (err) { toast('Erreur : ' + (err.message || err)); e.target.disabled = false; }
            },
          }, 'Confirmer'))));
    };
    showBtn();
    root.append(zone);
  }

  /* ----- enregistrer ----- */
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary v-save' }, 'Enregistrer');
  saveBtn.addEventListener('click', async () => {
    if (st.status !== 'skipped' && isRun) {
      if (!(run.durationSec > 0) || !(run.distanceKm > 0)) { toast('Distance et durée requises'); return; }
    }
    const entry = {
      id: `${date}-${sessionId}`, date, sessionId, status: st.status,
      note: st.note.trim(), loggedAt: new Date().toISOString(),
    };
    if (st.feeling) entry.feeling = st.feeling;
    if (isRun) {
      if (st.status !== 'skipped') entry.run = { distanceKm: Math.round(run.distanceKm * 100) / 100, durationSec: Math.round(run.durationSec), runType: run.runType };
    } else {
      entry.exercises = exs.map(s => ({ id: s.ex.id, skipped: st.status === 'skipped' ? true : s.skipped, sets: (st.status === 'skipped' || s.skipped) ? [] : s.sets.slice() }));
    }
    saveBtn.disabled = true;
    try {
      const r = await saveEntry(entry);
      toast(r && r.synced === false ? 'Enregistré hors ligne, synchro en attente' : 'Enregistré');
      location.hash = back;
    } catch (err) {
      toast('Erreur : ' + (err.message || err));
      saveBtn.disabled = false;
    }
  });
  root.append(h('div', { class: 'v-savebar' }, saveBtn));
}
