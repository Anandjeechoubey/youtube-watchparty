// Tests for the pure sync math. Run with `node sync.test.js`.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { targetTime, shouldCorrect, createEchoGuard } = require('./sync');

test('targetTime: paused video stays put regardless of elapsed time', () => {
  const snap = { time: 30, paused: true, rate: 1, ts: 1000 };
  assert.equal(targetTime(snap, 9999), 30);
});

test('targetTime: playing video advances by elapsed * rate', () => {
  const snap = { time: 30, paused: false, rate: 1, ts: 1000 };
  // 2000ms later => +2s
  assert.equal(targetTime(snap, 3000), 32);
});

test('targetTime: respects playback rate', () => {
  const snap = { time: 10, paused: false, rate: 2, ts: 0 };
  // 1000ms later at 2x => +2s
  assert.equal(targetTime(snap, 1000), 12);
});

test('targetTime: returns null for empty snapshot', () => {
  assert.equal(targetTime(null, 1000), null);
  assert.equal(targetTime({ time: null }, 1000), null);
});

test('shouldCorrect: true past threshold, false within', () => {
  assert.equal(shouldCorrect(10, 12, 1.0), true);
  assert.equal(shouldCorrect(10, 10.5, 1.0), false);
  assert.equal(shouldCorrect(10, 11.0, 1.0), false); // exactly at threshold = no
});

test('shouldCorrect: handles nulls safely', () => {
  assert.equal(shouldCorrect(null, 10), false);
  assert.equal(shouldCorrect(10, null), false);
});

test('echo guard: active right after mark, inactive after window', async () => {
  const guard = createEchoGuard(50);
  assert.equal(guard.active(), false);
  guard.mark();
  assert.equal(guard.active(), true);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(guard.active(), false);
});
