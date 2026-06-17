// Pure room registry + relay logic for the watch-party relay server.
// No I/O here: callers pass an opaque `conn` (the socket) and a `send(conn, msg)`
// function. This keeps the logic unit-testable without real WebSockets.

'use strict';

function createRegistry() {
  // room code -> {
  //   clients: Map<conn, {clientId, name}>,
  //   hostId: string | null,
  //   lastVideoId: string | null,
  //   lastSnapshot: object | null,   // last heartbeat/playback for late-join sync
  // }
  const rooms = new Map();

  function getRoom(code) {
    return rooms.get(code) || null;
  }

  function ensureRoom(code) {
    let room = rooms.get(code);
    if (!room) {
      room = { clients: new Map(), hostId: null, lastVideoId: null, lastSnapshot: null };
      rooms.set(code, room);
    }
    return room;
  }

  function roster(room) {
    return [...room.clients.values()].map((c) => ({
      clientId: c.clientId,
      name: c.name,
      isHost: c.clientId === room.hostId,
    }));
  }

  // Add a client to a room. Returns { room, isHost, participants, state }.
  function join(code, conn, { clientId, name, videoId }) {
    const room = ensureRoom(code);
    room.clients.set(conn, { clientId, name: name || 'Guest' });

    // First member (or a room that lost its host) becomes host.
    if (!room.hostId || !hasClientId(room, room.hostId)) {
      room.hostId = clientId;
    }
    // A joiner that already knows a videoId seeds an empty room.
    if (videoId && !room.lastVideoId) {
      room.lastVideoId = videoId;
    }

    return {
      isHost: room.hostId === clientId,
      participants: roster(room),
      state: { videoId: room.lastVideoId, snapshot: room.lastSnapshot },
    };
  }

  function hasClientId(room, clientId) {
    for (const c of room.clients.values()) {
      if (c.clientId === clientId) return true;
    }
    return false;
  }

  // Remove a connection from whatever room it is in.
  // Returns { code, room, hostChanged } or null if it wasn't in a room.
  function leave(conn) {
    for (const [code, room] of rooms) {
      if (!room.clients.has(conn)) continue;
      const leaving = room.clients.get(conn);
      room.clients.delete(conn);

      let hostChanged = false;
      if (leaving.clientId === room.hostId) {
        const next = room.clients.values().next().value;
        room.hostId = next ? next.clientId : null;
        hostChanged = true;
      }

      if (room.clients.size === 0) {
        rooms.delete(code);
        return { code, room: null, hostChanged };
      }
      return { code, room, hostChanged };
    }
    return null;
  }

  // Find which room a connection belongs to.
  function roomOf(conn) {
    for (const [code, room] of rooms) {
      if (room.clients.has(conn)) return { code, room };
    }
    return null;
  }

  // Cache state that late joiners need so they can sync immediately.
  function cache(room, msg) {
    if (!room) return;
    if (msg.type === 'video') {
      room.lastVideoId = msg.videoId;
    } else if (msg.type === 'heartbeat') {
      room.lastSnapshot = { time: msg.time, paused: msg.paused, rate: msg.rate, ts: msg.ts };
    } else if (msg.type === 'playback') {
      // Derive a snapshot from any playback action so even a host-less room
      // can answer late joiners between heartbeats.
      const paused = msg.action === 'pause';
      room.lastSnapshot = { time: msg.time, paused, rate: msg.rate, ts: msg.ts };
    }
  }

  // Relay a message to every client in the room EXCEPT the sender.
  function relay(room, senderConn, msg, send) {
    if (!room) return;
    for (const conn of room.clients.keys()) {
      if (conn === senderConn) continue;
      send(conn, msg);
    }
  }

  function roomCount() {
    return rooms.size;
  }

  return { getRoom, join, leave, roomOf, cache, relay, roster, roomCount, _rooms: rooms };
}

module.exports = { createRegistry };
