// Shared message protocol for the YouTube Watch Party.
// Loaded both in the extension (as a plain script attaching to window.WP)
// and in the Node relay server (via require). Keep it dependency-free.

(function (root) {
  'use strict';

  // Message types exchanged over the WebSocket.
  const TYPES = {
    // client -> server
    JOIN: 'join',
    LEAVE: 'leave',
    PLAYBACK: 'playback', // play | pause | seek | rate
    VIDEO: 'video', // someone changed the YouTube video
    CHAT: 'chat',
    HEARTBEAT: 'heartbeat', // host-only drift anchor

    // server -> client
    JOINED: 'joined', // ack with assigned clientId + current room state
    PARTICIPANTS: 'participants', // updated roster
    HOST: 'host', // tells a client whether it is the host
    ERROR: 'error',
  };

  // Playback actions carried inside a PLAYBACK message.
  const ACTIONS = {
    PLAY: 'play',
    PAUSE: 'pause',
    SEEK: 'seek',
    RATE: 'rate',
  };

  // --- builders ---------------------------------------------------------

  function join(room, name, clientId, videoId) {
    return { type: TYPES.JOIN, room, name, clientId, videoId: videoId || null };
  }

  function leave(clientId) {
    return { type: TYPES.LEAVE, clientId };
  }

  function playback(action, { time, rate, ts, clientId }) {
    return {
      type: TYPES.PLAYBACK,
      action,
      time: time == null ? null : time,
      rate: rate == null ? 1 : rate,
      ts: ts || Date.now(),
      clientId,
    };
  }

  function video(videoId, clientId) {
    return { type: TYPES.VIDEO, videoId, clientId };
  }

  function chat(text, name, clientId) {
    return { type: TYPES.CHAT, text, name, clientId, ts: Date.now() };
  }

  function heartbeat({ time, paused, rate, ts, clientId }) {
    return {
      type: TYPES.HEARTBEAT,
      time,
      paused: !!paused,
      rate: rate == null ? 1 : rate,
      ts: ts || Date.now(),
      clientId,
    };
  }

  // Generate a short, human-shareable room code (no ambiguous chars).
  function makeRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  // Generate a random client id.
  function makeClientId() {
    return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  const api = {
    TYPES,
    ACTIONS,
    join,
    leave,
    playback,
    video,
    chat,
    heartbeat,
    makeRoomCode,
    makeClientId,
  };

  // Expose for both environments.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.WP = root.WP || {};
  root.WP.messages = api;
})(typeof window !== 'undefined' ? window : globalThis);
