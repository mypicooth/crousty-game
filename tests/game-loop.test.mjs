import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixedStepLoop } from '../game-loop.mjs';

function clock(update) {
  let nextId = 0;
  const frames = new Map();
  let paused = false;
  const loop = startFixedStepLoop(update, {
    requestFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelFrame(id) { frames.delete(id); },
    isPaused: () => paused
  });
  return {
    loop,
    pause(value) { paused = value; loop.resetClock(); },
    tick(time) {
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach(callback => callback(time));
    },
    pending: () => frames.size
  };
}

test('equal elapsed time produces identical physics at 30, 60, 90, 120 and 144 Hz', () => {
  const results = [30, 60, 90, 120, 144].map(hz => {
    let steps = 0;
    let birdY = 300;
    let velocity = 0;
    let pipeX = 3000;
    const simulation = clock(() => {
      if (steps % 24 === 0) velocity = -12.6;
      velocity += 0.65;
      birdY += velocity;
      pipeX -= 5;
      steps++;
    });
    for (let i = 0; i <= hz * 10; i++) simulation.tick(i * 1000 / hz);
    simulation.loop.stop();
    return { steps, birdY, pipeX };
  });
  assert.equal(results[0].steps, 600);
  results.forEach(result => assert.deepEqual(result, results[0]));
});

test('three seconds of simulation take three seconds at every refresh rate', () => {
  for (const hz of [30, 60, 120, 144]) {
    let steps = 0;
    const simulation = clock(() => ++steps < 180);
    for (let i = 0; i < hz * 3; i++) simulation.tick(i * 1000 / hz);
    assert.ok(steps < 180);
    simulation.tick(3000);
    assert.equal(steps, 180);
    assert.equal(simulation.pending(), 0);
  }
});

test('hidden tabs pause without catching up and long stalls are bounded', () => {
  let steps = 0;
  const simulation = clock(() => { steps++; });
  simulation.tick(0);
  simulation.tick(100);
  assert.equal(steps, 6);
  simulation.pause(true);
  simulation.tick(10000);
  assert.equal(steps, 6);
  simulation.pause(false);
  simulation.tick(20000);
  assert.equal(steps, 6);
  simulation.tick(20100);
  assert.equal(steps, 12);
  simulation.tick(30000);
  assert.equal(steps, 18);
  simulation.loop.stop();
  simulation.tick(40000);
  assert.equal(steps, 18);
  assert.equal(simulation.pending(), 0);
});
