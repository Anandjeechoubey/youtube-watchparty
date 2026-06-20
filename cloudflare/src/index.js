// PAWP connect relay — Cloudflare Worker + Durable Object edition.
//
// Same wire protocol as the Node relay (server/), but each party room is a
// Durable Object addressed by room code. Uses the WebSocket Hibernation API so
// the DO can be evicted from memory while connections stay open and wake on the
// next message — that's what keeps it always-on with no cold start, on the free
// tier (SQLite-backed Durable Objects).
//
// Difference from the Node relay: the room must be known at connection time
// (to pick the right DO), so clients connect to  wss://host/?room=CODE  . The
// extension appends that automatically; the Node relay simply ignores the query.

const TYPES = {
  JOIN: 'join', LEAVE: 'leave', PLAYBACK: 'playback', VIDEO: 'video',
  CHAT: 'chat', HEARTBEAT: 'heartbeat',
  JOINED: 'joined', PARTICIPANTS: 'participants', HOST: 'host',
};

// ---- Worker entry: route to the room's Durable Object --------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route WebSocket upgrades FIRST — they carry a room and can arrive on any
    // path (the client connects to "/?room=CODE", whose pathname is "/").
    if (request.headers.get('Upgrade') === 'websocket') {
      const room = (url.searchParams.get('room') || 'LOBBY').toUpperCase();
      const id = env.PARTY_ROOM.idFromName(room);
      return env.PARTY_ROOM.get(id).fetch(request);
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response('watch-party relay ok\n', {
        headers: { 'content-type': 'text/plain' },
      });
    }

    return new Response('not found', { status: 404 });
  },
};

// ---- Durable Object: one instance per room -------------------------------

export class PartyRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.meta = null; // { hostId, lastVideoId, lastSnapshot } — persisted in storage
  }

  async loadMeta() {
    if (!this.meta) {
      this.meta = (await this.state.storage.get('meta')) || {
        hostId: null, lastVideoId: null, lastSnapshot: null,
      };
    }
    return this.meta;
  }
  async saveMeta() {
    await this.state.storage.put('meta', this.meta);
  }

  // Accept a hibernatable WebSocket and hand the client end back.
  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Build the roster from each socket's stored attachment.
  roster(sockets) {
    const list = sockets || this.state.getWebSockets();
    return list
      .map((ws) => ws.deserializeAttachment() || {})
      .filter((a) => a.clientId)
      .map((a) => ({ clientId: a.clientId, name: a.name, isHost: a.clientId === this.meta.hostId }));
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }
  broadcast(msg, exceptWs) {
    const s = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exceptWs) continue;
      try { ws.send(s); } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    await this.loadMeta();
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { return; }

    switch (msg.type) {
      case TYPES.JOIN: {
        ws.serializeAttachment({ clientId: msg.clientId, name: msg.name || 'Guest' });

        // First member (or a room whose host is gone) becomes host.
        const ids = this.roster().map((p) => p.clientId);
        if (!this.meta.hostId || !ids.includes(this.meta.hostId)) {
          this.meta.hostId = msg.clientId;
        }
        if (msg.videoId && !this.meta.lastVideoId) this.meta.lastVideoId = msg.videoId;
        await this.saveMeta();

        this.send(ws, {
          type: TYPES.JOINED,
          clientId: msg.clientId,
          isHost: this.meta.hostId === msg.clientId,
          participants: this.roster(),
          state: { videoId: this.meta.lastVideoId, snapshot: this.meta.lastSnapshot },
        });
        this.broadcast({ type: TYPES.PARTICIPANTS, list: this.roster() }, null);
        break;
      }

      case TYPES.LEAVE:
        try { ws.close(1000, 'left'); } catch {}
        await this.handleDeparture(ws);
        break;

      case TYPES.PLAYBACK:
      case TYPES.VIDEO:
      case TYPES.CHAT:
      case TYPES.HEARTBEAT: {
        // Cache state late joiners need.
        if (msg.type === TYPES.VIDEO) {
          this.meta.lastVideoId = msg.videoId;
          await this.saveMeta();
        } else if (msg.type === TYPES.HEARTBEAT) {
          this.meta.lastSnapshot = { time: msg.time, paused: msg.paused, rate: msg.rate, ts: msg.ts };
          await this.saveMeta();
        } else if (msg.type === TYPES.PLAYBACK) {
          this.meta.lastSnapshot = { time: msg.time, paused: msg.action === 'pause', rate: msg.rate, ts: msg.ts };
          await this.saveMeta();
        }
        this.broadcast(msg, ws);
        break;
      }

      default:
        break;
    }
  }

  async webSocketClose(ws) {
    await this.loadMeta();
    await this.handleDeparture(ws);
  }
  async webSocketError(ws) {
    await this.loadMeta();
    await this.handleDeparture(ws);
  }

  async handleDeparture(ws) {
    const leaving = ws.deserializeAttachment() || {};
    const remaining = this.state.getWebSockets().filter((s) => s !== ws);

    if (remaining.length === 0) {
      // Room is empty — wipe its persisted state.
      await this.state.storage.deleteAll();
      this.meta = null;
      return;
    }

    // Reassign host if the host left.
    if (leaving.clientId && leaving.clientId === this.meta.hostId) {
      const next = (remaining[0].deserializeAttachment() || {}).clientId || null;
      this.meta.hostId = next;
      await this.saveMeta();
      for (const s of remaining) {
        if ((s.deserializeAttachment() || {}).clientId === this.meta.hostId) {
          this.send(s, { type: TYPES.HOST, isHost: true });
        }
      }
    }

    const list = this.roster(remaining);
    for (const s of remaining) this.send(s, { type: TYPES.PARTICIPANTS, list });
  }
}
