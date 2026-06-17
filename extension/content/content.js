// Orchestrator content script. Runs on youtube.com/watch pages. Owns the
// WebSocket connection, wires local player events to the server, applies remote
// events to the player, drives the overlay UI, and handles popup commands.
//
// NOTE: this file relies on globals attached by the other content scripts
// (loaded first, in manifest order): WP.messages, WP.sync, WP.storage,
// WP.createPlayer, WP.createOverlay.

(function () {
  'use strict';

  const M = window.WP.messages;
  const SYNC = window.WP.sync;
  const STORE = window.WP.storage;

  const SESSION_KEY = 'wp_session'; // {room, name, serverUrl} persisted for auto-rejoin
  const HEARTBEAT_MS = 3000;
  const DRIFT_TICK_MS = 2500;
  const DRIFT_THRESHOLD = 1.0;

  const state = {
    ws: null,
    room: null,
    name: 'Guest',
    serverUrl: STORE.DEFAULTS.serverUrl,
    clientId: M.makeClientId(),
    isHost: false,
    connected: false,
    participants: [],
    lastSnapshot: null, // last snapshot received from the host (for drift)
    currentVideoId: null,
    navigating: false, // suppress local video-change broadcast during a forced nav
    lastError: null, // last connection error, surfaced to the popup
  };

  const echoGuard = SYNC.createEchoGuard(600);
  const player = window.WP.createPlayer(echoGuard);
  let overlay = null;
  let heartbeatTimer = null;
  let driftTimer = null;
  let videoPollTimer = null;

  // --- helpers ----------------------------------------------------------

  function send(msg) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(msg));
    }
  }

  function setStatus(text, kind) {
    if (overlay) overlay.setStatus(text, kind);
  }

  async function persistSession() {
    await STORE.set({ [SESSION_KEY]: { room: state.room, name: state.name, serverUrl: state.serverUrl } });
  }
  async function clearSession() {
    await STORE.set({ [SESSION_KEY]: null });
  }

  // --- connection lifecycle --------------------------------------------

  function connect(room, name, serverUrl) {
    disconnect(); // tear down any existing session first

    state.room = room.toUpperCase();
    state.name = name || 'Guest';
    state.serverUrl = serverUrl || state.serverUrl;
    state.currentVideoId = player.getVideoId();

    state.lastError = null;
    ensureOverlay();
    setStatus('connecting…', 'syncing');

    let ws;
    try {
      ws = new WebSocket(state.serverUrl);
    } catch (e) {
      state.lastError = 'invalid server URL';
      setStatus('bad server URL', 'error');
      return;
    }
    state.ws = ws;

    ws.addEventListener('open', () => {
      state.connected = true;
      state.lastError = null;
      send(M.join(state.room, state.name, state.clientId, state.currentVideoId));
      persistSession();
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleServerMessage(msg);
    });

    ws.addEventListener('close', () => {
      const wasConnected = state.connected;
      state.connected = false;
      if (state.room) {
        // Closing before we ever opened means the relay was unreachable.
        if (!wasConnected && !state.lastError) state.lastError = "can't reach server";
        setStatus(state.lastError || 'disconnected', 'error');
      }
    });

    ws.addEventListener('error', () => {
      if (!state.connected) state.lastError = "can't reach server";
      setStatus('connection error', 'error');
    });

    startTimers();
    bindPlayer();
  }

  function disconnect() {
    stopTimers();
    if (state.ws) {
      try { send(M.leave(state.clientId)); } catch {}
      try { state.ws.close(); } catch {}
    }
    state.ws = null;
    state.connected = false;
    state.room = null;
    state.isHost = false;
    state.participants = [];
    state.lastSnapshot = null;
  }

  async function leaveParty() {
    disconnect();
    await clearSession();
    if (overlay) { overlay.unmount(); overlay = null; }
  }

  // --- server -> client -------------------------------------------------

  function handleServerMessage(msg) {
    switch (msg.type) {
      case M.TYPES.JOINED:
        state.isHost = !!msg.isHost;
        state.participants = msg.participants || [];
        renderParticipants();
        setStatus(state.isHost ? 'connected · host' : 'connected', 'connected');
        applyJoinState(msg.state);
        addSystem(`You joined party ${state.room}`);
        break;

      case M.TYPES.PARTICIPANTS:
        state.participants = msg.list || [];
        renderParticipants();
        break;

      case M.TYPES.HOST:
        state.isHost = !!msg.isHost;
        if (state.isHost) {
          setStatus('connected · host', 'connected');
          addSystem('You are now the host');
        }
        break;

      case M.TYPES.PLAYBACK:
        applyRemotePlayback(msg);
        break;

      case M.TYPES.HEARTBEAT:
        state.lastSnapshot = { time: msg.time, paused: msg.paused, rate: msg.rate, ts: msg.ts };
        break;

      case M.TYPES.VIDEO:
        applyRemoteVideo(msg.videoId);
        break;

      case M.TYPES.CHAT:
        if (overlay) overlay.addChat({ name: msg.name, text: msg.text, self: false });
        break;

      default:
        break;
    }
  }

  // Sync to whatever the room is already doing when we join late.
  function applyJoinState(serverState) {
    if (!serverState) return;
    if (serverState.videoId && serverState.videoId !== player.getVideoId()) {
      applyRemoteVideo(serverState.videoId);
      return; // navigation will reload us; we'll resync after rejoin
    }
    if (serverState.snapshot) {
      state.lastSnapshot = serverState.snapshot;
      applySnapshot(serverState.snapshot, true);
    }
  }

  function applyRemotePlayback(msg) {
    const snap = { time: msg.time, paused: msg.action === M.ACTIONS.PAUSE, rate: msg.rate, ts: msg.ts };
    switch (msg.action) {
      case M.ACTIONS.PLAY: {
        const target = SYNC.targetTime({ ...snap, paused: false }, Date.now());
        if (target != null) player.seek(target);
        player.play();
        break;
      }
      case M.ACTIONS.PAUSE:
        if (msg.time != null) player.seek(msg.time);
        player.pause();
        break;
      case M.ACTIONS.SEEK:
        if (msg.time != null) player.seek(msg.time);
        break;
      case M.ACTIONS.RATE:
        if (msg.rate) player.setRate(msg.rate);
        break;
      default:
        break;
    }
  }

  // Force this tab to the host's video, then resync after reload/rejoin.
  function applyRemoteVideo(videoId) {
    if (!videoId || videoId === player.getVideoId()) return;
    state.navigating = true;
    // Full navigation; the content script reloads and auto-rejoins from session.
    location.href = 'https://www.youtube.com/watch?v=' + videoId;
  }

  // Align local playback to a snapshot (used on join + drift correction).
  function applySnapshot(snap, force) {
    if (!player.isReady() || !snap) return;
    const target = SYNC.targetTime(snap, Date.now());
    // Match paused/playing state first.
    if (snap.paused && !player.isPaused()) player.pause();
    if (!snap.paused && player.isPaused()) player.play();
    if (snap.rate && Math.abs(player.getRate() - snap.rate) > 0.01) player.setRate(snap.rate);
    if (target != null && (force || SYNC.shouldCorrect(player.getTime(), target, DRIFT_THRESHOLD))) {
      player.seek(target);
    }
  }

  // --- local player -> server ------------------------------------------

  function bindPlayer() {
    player.ensureBound(() => {
      // re-grab baseline once the <video> exists
      state.currentVideoId = player.getVideoId();
    });

    player.on('play', (snap) => send(M.playback(M.ACTIONS.PLAY, { ...snap, clientId: state.clientId })));
    player.on('pause', (snap) => send(M.playback(M.ACTIONS.PAUSE, { ...snap, clientId: state.clientId })));
    player.on('seek', (snap) => send(M.playback(M.ACTIONS.SEEK, { ...snap, clientId: state.clientId })));
    player.on('rate', (snap) => send(M.playback(M.ACTIONS.RATE, { ...snap, clientId: state.clientId })));
  }

  // --- timers -----------------------------------------------------------

  function startTimers() {
    stopTimers();
    heartbeatTimer = setInterval(() => {
      if (state.isHost && player.isReady()) {
        const snap = player.snapshot();
        if (snap) send(M.heartbeat({ ...snap, clientId: state.clientId }));
      }
    }, HEARTBEAT_MS);

    driftTimer = setInterval(() => {
      if (!state.isHost && state.lastSnapshot) applySnapshot(state.lastSnapshot, false);
    }, DRIFT_TICK_MS);

    videoPollTimer = setInterval(pollVideoChange, 1000);
  }

  function stopTimers() {
    [heartbeatTimer, driftTimer, videoPollTimer].forEach((t) => t && clearInterval(t));
    heartbeatTimer = driftTimer = videoPollTimer = null;
  }

  // Detect a *local* video change (user picked a new video via YouTube SPA nav).
  function pollVideoChange() {
    if (!state.connected) return;
    const vid = player.getVideoId();
    if (vid && vid !== state.currentVideoId) {
      state.currentVideoId = vid;
      bindPlayer(); // rebind to the (possibly new) <video> element
      if (!state.navigating) {
        send(M.video(vid, state.clientId));
      }
      state.navigating = false;
    }
  }

  // --- overlay ----------------------------------------------------------

  function ensureOverlay() {
    if (overlay) return;
    overlay = window.WP.createOverlay({
      onSendChat: (text) => {
        send(M.chat(text, state.name, state.clientId));
        overlay.addChat({ name: state.name, text, self: true });
      },
    });
    overlay.mount();
  }

  function renderParticipants() {
    if (overlay) overlay.setParticipants(state.participants, state.clientId);
  }

  function addSystem(text) {
    if (overlay) overlay.addChat({ text, system: true });
  }

  // --- popup messaging --------------------------------------------------

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    switch (req && req.cmd) {
      case 'join':
        connect(req.room, req.name, req.serverUrl);
        sendResponse({ ok: true });
        break;
      case 'leave':
        leaveParty();
        sendResponse({ ok: true });
        break;
      case 'status':
        sendResponse({
          connected: state.connected,
          room: state.room,
          isHost: state.isHost,
          count: state.participants.length,
          onWatchPage: !!player.getVideoId(),
          error: state.lastError,
        });
        break;
      default:
        sendResponse({ ok: false });
    }
    return true; // keep the channel open for async sendResponse
  });

  // --- auto-rejoin on load ---------------------------------------------

  async function autostart() {
    // Invite link: youtube.com/watch?v=...#wp=ROOMCODE
    const hashMatch = location.hash.match(/wp=([A-Za-z0-9]+)/);
    const settings = await STORE.getSettings();
    if (hashMatch) {
      const room = hashMatch[1].toUpperCase();
      const name = settings.displayName || 'Guest';
      connect(room, name, settings.serverUrl);
      return;
    }
    // Otherwise, resume an active session (e.g. after a video-change reload).
    const res = await STORE.get([SESSION_KEY]);
    const session = res[SESSION_KEY];
    if (session && session.room) {
      connect(session.room, session.name, session.serverUrl);
    }
  }

  if (location.pathname === '/watch') {
    autostart();
  }
})();
