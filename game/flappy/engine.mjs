// Physique du Flappy Bird, sans DOM : `world` fournit les mesures et les mutations.
export function spawnInterval(spawnEvery, speed) { return Math.max(20, spawnEvery - (speed - 5) * 6); }
export function stageIndex(stages, score) {
  let index = 0;
  for (let i = 0; i < stages.length; i++) if (score >= stages[i].minScore) index = i;
  return index;
}
export function createEngine({ physics, stages, character }, world, hooks = {}) {
  let velocity = 0, score = 0, ticks = 0, stage = 0, running = true;
  let speed = stages[0].speed, gravity = stages[0].gravity;
  const pipes = [];
  hooks.onStage?.(0);
  const shrink = (character.hitboxScale ?? 100) / 100;
  function hitbox(rect) {
    const dx = rect.width * (1 - shrink) / 2, dy = rect.height * (1 - shrink) / 2;
    return { left: rect.left + dx, right: rect.right - dx, top: rect.top + dy, bottom: rect.bottom - dy };
  }
  function end() { if (!running) return; running = false; hooks.onEnd?.(score); }
  function jump() { if (running) velocity = -physics.jumpForce; }
  function step() {
    if (!running) return false;
    const raw = world.birdRect(); const bird = hitbox(raw);
    for (const pipe of [...pipes]) {
      const rect = pipe.rect();
      if (rect.right <= 0) { pipe.remove(); pipes.splice(pipes.indexOf(pipe), 1); continue; }
      if (bird.left < rect.right && bird.right > rect.left && bird.top < rect.bottom && bird.bottom > rect.top) { end(); return false; }
      if (pipe.scoring && rect.right < raw.left && rect.right + speed >= raw.left) {
        score++; hooks.onScore?.(score);
        const next = stageIndex(stages, score);
        if (next !== stage) { stage = next; speed = stages[stage].speed; gravity = stages[stage].gravity; hooks.onStage?.(stage); }
      }
      pipe.setLeft(rect.left - speed);
    }
    velocity += gravity;
    world.setBirdTop(world.birdRect().top + velocity);
    if (character.rotateOnJump) world.setBirdRotation(Math.max(-25, Math.min(90, velocity * 4)));
    const after = world.birdRect();
    if (after.top <= 0 || after.bottom >= world.floor()) { end(); return false; }
    if (ticks > spawnInterval(physics.spawnEvery, speed)) {
      ticks = 0;
      const position = Math.floor(world.random() * 60) + 8;
      pipes.push(world.createPipe('top', position - 70, false), world.createPipe('bottom', position + physics.gap, true));
    }
    ticks++;
    return true;
  }
  return { step, jump, end, get score() { return score; }, get running() { return running; }, get stage() { return stage; } };
}
export function domWorld(doc = document) {
  const bird = doc.querySelector('.bird'); const background = doc.querySelector('.background');
  return {
    birdRect: () => bird.getBoundingClientRect(),
    setBirdTop: px => { bird.style.top = px + 'px'; },
    setBirdRotation: deg => { bird.style.transform = `rotate(${deg}deg)`; },
    floor: () => background.getBoundingClientRect().bottom,
    random: Math.random,
    createPipe(kind, topVh, scoring = false) {
      const el = doc.createElement('div');
      el.className = `pipe_sprite pipe_sprite_${kind}`; el.style.top = topVh + 'vh'; el.style.left = '100vw';
      doc.body.appendChild(el);
      return { scoring, rect: () => el.getBoundingClientRect(), setLeft: px => { el.style.left = px + 'px'; }, remove: () => el.remove() };
    },
    clearPipes() { doc.querySelectorAll('.pipe_sprite').forEach(e => e.remove()); }
  };
}
