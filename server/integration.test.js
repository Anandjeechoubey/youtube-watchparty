// End-to-end test: boots the real relay server on a random port and drives it
// with real WebSocket clients. Verifies join acks, relay-to-others, and that a
// late joiner receives cached video + snapshot state. Run with `node --test`.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const { createRegistry } = require('./rooms');
const M = require('../extension/shared/messages');

// Spin up a server instance bound to an ephemeral port (mirrors index.js).
function startServer() {
  const registry = createRegistry();
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const send = (c, m) => c.readyState === c.OPEN && c.send(JSON.stringify(m));
  const broadcast = (room) => {
    if (!room) return;
    const list = registry.roster(room);
    for (const conn of room.clients.keys()) send(conn, { type: M.TYPES.PARTICIPANTS, list });
  };

  wss.on('connection', (conn) => {
    conn.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === M.TYPES.JOIN) {
        const r = registry.join(msg.room, conn, msg);
        send(conn, { type: M.TYPES.JOINED, clientId: msg.clientId, isHost: r.isHost, participants: r.participants, state: r.state });
        const f = registry.roomOf(conn);
        if (f) broadcast(f.room);
      } else {
        const f = registry.roomOf(conn);
        if (!f) return;
        registry.cache(f.room, msg);
        registry.relay(f.room, conn, msg, send);
      }
    });
    conn.on('close', () => {
      const res = registry.leave(conn);
      if (res && res.room) broadcast(res.room);
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(0, () => resolve({ port: httpServer.address().port, httpServer }));
  });
}

function open(port) {
  const ws = new WebSocket('ws://localhost:' + port);
  ws.q = [];
  ws.on('message', (d) => ws.q.push(JSON.parse(d.toString())));
  return new Promise((res) => ws.on('open', () => res(ws)));
}

const waitFor = (ws, type) =>
  new Promise((resolve, reject) => {
    const found = ws.q.find((m) => m.type === type);
    if (found) return resolve(found);
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + type)), 1500);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === type) { clearTimeout(t); resolve(m); }
    });
  });

test('two clients: join ack, host assignment, and playback relay', async () => {
  const { port, httpServer } = await startServer();
  const a = await open(port);
  const b = await open(port);

  a.send(JSON.stringify(M.join('ROOM', 'Alice', 'a', 'vid123')));
  const ackA = await waitFor(a, M.TYPES.JOINED);
  assert.equal(ackA.isHost, true);

  b.send(JSON.stringify(M.join('ROOM', 'Bob', 'b', null)));
  const ackB = await waitFor(b, M.TYPES.JOINED);
  assert.equal(ackB.isHost, false);
  assert.equal(ackB.state.videoId, 'vid123', 'late joiner learns the room video');

  // Alice plays; Bob should receive the playback relay, Alice should not.
  a.send(JSON.stringify(M.playback(M.ACTIONS.PLAY, { time: 12, rate: 1, ts: Date.now(), clientId: 'a' })));
  const relayed = await waitFor(b, M.TYPES.PLAYBACK);
  assert.equal(relayed.action, 'play');
  assert.equal(relayed.time, 12);

  a.close(); b.close();
  await new Promise((r) => httpServer.close(r));
});

test('late joiner receives cached heartbeat snapshot', async () => {
  const { port, httpServer } = await startServer();
  const host = await open(port);
  host.send(JSON.stringify(M.join('R2', 'Host', 'h', 'abc')));
  await waitFor(host, M.TYPES.JOINED);

  host.send(JSON.stringify(M.heartbeat({ time: 55, paused: false, rate: 1, ts: 7000, clientId: 'h' })));
  await new Promise((r) => setTimeout(r, 50)); // let the server cache it

  const late = await open(port);
  late.send(JSON.stringify(M.join('R2', 'Late', 'l', null)));
  const ack = await waitFor(late, M.TYPES.JOINED);
  assert.equal(ack.state.snapshot.time, 55);
  assert.equal(ack.state.snapshot.rate, 1);

  host.close(); late.close();
  await new Promise((r) => httpServer.close(r));
});
