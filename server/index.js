// WebSocket relay server for the YouTube Watch Party extension.
// A "dumb" relay: it keeps room membership, forwards playback/chat/video/
// heartbeat messages to everyone else in the room, and caches enough state
// that late joiners sync immediately. No video data ever flows through here.

'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { createRegistry } = require('./rooms');
const messages = require('../extension/shared/messages');

const PORT = process.env.PORT || 8080;
const { TYPES } = messages;

const registry = createRegistry();

// Lightweight HTTP server so platforms with health checks (Railway/Render)
// get a 200, and we can attach the WS upgrade to it.
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('watch-party relay ok\n');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

function send(conn, msg) {
  if (conn.readyState === conn.OPEN) {
    conn.send(JSON.stringify(msg));
  }
}

function broadcastParticipants(room) {
  if (!room) return;
  const list = registry.roster(room);
  for (const conn of room.clients.keys()) {
    send(conn, { type: TYPES.PARTICIPANTS, list });
  }
}

wss.on('connection', (conn) => {
  conn.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }
    handle(conn, msg);
  });

  conn.on('close', () => {
    const res = registry.leave(conn);
    if (res && res.room) {
      if (res.hostChanged && res.room.hostId) {
        // Tell the new host it is now in charge (drift anchor + privileges).
        for (const [c, info] of res.room.clients) {
          if (info.clientId === res.room.hostId) send(c, { type: TYPES.HOST, isHost: true });
        }
      }
      broadcastParticipants(res.room);
    }
  });

  conn.on('error', () => {/* swallow; close handler does cleanup */});
});

function handle(conn, msg) {
  switch (msg.type) {
    case TYPES.JOIN: {
      const { isHost, participants, state } = registry.join(msg.room, conn, {
        clientId: msg.clientId,
        name: msg.name,
        videoId: msg.videoId,
      });
      send(conn, {
        type: TYPES.JOINED,
        clientId: msg.clientId,
        room: msg.room,
        isHost,
        participants,
        state,
      });
      const found = registry.roomOf(conn);
      if (found) broadcastParticipants(found.room);
      break;
    }

    case TYPES.LEAVE: {
      const res = registry.leave(conn);
      if (res && res.room) {
        if (res.hostChanged && res.room.hostId) {
          for (const [c, info] of res.room.clients) {
            if (info.clientId === res.room.hostId) send(c, { type: TYPES.HOST, isHost: true });
          }
        }
        broadcastParticipants(res.room);
      }
      break;
    }

    case TYPES.PLAYBACK:
    case TYPES.VIDEO:
    case TYPES.CHAT:
    case TYPES.HEARTBEAT: {
      const found = registry.roomOf(conn);
      if (!found) return;
      registry.cache(found.room, msg);
      registry.relay(found.room, conn, msg, send);
      break;
    }

    default:
      // Unknown message types are ignored.
      break;
  }
}

httpServer.listen(PORT, () => {
  console.log(`Watch-party relay listening on :${PORT} (ws + http)`);
});
