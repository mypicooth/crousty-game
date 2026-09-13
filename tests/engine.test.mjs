import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, spawnInterval, stageIndex } from '../game/flappy/engine.mjs';
import { normalizeFlappy } from '../shared/flappy-config.mjs';

function fakeWorld({ width = 400, height = 800, pinned = false, random = 0.5 } = {}) {
  let birdTop = 320, rotation = 0; const size = 60; const pipes = [];
  const world = {
    birdRect: () => ({ top: birdTop, left: 72, width: size, height: size, right: 72 + size, bottom: birdTop + size }),
    setBirdTop: px => { if (!pinned) birdTop = px; },
    setBirdRotation: deg => { rotation = deg; },
    floor: () => height, random: () => random,
    createPipe(kind, topVh, scoring = false) {
      const pipe = { kind, scoring, left: width, top: topVh * height / 100, removed: false,
        rect() { return { left: this.left, right: this.left + 60, top: this.top, bottom: this.top + height * 0.7, width: 60, height: height * 0.7 }; },
        setLeft(px) { this.left = px; }, remove() { this.removed = true; } };
      pipes.push(pipe); return pipe;
    },
    clearPipes() { pipes.length = 0; }
  };
  return { world, pipes, get birdTop() { return birdTop; }, set birdTop(v) { birdTop = v; }, get rotation() { return rotation; } };
}
const config = overrides => normalizeFlappy({ physics: { preset: 'custom', ...overrides?.physics }, ...overrides });

test('pure helpers reproduce the original spawn cadence and stage lookup', () => {
  assert.equal(spawnInterval(100, 5), 100); assert.equal(spawnInterval(100, 15), 40); assert.equal(spawnInterval(40, 25), 20);
  const stages = normalizeFlappy().stages;
  assert.equal(stageIndex(stages, 0), 0); assert.equal(stageIndex(stages, 19), 0); assert.equal(stageIndex(stages, 20), 1); assert.equal(stageIndex(stages, 61), 3);
});

test('gravity, jump and rotation follow the configured physics', () => {
  const w = fakeWorld(); const engine = createEngine(config(), w.world, {});
  engine.step(); assert.equal(w.birdTop, 320.65); assert.ok(w.rotation > 0);
  engine.jump(); engine.step(); assert.equal(Math.round(w.birdTop * 100) / 100, 308.7); assert.equal(w.rotation, -25);
  const still = fakeWorld(); createEngine(config({ character: { rotateOnJump: false } }), still.world, {}).step(); assert.equal(still.rotation, 0);
});

test('hitting the floor or ceiling ends the run once', () => {
  const w = fakeWorld(); let ended = 0; const engine = createEngine(config(), w.world, { onEnd: () => ended++ });
  w.birdTop = 739.5; assert.equal(engine.step(), false); assert.equal(engine.running, false); assert.equal(ended, 1);
  assert.equal(engine.step(), false); assert.equal(ended, 1);
});

test('pipes spawn on cadence, move at the stage speed and score when passed', () => {
  const w = fakeWorld({ pinned: true }); const scores = []; const stagesSeen = [];
  const engine = createEngine(config({ physics: { spawnEvery: 40 }, stages: [{ minScore: 0, speed: 5, gravity: 0.65 }, { minScore: 2, speed: 7, gravity: 0.75 }] }), w.world, { onScore: s => scores.push(s), onStage: i => stagesSeen.push(i) });
  assert.deepEqual(stagesSeen, [0]);
  for (let i = 0; i < 42; i++) engine.step(); // le spawn a lieu quand ticks > intervalle, soit au 42e pas
  assert.equal(w.pipes.length, 2); assert.equal(w.pipes[0].scoring, false); assert.equal(w.pipes[1].scoring, true);
  const before = w.pipes[0].left; engine.step(); assert.equal(before - w.pipes[0].left, 5);
  for (let i = 0; i < 400 && scores.length < 2; i++) engine.step();
  assert.deepEqual(scores, [1, 2]); assert.deepEqual(stagesSeen, [0, 1]); assert.equal(engine.stage, 1);
  const live = w.pipes.find(p => !p.removed); const x = live.left; engine.step(); assert.equal(x - live.left, 7);
  assert.ok(w.pipes.some(p => p.removed), 'off-screen pipes are removed');
});

test('hitbox scale decides collisions', () => {
  const run = hitboxScale => {
    const w = fakeWorld({ pinned: true, random: 0.134 }); let ended = false;
    const engine = createEngine(config({ physics: { spawnEvery: 40 }, character: { hitboxScale } }), w.world, { onEnd: () => { ended = true; } });
    for (let i = 0; i < 150 && engine.running; i++) engine.step();
    return { ended, score: engine.score };
  };
  assert.deepEqual(run(100), { ended: true, score: 0 });
  assert.deepEqual(run(80), { ended: false, score: 1 });
});
