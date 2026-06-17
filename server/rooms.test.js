// Tests for the pure room registry. Run with `node rooms.test.js` (uses the
// built-in node:test runner, no dependencies).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry } = require('./rooms');

// Fake connections are just unique objects; `send` records what they receive.
function makeConn() {
  return { inbox: [] };
}
function send(conn, msg) {
  conn.inbox.push(msg);
}

test('first joiner becomes host, second does not', () => {
  const reg = createRegistry();
  const a = makeConn();
  const b = makeConn();

  const ra = reg.join('ROOM1', a, { clientId: 'a', name: 'Alice' });
  assert.equal(ra.isHost, true);
  assert.equal(ra.participants.length, 1);

  const rb = reg.join('ROOM1', b, { clientId: 'b', name: 'Bob' });
  assert.equal(rb.isHost, false);
  assert.equal(rb.participants.length, 2);
});

test('relay reaches others but not the sender', () => {
  const reg = createRegistry();
  const a = makeConn();
  const b = makeConn();
  const c = makeConn();
  reg.join('R', a, { clientId: 'a', name: 'A' });
  reg.join('R', b, { clientId: 'b', name: 'B' });
  reg.join('R', c, { clientId: 'c', name: 'C' });

  const { room } = reg.roomOf(a);
  const msg = { type: 'playback', action: 'play', time: 5, rate: 1, ts: 1 };
  reg.relay(room, a, msg, send);

  assert.equal(a.inbox.length, 0, 'sender should not receive its own message');
  assert.deepEqual(b.inbox[0], msg);
  assert.deepEqual(c.inbox[0], msg);
});

test('late joiner gets cached video + snapshot', () => {
  const reg = createRegistry();
  const a = makeConn();
  reg.join('R', a, { clientId: 'a', name: 'A' });
  const { room } = reg.roomOf(a);

  reg.cache(room, { type: 'video', videoId: 'abc123' });
  reg.cache(room, { type: 'heartbeat', time: 42, paused: false, rate: 1.5, ts: 1000 });

  const b = makeConn();
  const rb = reg.join('R', b, { clientId: 'b', name: 'B' });
  assert.equal(rb.state.videoId, 'abc123');
  assert.deepEqual(rb.state.snapshot, { time: 42, paused: false, rate: 1.5, ts: 1000 });
});

test('playback action also updates the snapshot (paused derived)', () => {
  const reg = createRegistry();
  const a = makeConn();
  reg.join('R', a, { clientId: 'a', name: 'A' });
  const { room } = reg.roomOf(a);

  reg.cache(room, { type: 'playback', action: 'pause', time: 10, rate: 1, ts: 5 });
  assert.deepEqual(room.lastSnapshot, { time: 10, paused: true, rate: 1, ts: 5 });
});

test('host leaving reassigns host to the next client', () => {
  const reg = createRegistry();
  const a = makeConn();
  const b = makeConn();
  reg.join('R', a, { clientId: 'a', name: 'A' });
  reg.join('R', b, { clientId: 'b', name: 'B' });

  const res = reg.leave(a);
  assert.equal(res.hostChanged, true);
  assert.equal(res.room.hostId, 'b');
  assert.equal(reg.roster(res.room)[0].isHost, true);
});

test('last client leaving deletes the room', () => {
  const reg = createRegistry();
  const a = makeConn();
  reg.join('SOLO', a, { clientId: 'a', name: 'A' });
  assert.equal(reg.roomCount(), 1);

  const res = reg.leave(a);
  assert.equal(res.room, null);
  assert.equal(reg.roomCount(), 0);
});

test('roomOf returns null for an unknown connection', () => {
  const reg = createRegistry();
  assert.equal(reg.roomOf(makeConn()), null);
});
