# Section JEUX et personnalisation complète du jeu Flappy Bird — design

Date : 2026-09-13 · Statut : validé en brainstorming, prêt pour le plan d'implémentation.

## 1. Objectif

Ajouter au Game Studio (`/admin/`) une section **JEUX** avec une sous-section par type de
jeu (Flappy Bird aujourd'hui), et permettre la personnalisation complète d'une campagne
Flappy Bird depuis l'admin : écrans et textes, formulaire d'inscription (champs fixes et
libres), univers visuel (personnage, décors par palier, obstacles, typographie, couleurs),
gameplay (presets + mode personnalisé) et écran de classement. L'aperçu de l'éditeur
charge le vrai jeu en mode brouillon, jouable, mis à jour en direct.

Hors périmètre (décidé) : audio (sons, musique, mute), upload de polices, réécriture canvas,
modèle « maître » par type de jeu (chaque campagne porte sa configuration complète).

## 2. État actuel (résumé)

- Config à plat dans `shared/game-config.mjs` (`DEFAULT_GAME`, `normalizeGame`).
- `main.js` mélange le jeu historique Crousty (Firebase direct sur
  `campaigns/crousty_2026`), le jeu géré (`managed-game.mjs` → `/api/game`) et le moteur.
- Figé dans le code : 4 fonds par palier (scores 20/40/60), vitesse 5→7→10→15, gravité
  0.65→0.75→0.9→1.2, saut −12.6, écart 31 vh, spawn 100 ticks, textes de tous les écrans,
  4 champs de formulaire obligatoires, top 10, format « Prénom N. », Arial.
- Aperçu admin : maquette HTML de l'accueil uniquement.

## 3. Modèle de configuration

### 3.1 Structure

Un jeu `studio/games/{id}` conserve ses clés de campagne : `name`, `company`, `type`,
`status`, `startsAt`, `endsAt`, `maxGames`, `countdownSeconds`, `termsUrl`, `privacyUrl`,
`marketingLabel`, `emailsEnabled`, `emailSubject`, `emailBody`, `createdAt`, `updatedAt`,
`updatedBy`. Il gagne un bloc `flappy` :

```js
flappy: {
  brand: { logoUrl: '', accent: '#ffdc65' },
  theme: {
    font: 'system' | 'pixel' | 'manrope' | 'poppins' | 'fredoka',
    panelBg: '#ffffff', panelText: '#111111',
    buttonBg: '#111111', buttonText: '#ffffff',
    hudText: '#ffffff', overlayColor: '#000000', overlayOpacity: 78
  },
  screens: {
    welcome:   { title: '', subtitle: 'Fais le meilleur score !', button: 'JOUER',
                 info: '{{parties}} parties pour réaliser ton meilleur score' },
    countdown: { title: 'PRÊT ?', hint: 'Touche l’écran pour voler',
                 hintDesktop: 'Sur ordinateur : espace ou flèche ↑' },
    hud:       { roundLabel: 'PARTIE {{n}}/{{total}}' },
    gameOver:  { title: 'GAME OVER', scoreLabel: 'Score : {{score}}',
                 replay: 'REJOUER', seeRanking: 'VOIR LE CLASSEMENT' },
    ranking:   { title: '🏆 TOP {{places}} · {{jeu}}',
                 bestScore: 'Ton meilleur score : {{score}} pts',
                 caption: 'Tes {{parties}} parties sont terminées. Merci d’avoir joué !',
                 empty: 'Aucun score pour le moment.',
                 ctaLabel: '', ctaUrl: '' }
  },
  form: {
    fields: {
      firstName: { visible: true, required: true, label: 'Prénom' },
      lastName:  { visible: true, required: true, label: 'Nom' },
      email:     { visible: true, required: true, label: 'E-mail' },   // verrouillé
      phone:     { visible: true, required: true, label: 'Téléphone' }
    },
    customFields: [ { id: 'magasin', label: 'Magasin', type: 'text' | 'select' | 'checkbox',
                      required: false, options: ['Paris', 'Lyon'] } ]  // max 5
  },
  character: { imageUrl: '', size: 64, startX: 18, startY: 40, rotateOnJump: true, hitboxScale: 90 },
  stages: [
    { minScore: 0,  backgroundUrl: '', speed: 5,  gravity: 0.65 },
    { minScore: 20, backgroundUrl: '', speed: 7,  gravity: 0.75 },
    { minScore: 40, backgroundUrl: '', speed: 10, gravity: 0.9 },
    { minScore: 60, backgroundUrl: '', speed: 15, gravity: 1.2 }
  ],                                                                 // 1 à 4 paliers
  obstacles: { style: 'gradient' | 'image', topUrl: '', bottomUrl: '',
               colorA: '#2f8f2f', colorB: '#6ddd53', border: '#164d16', width: 15, radius: 8 },
  physics: { preset: 'easy' | 'normal' | 'hard' | 'custom', jumpForce: 12.6, gap: 31, spawnEvery: 100 },
  leaderboard: { places: 10, nameFormat: 'firstInitial' | 'first' | 'full', showOwnRank: true }
}
```

Un `title` d'accueil vide affiche le nom du jeu. Un fond de palier vide reprend le fond du
palier précédent (ou `/img/background.jpg` pour le premier). Un personnage vide reprend
`/img/logo.png`.

### 3.2 Validation (`normalizeFlappy`)

- Textes ≤ 200 caractères, trim ; couleurs `#rrggbb` ; URLs HTTPS uniquement (`assetUrl`).
- `size` 32–120 (px) ; `startX` 5–40 (vw) ; `startY` 20–70 (vh) ; `hitboxScale` 60–100 (%).
- `speed` 2–25 ; `gravity` 0.3–2 ; `jumpForce` 6–20 ; `gap` 20–45 (vh) ; `spawnEvery` 40–200
  (ticks à 60 Hz) ; `width` 8–25 (vw) ; `radius` 0–30 ; `overlayOpacity` 0–100.
- `stages` : 1 à 4 entrées, `minScore` entiers, le premier vaut 0, strictement croissants.
- `places` 3–50 entier.
- `preset` ≠ `custom` : les valeurs du preset écrasent `stages[].speed`, `stages[].gravity`,
  `jumpForce`, `gap`, `spawnEvery`. Presets = valeurs actuelles :
  `speedFactor` 0.8 / 1 / 1.2 appliqué aux vitesses de base 5/7/10/15, `gap` 36 / 31 / 28,
  `gravity` et `jumpForce` inchangés. Aucun changement de gameplay pour les jeux existants.
- `customFields` : ≤ 5 ; `id` slug `[a-z0-9_]{1,30}` unique et distinct des 4 champs fixes ;
  `label` requis ; `type` ∈ {text, select, checkbox} ; `select` exige 1–20 `options`
  non vides distinctes.
- `form.fields.email` est forcé à `visible: true, required: true`.
- `ctaUrl` requis si `ctaLabel` non vide ; `ctaUrl` sans `ctaLabel` est ignoré.
- Erreurs : `Error` avec message en français et propriété `path` (ex. `stages.2.minScore`)
  pour que l'admin pointe la section fautive.

### 3.3 Variables de texte

`{{jeu}}`, `{{société}}`, `{{parties}}`, `{{places}}`, `{{score}}`, `{{n}}`, `{{total}}`,
`{{prenom}}`. Rendu par `renderText(template, vars)` dans `shared/flappy-config.mjs`,
partagé par le jeu et l'aperçu. Les variables inconnues sont laissées telles quelles.

### 3.4 Rétro-compatibilité (`migrateLegacyGame`)

Si `game.flappy` est absent, construction depuis les anciennes clés :
`birdUrl → character.imageUrl` ; `backgroundUrl → stages[0].backgroundUrl` ;
`pipeUrl → obstacles.style = 'image', topUrl = bottomUrl = pipeUrl` ;
`difficulty → physics.preset` ; `accent, logoUrl → brand` ;
`subtitle → screens.welcome.subtitle`. Appliquée à la lecture dans `api/admin.js` et
`api/game.js` ; les anciennes clés sont retirées à la prochaine sauvegarde. Aucune
migration de base de données.

### 3.5 Registre des types de jeu (`shared/game-types.mjs`)

```js
export const GAME_TYPES = [
  { id: 'flappy', label: 'Flappy Bird', tagline: 'Un tap, un envol. Un classique qui rassemble.',
    icon: '↗', defaults: FLAPPY_DEFAULTS, normalize: normalizeFlappy, migrate: migrateLegacyGame }
];
```

`normalizeGame` (campagne) délègue le bloc `game[type]` à `normalize` du type ; `type`
inconnu → erreur 400.

## 4. Découpage du jeu

### 4.1 Modules

| Module | Rôle |
|---|---|
| `main.js` | Point d'entrée. `?game=ID` → backend géré ; `?preview=1` → backend aperçu ; sinon → backend Crousty historique. Appelle `createFlappyGame(config, backend)`. |
| `legacy-crousty.mjs` | Backend Firebase direct de `campaigns/crousty_2026` (code actuel extrait tel quel). Config = `FLAPPY_DEFAULTS` + textes Crousty actuels. |
| `managed-game.mjs` | Backend `/api/game` (existant), sans manipulation du DOM. |
| `game/flappy/preview.mjs` | Backend simulé : parties illimitées, meilleur score en mémoire, classement factice de 10 noms. Reçoit `postMessage` `{ type: 'flappy:config', config }` et `{ type: 'flappy:goto', screen }` ; vérifie `event.origin` (voir 4.3). Affiche un bandeau « APERÇU — parties illimitées, scores non enregistrés ». |
| `game/flappy/theme.mjs` | `apply(config, vars)` idempotent : textes (`data-text`), CSS vars `--fb-*`, police (Google Font chargée à la demande, `pixel` = `/font/flappy-bird-font`), images, formulaire généré (champs fixes + libres). |
| `game/flappy/engine.mjs` | `startRun({ physics, stages, character, obstacles }, { onScore, onStageChange, onEnd }, dom)` : boucle à pas fixe (`game-loop.mjs`), palier courant, saut, spawn, collisions avec `hitboxScale`, rotation. Pas de texte, pas de réseau ; le DOM est injecté pour rester testable. |
| `game/flappy/screens.mjs` | Machine d'états `welcome → countdown → play → gameOver → ranking`. Lecture/validation du formulaire, appels backend, rendu du classement (places, `nameFormat`, rang du joueur, CTA). |

Interface backend commune : `{ register(player), start(), finish(score), leaderboard() }`.
`leaderboard()` renvoie `{ players: [{ displayName, highScore }], me?: { rank, total } }`.

### 4.2 HTML / CSS

- `index.html` : le formulaire `.user-info` est vide et généré par `theme.mjs` ; les
  autres écrans gardent leur structure avec `data-text="screens.gameOver.title"` etc.
  Ajout d'un `<a id="rankingCta" hidden>` et d'un `<p id="ownRank" hidden>` dans
  `#rankingScreen`.
- `style.css` : toute valeur personnalisable devient une CSS var `--fb-*` avec la valeur
  actuelle par défaut (`--fb-accent`, `--fb-panel-bg`, `--fb-panel-text`, `--fb-button-bg`,
  `--fb-button-text`, `--fb-hud-text`, `--fb-overlay`, `--fb-font`, `--fb-bird-size`,
  `--fb-bird-x`, `--fb-bird-y`, `--fb-pipe-width`, `--fb-pipe-radius`, `--fb-pipe-a/b/border`,
  `--fb-pipe-top`, `--fb-pipe-bottom`, `--fb-background`).
- Le jeu historique Crousty conserve exactement son rendu (defaults = valeurs actuelles).

### 4.3 Mode aperçu

- L'admin charge `/index.html?preview=1` dans l'iframe (même origine : le rewrite
  `/ → /admin/index.html` ne s'applique qu'au chemin `/`). Aucune écriture réelle.
- Origines autorisées pour `postMessage` : `location.origin` de l'iframe, plus
  `PUBLIC_ADMIN_ORIGIN` si défini. Cette valeur est exposée au jeu via
  `/api/game?action=origins` (GET public, renvoie `{ adminOrigin }`), consultée uniquement
  en mode aperçu. En pratique l'iframe est toujours même-origine ; le cross-origin sert au
  bouton « Ouvrir en grand » depuis `admin.myicbooth.com` vers le domaine public.
- L'admin envoie la config normalisée à chaque `input` (debounce 150 ms). Si la
  normalisation échoue, la dernière config valide reste affichée et l'erreur est montrée
  sous le champ.
- Raccourcis d'écran : `flappy:goto` avec `welcome | countdown | gameOver | ranking`.

## 5. Admin

### 5.1 Navigation

```
ESPACE DE TRAVAIL
  ▦ Tableau de bord              stats globales tous types (page dashboard existante)
JEUX
  ↗ Flappy Bird          (03)    campagnes de type flappy (grille filtrée)
HISTORIQUE
  ↗ Participants Crousty         inchangé
```

Générée depuis `GAME_TYPES`. Le dialogue « Créer un jeu » propose le type (un seul
aujourd'hui, présélectionné). Les cartes portent un badge du type.

### 5.2 Éditeur Flappy Bird

Layout : navigation verticale de sections (180 px) · formulaire · aperçu (300 px).
Sous 1150 px : sections en onglets horizontaux défilants, aperçu masqué (comme aujourd'hui)
mais accessible par « Ouvrir en grand ».

| # | Section | Contenu |
|---|---|---|
| 01 | Campagne | nom, société, dates, statut (existant) |
| 02 | Marque & thème | logo, accent, police (5 presets avec aperçu), couleurs panneau / boutons / HUD / overlay + opacité |
| 03 | Accueil & formulaire | titre, sous-titre, bouton, info · tableau des 4 champs fixes (visible / obligatoire / libellé, email verrouillé) · champs libres (ajout, libellé, type, options, obligatoire, ordre, suppression) |
| 04 | Personnage | image, taille, position X/Y, rotation au saut, zone de collision |
| 05 | Décors & paliers | 1–4 paliers : fond, score de déclenchement, vitesse, gravité (verrouillés sauf preset Personnalisé) ; ajouter / retirer un palier |
| 06 | Obstacles | style Dégradé / Images · couleurs, bordure, coins · images haut / bas · largeur |
| 07 | Gameplay | preset · force de saut, écart, fréquence (verrouillés sauf Personnalisé) · compte à rebours : durée + textes |
| 08 | Fin de partie & classement | textes game over, boutons, HUD · classement : titre, légende, places, format des noms, rang du joueur, texte vide, CTA |
| 09 | Règles | parties par email, règlement, confidentialité, consentement marketing (existant) |
| 10 | Email | existant |
| — | Participants | existant + colonnes des champs libres |

Comportements :
- Un bouton **Enregistrer** global. `values()` assemble campagne + `flappy` ; `normalizeFlappy`
  côté client avant l'envoi ; en cas d'erreur, badge rouge sur la section et message sous
  le champ (`error.path`).
- **Réinitialiser cette section** (lien par section, confirmation) remet les defaults.
- **Dupliquer** copie `flappy` intégralement (existant).
- Uploads : `upload-box` existante, mêmes formats (PNG/JPG/WebP, 3 Mo).
- Aperçu : barre Accueil / Compte à rebours / Game over / Classement + « Ouvrir en grand ».

## 6. API et données

### 6.1 `api/game.js`

- `GET config` : jeu migré + normalisé, filtré par `publicGame`.
- `GET origins` : `{ adminOrigin }` (voir 4.3).
- `POST register` : validation selon `flappy.form` — champs fixes requis si
  `visible && required`, ignorés si masqués (stockés `''`) ; email toujours requis ;
  champs libres typés (`text` ≤ 200, `select` ∈ options, `checkbox` booléen), requis si
  `required`, champs inconnus rejetés (400). Stockage dans `participant.extra`. Messages
  d'erreur nommant le champ (« Le champ Magasin est obligatoire. »).
- `GET leaderboard` : `places` entrées ; `displayName` calculé à la lecture depuis
  `firstName`/`lastName` stockés dans `studio/leaderboards/{id}/{pid}` selon `nameFormat`
  (`firstInitial` = « Camille T. », `first` = « Camille », `full` = « Camille Test »).
  Les entrées existantes sans `firstName` utilisent leur `displayName` figé. Avec un token
  de session valide et `showOwnRank`, renvoie `me: { rank, total }`.
- `POST finish` : écrit `firstName`, `lastName`, `highScore` dans le leaderboard (plus de
  `displayName` figé pour les nouvelles entrées).

### 6.2 `api/admin.js`

- `games`, `save`, `duplicate` : `migrate` + `normalizeGame` via `GAME_TYPES`.
- `participants` : projection étendue avec `extra`.

### 6.3 Partagé

- `participantCsv(players, game)` : une colonne par champ libre (en-tête = `label`) après
  « Téléphone » ; `checkbox` → Oui/Non.
- `.env.example` : `PUBLIC_ADMIN_ORIGIN=` (facultatif).
- Règles Firebase / Storage / `vercel.json` : inchangés.

## 7. Tests

- `tests/flappy-config.test.mjs` : defaults, bornes, tri des paliers, presets, `customFields`,
  `migrateLegacyGame` sur des fixtures au format actuel, `renderText`.
- `tests/studio.test.mjs` (étendu) : `register` avec champs masqués / facultatifs / libres
  valides et invalides, champ inconnu rejeté, CSV avec colonnes libres, `leaderboard`
  (`places`, `nameFormat`, `showOwnRank`, entrées anciennes), `config` migré, `origins`.
- `tests/engine.test.mjs` : moteur sans DOM réel (fabrique injectée) — gravité/vitesse du
  palier courant, changement de palier au bon score, saut, collision avec `hitboxScale`,
  `spawnEvery`.
- `tests/browser.cjs` : inchangé fonctionnellement (non-régression du jeu Crousty), adapté
  aux sélecteurs du formulaire généré.
- `tests/studio-browser.cjs` (étendu) : création avec un champ libre `select`, aperçu iframe
  recevant une config et affichant le titre modifié, raccourci « Classement », jeu public
  jouable avec le champ libre, export CSV contenant sa colonne.

## 8. Fichiers touchés

Nouveaux : `shared/flappy-config.mjs`, `shared/game-types.mjs`, `game/flappy/{theme,engine,
screens,preview}.mjs`, `legacy-crousty.mjs`, `tests/flappy-config.test.mjs`,
`tests/engine.test.mjs`.
Modifiés : `main.js`, `managed-game.mjs`, `index.html`, `style.css`, `shared/game-config.mjs`,
`api/game.js`, `api/admin.js`, `admin/index.html`, `admin/studio.js`, `admin/studio.css`,
`scripts/build.cjs` (copie `game/`), `tests/*`, `.env.example`, `ADMIN_SETUP.md`.
