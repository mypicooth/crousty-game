import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { startFixedStepLoop } from './game-loop.mjs';

import {
  getDatabase,
  ref,
  get,
  update
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

// -------------------------
// FIREBASE
// -------------------------

const firebaseConfig = {
  apiKey: "AIzaSyAGu61hEih85vRpKUN0zXOrVmOFXR-WQls",
  authDomain: "crousty-game-b9c17.firebaseapp.com",
  databaseURL: "https://crousty-game-b9c17-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "crousty-game-b9c17",
  storageBucket: "crousty-game-b9c17.firebasestorage.app",
  messagingSenderId: "1032243559819",
  appId: "1:1032243559819:web:2d547412cee8932087038e",
  measurementId: "G-J4FZF4MPDE"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// -------------------------
// CONFIG CAMPAGNE
// -------------------------

const CAMPAIGN_ID = "crousty_2026";
const MAX_GAMES = 3;

// -------------------------
// VARIABLES JOUEUR
// -------------------------

let playerId = "";
let firstName = "";
let lastName = "";
let email = "";
let phone = "";
let gamesPlayed = 0;
let bestScore = 0;

// -------------------------
// VARIABLES JEU
// -------------------------

let move_speed = 5;
let gravity = 0.65;

let bird = document.querySelector('.bird');
let bird_props = bird.getBoundingClientRect();

let background = document
  .querySelector('.background')
  .getBoundingClientRect();

let score_val = document.querySelector('.score_val');
let message = document.querySelector('.message');
let message2 = document.querySelector('.message2');
let score_title = document.querySelector('.score_title');

let game_state = 'Start';
const replayButton = document.getElementById('replayBtn');
let actionPending = false;
let scoreSave = Promise.resolve();
let scoreSaved = true;
const rankingScreen = document.getElementById('rankingScreen');
const rankingStatus = document.getElementById('rankingStatus');
const rankingRetry = document.getElementById('rankingRetry');

async function withTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Connexion trop lente')), 12000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// -------------------------
// CREATION ID JOUEUR
// -------------------------

function createPlayerId() {
  return crypto.randomUUID();
}

// -------------------------
// SAUVEGARDE JOUEUR
// -------------------------

async function savePlayerData() {

  const consentMarketing =
    document.getElementById('consentMarketing').checked;

  const campaignPath = `campaigns/${CAMPAIGN_ID}`;
  const timestamp = Date.now();
  await withTimeout(update(ref(db), {
    [`${campaignPath}/players_private/${playerId}`]: {
      firstName, lastName, email, phone, consentMarketing,
      consentGame: true, consentTimestamp: timestamp,
      createdAt: timestamp, gamesPlayed: 0, highScore: 0
    },
    [`${campaignPath}/leaderboard/${playerId}`]: {
      displayName: firstName + ' ' + lastName.charAt(0).toUpperCase() + '.',
      highScore: 0
    }
  }));
}

// -------------------------
// ENREGISTREMENT SCORE
// -------------------------

async function endGame(score) {
  bestScore = Math.max(bestScore, Number(score));
  const campaignPath = `campaigns/${CAMPAIGN_ID}`;
  await withTimeout(update(ref(db), {
    [`${campaignPath}/leaderboard/${playerId}/highScore`]: bestScore,
    [`${campaignPath}/players_private/${playerId}/highScore`]: bestScore,
    [`${campaignPath}/players_private/${playerId}/gamesPlayed`]: gamesPlayed,
    [`${campaignPath}/players_private/${playerId}/lastPlayedAt`]: Date.now()
  }));
  scoreSaved = true;
}

async function ensureScoreSaved() {
  await scoreSave;
  if (!scoreSaved) await endGame(bestScore);
}

async function showLeaderboard() {
  const snapshot = await withTimeout(get(ref(db, `campaigns/${CAMPAIGN_ID}/leaderboard`)));
  const rankingList = document.querySelector('.ranking');
  rankingList.replaceChildren();
  const players = Object.values(snapshot.val() || {})
    .filter(player => player && typeof player.displayName === 'string'
      && Number.isFinite(Number(player.highScore)))
    .sort((a, b) => Number(b.highScore) - Number(a.highScore))
    .slice(0, 10);

  for (const [index, player] of players.entries()) {
    const li = document.createElement('li');
    li.textContent = `${index + 1}. ${player.displayName} — ${Number(player.highScore)} pts`;
    rankingList.appendChild(li);
  }
  rankingStatus.textContent = players.length ? '' : 'Aucun score pour le moment.';
}

async function displayFinalRanking() {
  game_state = 'ShowRanking';
  document.querySelectorAll('.pipe_sprite').forEach(pipe => pipe.remove());
  bird.hidden = true;
  message.hidden = true;
  message2.textContent = '';
  replayButton.style.display = 'none';
  document.querySelector('.score').hidden = true;
  rankingScreen.hidden = false;
  document.getElementById('bestScore').textContent = `Ton meilleur score : ${bestScore} pts`;
  document.getElementById('rankingTitle').focus();
  rankingRetry.hidden = true;
  rankingStatus.textContent = 'Enregistrement du score…';
  try {
    await ensureScoreSaved();
    rankingStatus.textContent = 'Chargement du classement…';
    await showLeaderboard();
  } catch (error) {
    console.error('Classement indisponible', error);
    rankingStatus.textContent = scoreSaved
      ? 'Impossible de charger le classement. Vérifie ta connexion puis réessaie.'
      : 'Ton score n’a pas encore pu être enregistré. Vérifie ta connexion puis réessaie.';
    rankingRetry.hidden = false;
  }
}

// -------------------------
// FORMULAIRE + DEMARRAGE
// -------------------------

async function handleLoginAndStartGame() {

  if (game_state === 'ShowRanking') {
    await displayFinalRanking();
    return;
  }

  if (game_state !== 'Play') {

    if (!playerId) {

      firstName =
        document.getElementById('firstName')
        .value.trim();

      lastName =
        document.getElementById('lastName')
        .value.trim();

      email =
        document.getElementById('email')
        .value.trim();

      phone =
        document.getElementById('phone')
        .value.trim();

      const consentGame =
        document.getElementById('consentGame')
        .checked;

      if (
        !firstName ||
        !lastName ||
        !email ||
        !phone
      ) {
        alert(
          "Merci de remplir tous les champs obligatoires."
        );
        return;
      }

      if (!consentGame) {
        alert(
          "Vous devez accepter le règlement du jeu pour participer."
        );
        return;
      }

      playerId = createPlayerId();

      gamesPlayed = 0;

      try {
        await savePlayerData();
      } catch (error) {
        playerId = '';
        throw error;
      }
    }

    if (gamesPlayed >= MAX_GAMES) {

      await displayFinalRanking();

      return;
    }

    await ensureScoreSaved();

    const playerPrivateRef = ref(
      db,
      `campaigns/${CAMPAIGN_ID}/players_private/${playerId}`
    );

    await withTimeout(update(playerPrivateRef, {
      gamesPlayed: gamesPlayed + 1
    }));
    gamesPlayed++;

    document
      .querySelectorAll('.pipe_sprite')
      .forEach(
        e => e.remove()
      );

    bird.style.top = '40vh';
    bird_props = bird.getBoundingClientRect();
    background = document.querySelector('.background').getBoundingClientRect();

    move_speed = 5;
    gravity = 0.65;

    game_state = 'Countdown';

    message.hidden = true;
    replayButton.style.display = 'none';

    message2.innerHTML = '';

    score_title.innerHTML =
      `PARTIE ${gamesPlayed}/${MAX_GAMES}`;

    score_val.innerHTML = '0';

    document
      .querySelector('.background')
      .style.backgroundImage =
        "url('/img/background.jpg')";

    startCountdown();
  }
}

// -------------------------
// BOUTON JOUER
// -------------------------

const loginButton =
  document.getElementById('loginBtn');

async function requestStart() {
  if (actionPending || game_state === 'Play' || game_state === 'Countdown') return;
  actionPending = true;
  loginButton.disabled = true;
  replayButton.disabled = true;
  rankingRetry.disabled = true;
  try {
    await handleLoginAndStartGame();
  } catch (error) {
    console.error(error);
    alert('Connexion impossible. Réessaie dans un instant.');
  } finally {
    actionPending = false;
    loginButton.disabled = false;
    replayButton.disabled = false;
    rankingRetry.disabled = false;
  }
}

loginButton.addEventListener('click', requestStart);
replayButton.addEventListener('click', requestStart);
rankingRetry.addEventListener('click', requestStart);

// -------------------------
// ENTREE CLAVIER
// -------------------------

document.addEventListener(
  'keydown',
  async (e) => {

    if (
      e.key === 'Enter' &&
      game_state !== 'Play'
    ) {
      e.preventDefault();
      if (!e.repeat) await requestStart();
    }
  }
);

// -------------------------
// JEU
// -------------------------

function startCountdown() {
  const countdown = document.getElementById('countdown');
  const countdownValue = document.getElementById('countdownValue');
  countdownValue.textContent = '3';
  countdown.hidden = false;
  let ticks = 0;
  const controls = new AbortController();
  const loop = startFixedStepLoop(() => {
    ticks++;
    if (ticks >= 180) {
      controls.abort();
      countdown.hidden = true;
      bird_props = bird.getBoundingClientRect();
      background = document.querySelector('.background').getBoundingClientRect();
      game_state = 'Play';
      play();
      return false;
    }
    const remaining = String(3 - Math.floor(ticks / 60));
    if (countdownValue.textContent !== remaining) countdownValue.textContent = remaining;
  });
  document.addEventListener('visibilitychange', loop.resetClock, { signal: controls.signal });
}

function play() {

  let bird_dy = 0;
  let pipe_seperation = 0;
  const pipe_gap = 31;
  const controls = new AbortController();
  const loop = startFixedStepLoop(() => {
    move();
    applyGravity();
    createPipe();
    return game_state === 'Play';
  });
  document.addEventListener('visibilitychange', loop.resetClock, { signal: controls.signal });

  function finishGame() {
    if (game_state !== 'Play') return;
    game_state = 'End';
    controls.abort();
    loop.stop();
    message2.innerHTML = `GAME OVER<br>Score : ${score_val.textContent}`;
    replayButton.textContent = gamesPlayed < MAX_GAMES
      ? 'REJOUER' : 'VOIR LE CLASSEMENT';
    replayButton.style.display = 'block';
    scoreSaved = false;
    scoreSave = endGame(score_val.textContent).catch(error => {
      console.error('Impossible de sauvegarder le score', error);
    });
  }

  // -------------------------
  // SAUT
  // -------------------------

  function jump() {

    if (game_state === 'Play') {
      bird_dy = -12.6;
    }
  }

  // -------------------------
  // CONTROLES
  // -------------------------

  function keyJump(e) {

    if (
      e.key === 'ArrowUp' ||
      e.key === ' '
    ) {
      e.preventDefault();
      jump();
    }
  }

  function touchJump(e) {

    const targetTag =
      e.target.tagName.toLowerCase();

    if (
      [
        'input',
        'button',
        'label',
        'select',
        'textarea'
      ].includes(targetTag)
    ) {
      return;
    }

    jump();
  }

  document.addEventListener(
    'keydown',
    keyJump,
    { signal: controls.signal }
  );

  document.addEventListener(
    'pointerdown',
    touchJump,
    { signal: controls.signal }
  );

  // -------------------------
  // MOUVEMENT PIPES
  // -------------------------

  function move() {

    if (game_state !== 'Play') {
      return;
    }

    const pipeSprites =
      document.querySelectorAll(
        '.pipe_sprite'
      );

    pipeSprites.forEach(
      element => {
        if (game_state !== 'Play') return;

        const pipeProps =
          element.getBoundingClientRect();

        bird_props =
          bird.getBoundingClientRect();

        if (pipeProps.right <= 0) {

          element.remove();

        } else {

          const collision =
            bird_props.left <
              pipeProps.left +
              pipeProps.width &&
            bird_props.left +
              bird_props.width >
              pipeProps.left &&
            bird_props.top <
              pipeProps.top +
              pipeProps.height &&
            bird_props.top +
              bird_props.height >
              pipeProps.top;

          if (collision) {

            finishGame();

            return;
          }

          if (
            pipeProps.right <
              bird_props.left &&
            pipeProps.right +
              move_speed >=
              bird_props.left &&
            element.increase_score === '1'
          ) {

            score_val.innerHTML =
              Number(
                score_val.innerHTML
              ) + 1;

            const audio =
              new Audio(
                '/sound/Coin.mp3'
              );

            audio
              .play()
              .catch(() => {});

            const score =
              Number(
                score_val.innerHTML
              );

            if (score > 20) {

              document
                .querySelector(
                  '.background'
                )
                .style
                .backgroundImage =
                  "url('/img/background2.jpg')";

              move_speed = 7;
              gravity = 0.75;
            }

            if (score > 40) {

              document
                .querySelector(
                  '.background'
                )
                .style
                .backgroundImage =
                  "url('/img/background3.png')";

              move_speed = 10;
              gravity = 0.9;
            }

            if (score > 60) {

              document
                .querySelector(
                  '.background'
                )
                .style
                .backgroundImage =
                  "url('/img/background4.jpg')";

              move_speed = 15;
              gravity = 1.2;
            }
          }

          element.style.left =
            pipeProps.left -
            move_speed +
            'px';
        }
      }
    );

  }

  // -------------------------
  // GRAVITE
  // -------------------------

  function applyGravity() {

    if (game_state !== 'Play') {
      return;
    }

    bird_dy += gravity;

    bird.style.top =
      bird_props.top +
      bird_dy +
      'px';

    bird_props =
      bird.getBoundingClientRect();

    if (
      bird_props.top <= 0 ||
      bird_props.bottom >=
        background.bottom
    ) {

      finishGame();

      return;
    }

  }

  // -------------------------
  // CREATION PIPES
  // -------------------------

  function createPipe() {

    if (game_state !== 'Play') {
      return;
    }

    if (
      pipe_seperation >
      100 -
      (move_speed - 5) * 6
    ) {

      pipe_seperation = 0;

      const pipePosition =
        Math.floor(
          Math.random() * 60
        ) + 8;

      const pipeTop =
        document.createElement(
          'div'
        );

      pipeTop.className =
        'pipe_sprite pipe_sprite_top';

      pipeTop.style.top =
        pipePosition -
        70 +
        'vh';

      pipeTop.style.left =
        '100vw';

      document.body.appendChild(
        pipeTop
      );

      const pipeBottom =
        document.createElement(
          'div'
        );

      pipeBottom.className =
        'pipe_sprite pipe_sprite_bottom';

      pipeBottom.style.top =
        pipePosition +
        pipe_gap +
        'vh';

      pipeBottom.style.left =
        '100vw';

      pipeBottom.increase_score =
        '1';

      document.body.appendChild(
        pipeBottom
      );
    }

    pipe_seperation++;

  }

}
