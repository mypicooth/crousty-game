import test from 'node:test';
import assert from 'node:assert/strict';
import { cssVariables, hexToRgba } from '../game/flappy/theme.mjs';
import { normalizeFlappy } from '../shared/flappy-config.mjs';

test('css variables reflect the flappy config', () => {
  assert.equal(hexToRgba('#000000', 0.78), 'rgba(0, 0, 0, 0.78)');
  assert.equal(hexToRgba('#ffdc65', 1), 'rgba(255, 220, 101, 1)');
  const vars = cssVariables(normalizeFlappy());
  assert.equal(vars['--fb-accent'], '#ffdc65'); assert.equal(vars['--fb-overlay'], 'rgba(0, 0, 0, 0.78)');
  assert.equal(vars['--fb-font'], 'Arial, Helvetica, sans-serif'); assert.equal(vars['--fb-bird-size'], '64px');
  assert.equal(vars['--fb-bird-x'], '18vw'); assert.equal(vars['--fb-pipe-width'], '15vw'); assert.equal(vars['--fb-pipe-top'], 'none');
  const image = cssVariables(normalizeFlappy({ obstacles: { style: 'image', topUrl: 'https://a.example/t.png' } }));
  assert.equal(image['--fb-pipe-top'], 'url("https://a.example/t.png")'); assert.equal(image['--fb-pipe-bottom'], 'url("https://a.example/t.png")');
});
