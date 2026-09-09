import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  query,
  orderByChild
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

  const playerPrivateRef = ref(
    db,
    `campaigns/${CAMPAIGN_ID}/players_private/${playerId}`
  );

  const leaderboardRef = ref(
    db,
    `campaigns/${CAMPAIGN_ID}/leaderboard/${playerId}`
  );

  await set(playerPrivateRef, {
    firstName,
    lastName,
    email,
    phone,
    consentMarketing,
    consentGame: true,
    createdAt: Date.now(),
    gamesPlayed: 0
  });

  await set(leaderboardRef, {
    displayName:
      firstName + " " + lastName.charAt(0).toUpperCase() + ".",
    highScore: 0
  });
}

// -------------------------
// ENREGISTREMENT SCORE
// -------------------------

async function endGame(score) {

  const numericScore = Number(score);

  const playerPrivateRef = ref(
    db,
    `campaigns/${CAMPAIGN_ID}/players_private/${playerId}`
  );

  const leaderboardRef = ref(
    db,
    `campaigns/${CAMPAIGN_ID}/leaderboard/${playerId}`
  );

  const scoreSnapshot = await get(leaderboardRef);

  let previousHighScore = 0;

  if (scoreSnapshot.exists()) {
    previousHighScore =
      Number(scoreSnapshot.val().highScore || 0);
  }

  const newHighScore =
    Math.max(previousHighScore, numericScore);

  await update(leaderboardRef, {
    highScore: newHighScore
  });

  await update(playerPrivateRef, {
    gamesPlayed: gamesPlayed,
    lastPlayedAt: Date.now()
  });
}

// -------------------------
// AFFICHAGE LEADERBOARD
// -------------------------

async function showLeaderboard() {

  const leaderboardRootRef = ref(
    db,
    `campaigns/${CAMPAIGN_ID}/leaderboard`
  );

  const leaderboardQuery =
    query(
      leaderboardRootRef,
      orderByChild('highScore')
    );

  const snapshot = await get(leaderboardQuery);

  const rankingList =
    document.querySelector('.ranking');

  rankingList.innerHTML = '';

  if (!snapshot.exists()) {
    return;
  }

  const data = snapshot.val();

  const sortedPlayers =
    Object.values(data).sort(
      (a, b) =>
        Number(b.highScore) -
        Number(a.highScore)
    );

  sortedPlayers
    .slice(0, 10)
    .forEach((player, index) => {

      const li =
        document.createElement('li');

      li.textContent =
        `${index + 1}. ${player.displayName} — ${player.highScore} pts`;

      rankingList.appendChild(li);
    });
}

// -------------------------
// FORMULAIRE + DEMARRAGE
// -------------------------

async function handleLoginAndStartGame() {

  if (game_state === 'ShowRanking') {
    location.reload();
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

      await savePlayerData();
    }

    if (gamesPlayed >= MAX_GAMES) {

      await showLeaderboard();

      message.innerHTML = '';

      message2.innerHTML =
        `TES ${MAX_GAMES} PARTIES SONT TERMINÉES`;

      score_title.innerHTML =
        '🏆 TOP 10 CROUSTY';

      score_val.innerHTML = '';

      game_state = 'ShowRanking';

      return;
    }

    gamesPlayed++;

    const playerPrivateRef = ref(
      db,
      `campaigns/${CAMPAIGN_ID}/players_private/${playerId}`
    );

    await update(playerPrivateRef, {
      gamesPlayed: gamesPlayed
    });

    document
      .querySelectorAll('.pipe_sprite')
      .forEach(
        e => e.remove()
      );

    bird.style.top = '40vh';

    move_speed = 5;
    gravity = 0.65;

    game_state = 'Play';

    message.innerHTML = '';

    message2.innerHTML = '';

    score_title.innerHTML =
      `PARTIE ${gamesPlayed}/${MAX_GAMES}`;

    score_val.innerHTML = '0';

    document
      .querySelector('.background')
      .style.backgroundImage =
        "url('/img/background.jpg')";

    play();
  }
}

// -------------------------
// BOUTON JOUER
// -------------------------

const loginButton =
  document.getElementById('loginBtn');

loginButton.addEventListener(
  'click',
  async () => {
    await handleLoginAndStartGame();
  }
);

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
      await handleLoginAndStartGame();
    }
  }
);

// -------------------------
// JEU
// -------------------------

function play() {

  let bird_dy = 0;
  let pipe_seperation = 0;
  const pipe_gap = 31;

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
    keyJump
  );

  document.addEventListener(
    'touchend',
    touchJump
  );

  document.addEventListener(
    'pointerdown',
    touchJump
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

            game_state = 'End';

            message2.innerHTML =
              `GAME OVER<br>Score : ${score_val.innerHTML}<br>`;

            endGame(
              score_val.innerHTML
            );

            setTimeout(() => {

              message2.innerHTML +=
                gamesPlayed < MAX_GAMES
                  ? 'APPUIE SUR ENTRÉE OU JOUER POUR REJOUER'
                  : 'APPUIE SUR ENTRÉE POUR VOIR LE CLASSEMENT';

            }, 300);

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

    requestAnimationFrame(move);
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

      game_state = 'End';

      message2.innerHTML =
        `GAME OVER<br>Score : ${score_val.innerHTML}<br>`;

      endGame(
        score_val.innerHTML
      );

      return;
    }

    requestAnimationFrame(
      applyGravity
    );
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

    requestAnimationFrame(
      createPipe
    );
  }

  requestAnimationFrame(move);
  requestAnimationFrame(applyGravity);
  requestAnimationFrame(createPipe);
}
