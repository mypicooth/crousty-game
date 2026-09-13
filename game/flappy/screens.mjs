import { renderText, validateRegistration, stageBackground } from '../../shared/flappy-config.mjs';
import { getPath } from '../../shared/validate.mjs';
import { applyTheme, readForm, setBackground } from './theme.mjs';
import { createEngine, domWorld } from './engine.mjs';
import { startFixedStepLoop } from '../../game-loop.mjs';

export function createFlappyGame({ campaign, backend, doc = document }) {
  const $ = id => doc.getElementById(id);
  const el = {
    bird: doc.querySelector('.bird'), message: $('welcomeScreen'), message2: doc.querySelector('.message2'),
    score: doc.querySelector('.score'), scoreTitle: doc.querySelector('.score_title'), scoreValue: doc.querySelector('.score_val'),
    login: $('loginBtn'), replay: $('replayBtn'), countdown: $('countdown'), countdownValue: $('countdownValue'),
    ranking: $('rankingScreen'), rankingTitle: $('rankingTitle'), rankingList: doc.querySelector('.ranking'), rankingStatus: $('rankingStatus'),
    rankingRetry: $('rankingRetry'), bestScore: $('bestScore'), ownRank: $('ownRank')
  };
  const world = domWorld(doc);
  let state = 'Start', registered = false, gamesPlayed = 0, bestScore = 0, playerName = '';
  let actionPending = false, scoreSave = Promise.resolve(), scoreSaved = true;
  let engine = null, loop = null, controls = null;

  const vars = (extra = {}) => ({ jeu: campaign.name, société: campaign.company, parties: campaign.maxGames, total: campaign.maxGames, places: campaign.flappy.leaderboard.places, score: bestScore, prenom: playerName, n: gamesPlayed, ...extra });
  const t = (path, extra) => renderText(getPath(campaign.flappy.screens, path), vars(extra));
  const limitReached = () => !backend.unlimited && gamesPlayed >= campaign.maxGames;

  function update(next) { campaign = next; applyTheme(campaign, vars(), doc); }
  update(campaign);

  function stopRun() { controls?.abort(); loop?.stop(); controls = null; loop = null; engine = null; }

  async function endGame(score) {
    bestScore = Math.max(bestScore, Number(score));
    const result = await backend.finish(Number(score));
    bestScore = result.highScore; scoreSaved = true;
  }
  async function ensureScoreSaved() { await scoreSave; if (!scoreSaved) await endGame(bestScore); }

  async function showLeaderboard() {
    const { players = [], me } = await backend.leaderboard();
    el.rankingList.replaceChildren();
    for (const [index, player] of players.entries()) {
      const li = doc.createElement('li'); li.textContent = `${index + 1}. ${player.displayName} — ${Number(player.highScore)} pts`; el.rankingList.append(li);
    }
    el.rankingStatus.textContent = players.length ? '' : t('ranking.empty');
    const show = !!me && campaign.flappy.leaderboard.showOwnRank;
    el.ownRank.hidden = !show; if (show) el.ownRank.textContent = `Ta place : ${me.rank} sur ${me.total}`;
  }
  async function displayFinalRanking() {
    state = 'ShowRanking'; stopRun();
    world.clearPipes(); el.bird.hidden = true; el.message.hidden = true; el.message2.textContent = ''; el.replay.style.display = 'none'; el.countdown.hidden = true;
    el.score.hidden = true; el.ranking.hidden = false; el.ownRank.hidden = true;
    el.bestScore.textContent = t('ranking.bestScore', { score: bestScore });
    el.rankingTitle.focus(); el.rankingRetry.hidden = true; el.rankingStatus.textContent = 'Enregistrement du score…';
    try {
      await ensureScoreSaved(); el.rankingStatus.textContent = 'Chargement du classement…'; await showLeaderboard();
    } catch (error) {
      console.error('Classement indisponible', error);
      el.rankingStatus.textContent = scoreSaved ? 'Impossible de charger le classement. Vérifie ta connexion puis réessaie.' : 'Ton score n’a pas encore pu être enregistré. Vérifie ta connexion puis réessaie.';
      el.rankingRetry.hidden = false;
    }
  }

  function finishGame() {
    if (state !== 'Play') return;
    state = 'End'; stopRun();
    const score = Number(el.scoreValue.textContent) || 0;
    el.message2.replaceChildren(t('gameOver.title'), doc.createElement('br'), t('gameOver.scoreLabel', { score }));
    // gamesPlayed inclut déjà la partie qui vient de se terminer.
    el.replay.textContent = limitReached() ? t('gameOver.seeRanking') : t('gameOver.replay');
    el.replay.style.display = 'block';
    scoreSaved = false;
    scoreSave = endGame(score).catch(error => console.error('Impossible de sauvegarder le score', error));
  }
  function play() {
    controls = new AbortController();
    engine = createEngine(campaign.flappy, world, {
      onScore: score => { el.scoreValue.textContent = String(score); new Audio('/sound/Coin.mp3').play().catch(() => {}); },
      onStage: index => setBackground(doc, stageBackground(campaign.flappy.stages, index)),
      onEnd: finishGame
    });
    loop = startFixedStepLoop(() => engine.step() && state === 'Play');
    doc.addEventListener('visibilitychange', loop.resetClock, { signal: controls.signal });
    doc.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); engine?.jump(); } }, { signal: controls.signal });
    doc.addEventListener('pointerdown', e => { if (!['input', 'button', 'label', 'select', 'option', 'textarea', 'a'].includes(e.target.tagName.toLowerCase())) engine?.jump(); }, { signal: controls.signal });
  }
  function startCountdown() {
    const seconds = campaign.countdownSeconds || 3;
    el.countdownValue.textContent = String(seconds); el.countdown.hidden = false;
    let ticks = 0; controls = new AbortController();
    loop = startFixedStepLoop(() => {
      ticks++;
      if (ticks >= seconds * 60) { stopRun(); el.countdown.hidden = true; state = 'Play'; play(); return false; }
      const remaining = String(seconds - Math.floor(ticks / 60));
      if (el.countdownValue.textContent !== remaining) el.countdownValue.textContent = remaining;
      return true;
    });
    doc.addEventListener('visibilitychange', loop.resetClock, { signal: controls.signal });
  }

  async function handleLoginAndStartGame() {
    if (state === 'ShowRanking') { await displayFinalRanking(); return; }
    if (state === 'Play' || state === 'Countdown') return;
    if (!registered) {
      let player;
      try { player = validateRegistration(campaign.flappy.form, readForm(doc)); } catch (error) { alert(error.message); return; }
      if (!$('consentGame').checked) { alert('Vous devez accepter le règlement du jeu pour participer.'); return; }
      const result = await backend.register({ ...player, consentGame: true, consentMarketing: $('consentMarketing').checked });
      registered = true; playerName = player.firstName; gamesPlayed = result.gamesPlayed; bestScore = result.highScore;
    }
    if (limitReached()) { await displayFinalRanking(); return; }
    await ensureScoreSaved();
    const started = await backend.start(); gamesPlayed = started.gamesPlayed; bestScore = started.highScore;
    world.clearPipes(); el.bird.style.top = ''; el.bird.style.transform = ''; el.bird.hidden = false;
    state = 'Countdown'; el.message.hidden = true; el.replay.style.display = 'none'; el.message2.textContent = '';
    el.scoreTitle.textContent = t('hud.roundLabel', { n: gamesPlayed, total: campaign.maxGames }); el.scoreValue.textContent = '0'; el.score.hidden = false;
    setBackground(doc, stageBackground(campaign.flappy.stages, 0));
    startCountdown();
  }
  async function requestStart() {
    if (actionPending || state === 'Play' || state === 'Countdown') return;
    actionPending = true; el.login.disabled = true; el.replay.disabled = true; el.rankingRetry.disabled = true;
    try { await handleLoginAndStartGame(); }
    catch (error) { console.error(error); alert(error.message || 'Connexion impossible. Réessaie dans un instant.'); }
    finally { actionPending = false; el.login.disabled = false; el.replay.disabled = false; el.rankingRetry.disabled = false; }
  }
  el.login.addEventListener('click', requestStart);
  el.replay.addEventListener('click', requestStart);
  el.rankingRetry.addEventListener('click', requestStart);
  doc.addEventListener('keydown', async e => { if (e.key === 'Enter' && state !== 'Play') { e.preventDefault(); if (!e.repeat) await requestStart(); } });

  function resetToWelcome() {
    stopRun(); state = 'Start'; world.clearPipes();
    el.bird.hidden = false; el.bird.style.top = ''; el.bird.style.transform = '';
    el.message.hidden = false; el.message2.textContent = ''; el.replay.style.display = 'none';
    el.score.hidden = false; el.scoreTitle.textContent = ''; el.scoreValue.textContent = '';
    el.ranking.hidden = true; el.countdown.hidden = true;
    setBackground(doc, stageBackground(campaign.flappy.stages, 0));
  }
  function goto(screen) {
    if (screen === 'welcome') return resetToWelcome();
    if (screen === 'countdown') { resetToWelcome(); el.message.hidden = true; el.countdown.hidden = false; el.countdownValue.textContent = String(campaign.countdownSeconds); return; }
    if (screen === 'gameOver') {
      resetToWelcome(); el.message.hidden = true; state = 'End';
      el.scoreTitle.textContent = t('hud.roundLabel', { n: 1, total: campaign.maxGames }); el.scoreValue.textContent = '12';
      el.message2.replaceChildren(t('gameOver.title'), doc.createElement('br'), t('gameOver.scoreLabel', { score: 12 }));
      el.replay.textContent = t('gameOver.replay'); el.replay.style.display = 'block'; return;
    }
    if (screen === 'ranking') { bestScore = bestScore || 12; scoreSaved = true; displayFinalRanking(); }
  }
  return { update, goto };
}
