// Réglages : accès GitHub, synchro, programme.
import * as store from '../store.js';
import { el, formatDateFr } from '../util.js';

export function render(container) {
  const s = store.getSettings();
  const field = (id, label, value, extra = {}) =>
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, label),
      el('input', { id, value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...extra }));

  const result = el('div', { class: 'banner', hidden: true, role: 'status' });
  const syncBox = el('div', { class: 'muted' });
  const showResult = (ok, msg) => {
    result.hidden = false;
    result.className = 'banner ' + (ok ? 'banner-ok' : 'banner-error');
    result.textContent = msg;
  };
  const refreshSync = () => {
    const st = store.getSyncState();
    syncBox.textContent = !st.configured
      ? 'Mode lecture seule : aucun token.'
      : st.lastError ? `Erreur : ${st.lastError} (${st.pending} en attente)`
        : st.pending ? `${st.pending} saisie(s) en attente de synchronisation.` : 'Tout est synchronisé.';
  };
  const read = () => ({
    owner: container.querySelector('#set-owner').value,
    repo: container.querySelector('#set-repo').value,
    branch: container.querySelector('#set-branch').value,
    token: container.querySelector('#set-token').value,
  });

  const saveBtn = el('button', {
    class: 'btn btn-primary', type: 'button',
    onclick: () => { store.setSettings(read()); showResult(true, 'Réglages enregistrés.'); refreshSync(); },
  }, 'Enregistrer');
  const testBtn = el('button', {
    class: 'btn', type: 'button',
    onclick: async () => {
      store.setSettings(read());
      testBtn.disabled = true;
      showResult(true, 'Test en cours…');
      const r = await store.testConnection();
      showResult(r.ok, r.message);
      testBtn.disabled = false;
    },
  }, 'Tester la connexion');
  const syncBtn = el('button', {
    class: 'btn', type: 'button',
    onclick: async () => { syncBtn.disabled = true; await store.syncNow(); syncBtn.disabled = false; refreshSync(); },
  }, 'Synchroniser maintenant');
  const reloadBtn = el('button', {
    class: 'btn', type: 'button',
    onclick: async () => {
      reloadBtn.disabled = true;
      await store.init();
      reloadBtn.disabled = false;
      render(container);
    },
  }, 'Recharger le programme');

  const p = store.getProgram();
  container.append(
    el('section', { class: 'card stack' },
      el('h2', { class: 'section-title' }, 'Accès GitHub'),
      field('set-owner', 'Propriétaire', s.owner),
      field('set-repo', 'Dépôt', s.repo),
      field('set-branch', 'Branche', s.branch),
      field('set-token', 'Token', s.token, { type: 'password', autocomplete: 'off' }),
      el('p', { class: 'muted small' },
        'Crée un fine-grained personal access token limité au dépôt Sport-Tracker, avec la permission ',
        el('strong', {}, 'Contents : Read and write'),
        '. Le token reste uniquement dans ce navigateur (localStorage). Sans token, le site est en lecture seule.'),
      el('div', { class: 'row wrap' }, saveBtn, testBtn),
      result),
    el('section', { class: 'card stack' },
      el('h2', { class: 'section-title' }, 'Synchronisation'),
      syncBox,
      el('div', { class: 'row wrap' }, syncBtn, reloadBtn)),
    el('section', { class: 'card stack' },
      el('h2', { class: 'section-title' }, 'Programme'),
      el('div', { class: 'muted' }, p.updatedAt ? `Version du ${formatDateFr(p.updatedAt, { weekday: false })}` : 'Version inconnue'),
      p.coachNote ? el('p', {}, p.coachNote) : null));
  refreshSync();
}
