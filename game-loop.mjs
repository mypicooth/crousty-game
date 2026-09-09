// Keep the original 60 Hz physics, regardless of the display refresh rate.
export const STEP_MS = 1000 / 60;

export function startFixedStepLoop(update, {
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  isPaused = () => document.hidden
} = {}) {
  let previousTime = null;
  let accumulatedTime = 0;
  let stopped = false;
  let frame;

  function resetClock() {
    previousTime = null;
    accumulatedTime = 0;
  }

  function stop() {
    stopped = true;
    cancelFrame(frame);
  }

  function tick(time) {
    if (stopped) return;
    if (isPaused()) {
      resetClock();
    } else if (previousTime === null) {
      previousTime = time;
    } else {
      // Bound catch-up after a stall so the player does not teleport.
      accumulatedTime += Math.min(Math.max(time - previousTime, 0), 100);
      previousTime = time;
      while (accumulatedTime + 1e-7 >= STEP_MS && !stopped) {
        accumulatedTime -= STEP_MS;
        if (update() === false) stop();
      }
    }
    if (!stopped) frame = requestFrame(tick);
  }

  frame = requestFrame(tick);
  return { stop, resetClock };
}
