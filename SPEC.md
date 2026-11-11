# Sport Tracker — Spécification

Site statique (GitHub Pages) pour suivre un programme course + calisthénie, piloté depuis un téléphone.
Le **programme** (`data/program.json`) est écrit par le coach (commits). Le **journal** (`data/log.json`) est écrit par l'utilisateur via le site, qui fait des commits avec l'API GitHub.

Langue de l'interface : **français**. Cible : **mobile d'abord** (360–430 px), utilisable sur desktop.

## 1. Contraintes techniques

- HTML + CSS + JavaScript **vanilla, modules ES** (`<script type="module">`). **Aucun build, aucune dépendance npm, aucun CDN.** Graphiques en SVG faits main.
- Tout doit fonctionner servi depuis la racine du dépôt (GitHub Pages, chemin de base `/Sport-Tracker/` → n'utiliser **que des chemins relatifs**).
- Navigation par hash : `#/today`, `#/week`, `#/week?offset=-1`, `#/progress`, `#/history`, `#/log/<entryId>` (édition), `#/session/<date>/<sessionId>` (saisie), `#/settings`.
- Barre de navigation fixe en bas : Aujourd'hui · Semaine · Progrès · Historique. Icône réglages en haut à droite.
- Aucune information personnelle identifiable dans le code ou les données (pas de nom, pas de mention médicale).
- Données sensibles locales (token) uniquement dans `localStorage`, jamais commitées.

## 2. Arborescence

```
index.html
css/style.css
js/app.js              # bootstrap, routeur, nav, rendu des vues      (Agent 1)
js/store.js            # chargement données, GitHub API, file hors ligne (Agent 1)
js/program.js          # logique calendrier : quelle séance quel jour  (Agent 1)
js/util.js             # formatage dates/durées/allures, helpers DOM  (Agent 1)
js/views/settings.js   #                                              (Agent 1)
js/views/today.js      #                                              (Agent 2)
js/views/week.js       #                                              (Agent 2)
js/views/session.js    # formulaire de saisie (course + calisthénie)  (Agent 2)
js/views/history.js    #                                              (Agent 2)
js/stats.js            # calculs de progression (fonctions pures)     (Agent 3)
js/charts.js           # graphiques SVG                               (Agent 3)
js/views/progress.js   #                                              (Agent 3)
data/program.json
data/log.json
```

## 3. Modèle de données

### program.json (lecture seule pour l'app)
Voir le fichier. Points clés :
- `startDate` : lundi de la semaine 1 (ISO `YYYY-MM-DD`).
- `weeks[i].days` : clés `mon`, `wed`, `fri`, `weekend` → liste d'ids de `sessions`. `weekend` = **bonus** (affiché comme facultatif, réalisable samedi OU dimanche ; ne compte pas comme manqué).
- Au-delà de la dernière semaine, l'app **répète la dernière semaine** et affiche un bandeau « Programme terminé : demande une mise à jour au coach ».
- Avant `startDate` : afficher la semaine 1 en aperçu, avec un bandeau « Démarre le … ».
- `sessions[id].type` : `run` ou `calisthenics`.
  - run : `runType` (`easy` | `intervals` | `tempo` | `long` | `test`), `plan.distanceKm`, `plan.durationSec`, `description`.
  - calisthenics : `exercises[]` = `{ id, sets, target, restSec }` ; `target` en reps ou secondes selon `exercises[id].metric`. `perSide: true` → reps par jambe. `optional: true` → affiché « facultatif ». `test: "maxPullups" | "maxLsit"` → exercice de test, sa valeur alimente les records.
- `goals[]` : `metric` ∈ `maxPullups`, `maxLsit`, `best5k`, `best10k`, `weeklyKm`. `current` = valeur de départ, `target` = objectif. Pour `best5k`/`best10k`, plus petit = mieux.

### log.json (écrit par l'app)
```json
{
  "version": 1,
  "entries": [
    {
      "id": "2026-11-16-cali-a-w1",
      "date": "2026-11-16",
      "sessionId": "cali-a-w1",
      "status": "done",
      "feeling": 4,
      "note": "",
      "loggedAt": "2026-11-16T19:42:00.000Z",
      "run": { "distanceKm": 4.1, "durationSec": 1740, "runType": "easy" },
      "exercises": [
        { "id": "pullup", "skipped": false, "sets": [5, 5, 5, 5, 4] }
      ]
    }
  ]
}
```
- `id` = `<date>-<sessionId>` (unique ; une saisie existante est remplacée, pas dupliquée).
- `status` : `done` | `partial` | `skipped`.
- `feeling` : 1–5 (1 = très dur, 5 = très facile), facultatif.
- `run` présent seulement pour les séances course ; `exercises` seulement pour la calisthénie. Valeurs de `sets` = reps ou secondes (selon metric), par côté si `perSide`.
- `sessionId` peut aussi valoir `"extra-run"` (course libre hors programme, ajoutable depuis Aujourd'hui) ; dans ce cas `run` est obligatoire.

## 4. Interfaces entre modules (contrat — à respecter strictement)

### js/util.js (Agent 1)
```js
export const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
export function todayISO(): string                       // date locale YYYY-MM-DD
export function parseISO(iso): Date                      // minuit local
export function toISO(date): string
export function addDays(iso, n): string
export function mondayOf(iso): string
export function formatDateFr(iso, {weekday=true}={}): string   // "lun. 16 nov."
export function formatDuration(sec): string              // "28:05" ou "1:05:12"
export function parseDuration(str): number|null          // "28:05" | "1:05:12" | "28" (min) → sec
export function formatPace(secPerKm): string             // "6:52 /km"
export function el(tag, attrs={}, ...children): HTMLElement  // helper DOM ; attrs: class, on<event>, dataset, etc.
```

### js/store.js (Agent 1)
```js
export async function init(): Promise<void>     // charge program + log (API si token, sinon fetch relatif), applique la file hors ligne
export function getProgram(): object
export function getLog(): object                // { version, entries } incluant les saisies en attente
export function getEntry(date, sessionId): object|undefined
export async function saveEntry(entry): Promise<{synced: boolean}>   // upsert par id, met à jour l'état local immédiatement, puis commit (ou file d'attente)
export async function deleteEntry(id): Promise<{synced: boolean}>
export function getSyncState(): { pending: number, lastError: string|null, configured: boolean }
export function onChange(cb): void               // appelé après toute modif (locale ou synchro)
export function getSettings(): { owner, repo, branch, token }
export function setSettings(s): void
export async function testConnection(): Promise<{ok: boolean, message: string}>
export async function syncNow(): Promise<void>
```
Détails :
- Lecture : avec token → `GET /repos/{owner}/{repo}/contents/data/log.json?ref={branch}` (contenu base64 UTF-8, garder le `sha`). Sans token → `fetch('data/log.json', {cache:'no-store'})` en lecture seule (le site reste consultable).
- Écriture : `PUT /repos/{owner}/{repo}/contents/data/log.json` avec `message` (ex. `log: 2026-11-16 cali-a-w1 (done)`), `content` (base64 UTF-8 du JSON indenté 2 espaces + `\n`), `sha`, `branch`. En cas de 409/422 (sha obsolète) : relire, ré-appliquer les opérations en attente, réessayer (max 3).
- File hors ligne : opérations `{op:'upsert'|'delete', entry|id}` dans `localStorage['st.queue']`, rejouées à `init`, à l'événement `online`, et via `syncNow`. Cache du dernier log/program connu dans `localStorage` pour démarrer sans réseau.
- Défauts réglages : owner `alexandreGalas`, repo `Sport-Tracker`, branch `main`. Encodage base64 UTF-8 correct (accents !) : `TextEncoder` / `TextDecoder`.

### js/program.js (Agent 1)
```js
export function weekIndexFor(iso): number          // 0-based, peut être <0 (avant départ) ; borné pour la lecture
export function weekInfo(iso): { index, label, mondayISO, beforeStart: bool, finished: bool }
export function sessionsForDate(iso): Array<{ sessionId, session, bonus: bool }>
   // lun/mer/ven → sessions du jour ; sam ET dim → sessions 'weekend' avec bonus:true ; mar/jeu → []
export function plannedWeek(mondayISO): Array<{ date, dayKey, items: [{sessionId, session, bonus}] }>  // 7 jours
export function getSession(sessionId): object      // gère 'extra-run' (séance course générique)
export function getExercise(exId): object
export function weekendDone(mondayISO): boolean    // bonus fait le sam ou le dim
```

### js/app.js (Agent 1)
- Routeur : chaque vue exporte `export function render(container, params)` (params = segments + query). `app.js` importe toutes les vues, vide le conteneur, appelle `render`. Re-rendu de la vue courante sur `store.onChange`.
- Indicateur de synchro dans l'en-tête : « ✓ synchronisé », « ⟳ N en attente », « ⚠ erreur » (clic → réglages), « lecture seule » si pas de token.

### js/stats.js (Agent 3) — fonctions pures, prennent `(log, program)`
```js
export function weeklyRunKm(log, program, {weeks=12}): Array<{ mondayISO, km }>
export function runPaces(log): Array<{ date, paceSecPerKm, runType, distanceKm }>
export function bestTimes(log, program): { best5k: {sec,date}|null, best10k: {sec,date}|null }
   // une course de distance ≥ d compte ; temps ramené à d au prorata de l'allure. runType 'test' prioritaire si présent.
export function maxPullups(log, program): Array<{ date, value }>   // max de série sur pullup + pullup-test
export function weeklyPullupVolume(log, program, {weeks=12}): Array<{ mondayISO, reps }>   // pullup + chinup + pullup-test
export function maxLsit(log, program): Array<{ date, value }>
export function adherence(log, program, {weeks=8}): Array<{ mondayISO, planned, done, partial, bonusDone }>   // hors bonus pour planned
export function goalProgress(log, program): Array<{ goal, current, pct }>   // current = meilleure valeur atteinte ou goal.current
export function streakWeeks(log, program): number   // semaines consécutives (jusqu'à la semaine passée) avec toutes les séances non-bonus faites ou partielles
```

### js/charts.js (Agent 3)
```js
export function lineChart({ points:[{x:label, y:number}], yFormat, height=180, invert=false }): SVGElement
export function barChart({ bars:[{x:label, y:number}], yFormat, height=180, target }): SVGElement   // ligne pointillée pour target
```
Couleurs via variables CSS (`--accent`, `--muted`, `--grid`), lisibles en mode clair et sombre. État vide propre (« Pas encore de données »).

## 5. Écrans

### Aujourd'hui (`#/today`) — Agent 2
- En-tête : date du jour, label de semaine (« Semaine 2 / 4 »), bandeaux éventuels (avant départ / programme terminé).
- Une **carte par séance du jour** : icône (course 🏃 / calisthénie 💪), titre, résumé (course : distance + durée prévues + allure cible calculée ; calisthénie : liste « Tractions 5×5 · L-sit 5×5 s … »), badge statut (À faire / Fait / Partiel / Sauté), badge « Bonus » le week-end. Description du coach dépliable. Bouton principal « Saisir » (ou « Modifier » si déjà saisi) → `#/session/<date>/<sessionId>`. Bouton secondaire « Sauté » (enregistre `status: skipped` en un tap).
- Mardi/jeudi sans séance : message « Repos » + prochaine séance prévue (jour + titre).
- Bouton « + Course libre » → saisie `extra-run` pour la date du jour.
- Bloc « Cette semaine » compact : X/Y séances faites + km de la semaine.

### Saisie (`#/session/<date>/<sessionId>`) — Agent 2
Principe : **tout est pré-rempli avec le prévu** (ou avec la saisie existante) ; l'utilisateur ne modifie que les écarts.
- Statut : boutons segmentés Fait / Partiel / Sauté (défaut Fait).
- **Course** : distance (km, stepper ±0,1 et ±1 + champ numérique décimal, `inputmode="decimal"`), durée (champ `mm:ss` ou `h:mm:ss`, `inputmode="numeric"`, plus steppers ±1 min), allure calculée en direct, type (pré-rempli, modifiable).
- **Calisthénie** : une carte par exercice : nom, prévu (« 5 × 5 reps », « par jambe » si perSide, « facultatif »), astuce, puis une rangée de **pastilles par série** pré-remplies avec la cible ; tap sur une pastille → steppers −/+ (grands boutons ≥ 44 px) ; bouton « + série » / « − série » ; case « Sauté ». Bouton « Tout comme prévu » en haut pour revenir aux valeurs prévues. Les exercices `test` mettent en avant le champ unique « Max ».
- Ressenti : 5 boutons 1–5 avec libellés (Très dur … Très facile). Note libre (textarea, facultative).
- Bouton « Enregistrer » collant en bas → `store.saveEntry` → retour à `#/today` (ou page précédente) avec toast « Enregistré » / « Enregistré hors ligne, synchro en attente ».
- Dans la page d'édition d'une saisie existante : bouton « Supprimer » (confirmation inline, **pas** de `confirm()` natif).

### Semaine (`#/week`) — Agent 2
- Navigation ‹ semaine précédente / suivante › ; titre « Semaine N · 16–22 nov. ».
- Liste des 7 jours ; pour chaque jour, les séances prévues avec statut (pastille de couleur) ; le jour courant mis en évidence ; tap → saisie. Week-end regroupé en une ligne « Week-end (bonus) ». Les saisies hors programme (`extra-run`) apparaissent aussi.
- Résumé en bas : séances faites / prévues, km courus, volume de tractions.

### Historique (`#/history`) — Agent 2
- Liste antichronologique groupée par semaine : date, titre de séance, statut, résumé (« 4,1 km · 29:00 · 7:04 /km » ou « Tractions 24 reps · L-sit 30 s »), ressenti. Tap → `#/log/<entryId>` (même formulaire que la saisie, pré-rempli). Filtre : Tout / Course / Calisthénie.

### Progrès (`#/progress`) — Agent 3
- Cartes objectifs (`goalProgress`) : libellé, actuel → cible, barre de progression.
- Série de semaines (`streakWeeks`) et régularité (`adherence`, barres sur 8 semaines).
- Course : km par semaine (barres, cible 15 km), allure des sorties (ligne, axe inversé : plus bas = plus lent), meilleurs temps 5 km / 10 km.
- Calisthénie : max tractions (ligne), volume de tractions par semaine (barres), max L-sit (ligne).
- Onglets ou sections Course / Calisthénie.

### Réglages (`#/settings`) — Agent 1
- Champs owner, repo, branche, token (type password) + bouton « Tester la connexion ».
- Aide courte : créer un **fine-grained personal access token** limité au dépôt Sport-Tracker, permission **Contents : Read and write**.
- État de synchro, bouton « Synchroniser maintenant », bouton « Recharger le programme ».
- Version du programme (`program.updatedAt`) et note du coach.

## 6. Design
- Thème sombre par défaut avec respect de `prefers-color-scheme` ; variables CSS dans `:root`.
- Typo système, tailles généreuses, cibles tactiles ≥ 44 px, `env(safe-area-inset-*)` pour la barre du bas.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `manifest.webmanifest` minimal (nom « Sport Tracker », display standalone) pour ajout à l'écran d'accueil.
- Pas de `alert()` / `confirm()` / `prompt()` natifs : toasts et confirmations inline.
- Classes CSS partagées définies par Agent 1 dans `css/style.css` : `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.badge`, `.badge-done`, `.badge-partial`, `.badge-skipped`, `.badge-todo`, `.badge-bonus`, `.segmented`, `.stepper`, `.chip`, `.toast`, `.banner`, `.section-title`, `.muted`, `.row`, `.stack`. Les agents 2 et 3 peuvent ajouter leurs styles dans `css/views.css` (Agent 2) et `css/progress.css` (Agent 3), tous deux liés dans `index.html`.

## 7. Workflow coach
Le coach lit `data/log.json`, ajuste `data/program.json` (nouvelles semaines, cibles, objectifs) et commite avec un message `program: …`. L'app recharge le programme à chaque ouverture.
