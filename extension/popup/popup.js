// Popup control panel. Sends commands to the active YouTube tab's content
// script and reflects party status. Relies on window.WP.{messages,storage}
// populated by the classic scripts loaded before this module.

const M = window.WP.messages;
const STORE = window.WP.storage;

const els = {
  status: document.getElementById('status'),
  name: document.getElementById('name'),
  server: document.getElementById('server'),
  lobby: document.getElementById('lobby'),
  party: document.getElementById('party'),
  create: document.getElementById('create'),
  join: document.getElementById('join'),
  room: document.getElementById('room'),
  notice: document.getElementById('notice'),
  roomCode: document.getElementById('room-code'),
  partyMeta: document.getElementById('party-meta'),
  copyCode: document.getElementById('copy-code'),
  copyLink: document.getElementById('copy-link'),
  leave: document.getElementById('leave'),
  msg: document.getElementById('msg'),
};

let currentTab = null;
let currentVideoId = null;

function flash(text) {
  els.msg.textContent = text;
  if (text) setTimeout(() => { els.msg.textContent = ''; }, 2500);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function sendToTab(cmd, extra) {
  return new Promise((resolve) => {
    if (!currentTab) return resolve(null);
    chrome.tabs.sendMessage(currentTab.id, { cmd, ...extra }, (res) => {
      // A missing content script surfaces here as lastError; resolve null so
      // callers can react (e.g. inject the script) instead of failing silently.
      void chrome.runtime.lastError;
      resolve(res || null);
    });
  });
}

// True if the content script in `tabId` answers a status ping.
function pingTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { cmd: 'status' }, (res) => {
      void chrome.runtime.lastError;
      resolve(!!res);
    });
  });
}

// Ensure the content script is present in the tab. Tabs opened *before* the
// extension was loaded have no declarative content script, so inject it on
// demand (same files + order + CSS as the manifest). Returns true on success.
async function ensureContentScript(tabId) {
  if (await pingTab(tabId)) return true;
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/overlay.css'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'shared/messages.js',
        'shared/storage.js',
        'content/sync.js',
        'content/player.js',
        'content/overlay.js',
        'content/content.js',
      ],
    });
  } catch (e) {
    return false;
  }
  return await pingTab(tabId);
}

// Poll the content script's status until it connects (or errors / times out).
async function waitForConnection(timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await sendToTab('status', {});
    if (s && s.connected) return { ok: true, status: s };
    if (s && s.error) return { ok: false, error: s.error };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, error: 'timeout' };
}

function isYouTubeWatch(url) {
  return !!url && /^https:\/\/www\.youtube\.com\/watch\?/.test(url);
}

function videoIdFromUrl(url) {
  const m = (url || '').match(/[?&]v=([\w-]{11})/);
  return m ? m[1] : null;
}

// --- rendering --------------------------------------------------------

function showLobby(onWatchPage) {
  els.lobby.classList.remove('hidden');
  els.party.classList.add('hidden');
  els.notice.classList.toggle('hidden', onWatchPage);
  els.create.disabled = !onWatchPage;
  els.join.disabled = !onWatchPage;
}

function showParty(status) {
  els.lobby.classList.add('hidden');
  els.party.classList.remove('hidden');
  els.roomCode.textContent = status.room || '——————';
  els.partyMeta.textContent =
    (status.isHost ? 'You are the host · ' : '') + status.count + ' watching';
}

function setStatusPill(text, kind) {
  els.status.textContent = text;
  els.status.dataset.kind = kind || '';
}

// --- status polling ---------------------------------------------------

async function refresh() {
  currentTab = await getActiveTab();
  const onWatch = currentTab && isYouTubeWatch(currentTab.url);
  currentVideoId = videoIdFromUrl(currentTab && currentTab.url);

  if (!onWatch) {
    setStatusPill('not on YouTube', 'idle');
    showLobby(false);
    return;
  }

  const status = await sendToTab('status', {});
  if (status && status.connected) {
    setStatusPill(status.isHost ? 'host' : 'connected', 'connected');
    showParty(status);
  } else {
    setStatusPill('not in a party', 'idle');
    showLobby(true);
  }
}

// --- actions ----------------------------------------------------------

async function saveSettings() {
  await STORE.setSettings({
    displayName: els.name.value.trim(),
    serverUrl: els.server.value.trim() || STORE.DEFAULTS.serverUrl,
  });
}

// Shared join path: make sure the content script exists, send the join, then
// confirm we actually connected before claiming success.
async function startSession(room, name) {
  if (!currentTab) return flash('Open a YouTube video first');
  await saveSettings();

  flash('Connecting…');
  const ready = await ensureContentScript(currentTab.id);
  if (!ready) {
    return flash('Couldn’t load on this tab — reload the YouTube page.');
  }

  await sendToTab('join', {
    room,
    name: name || 'Guest',
    serverUrl: els.server.value.trim() || STORE.DEFAULTS.serverUrl,
  });

  const res = await waitForConnection();
  if (res.ok) {
    flash('Connected!');
  } else if (res.error === 'timeout') {
    flash('Server not reachable — is the relay running at that URL?');
  } else {
    flash('Connection failed: ' + res.error);
  }
  refresh();
}

async function createParty() {
  await startSession(M.makeRoomCode(), els.name.value.trim() || 'Host');
}

async function joinParty() {
  const room = els.room.value.trim().toUpperCase();
  if (!room) return flash('Enter a room code');
  await startSession(room, els.name.value.trim() || 'Guest');
}

async function leaveParty() {
  await sendToTab('leave', {});
  flash('Left party');
  setTimeout(refresh, 200);
}

function inviteLink() {
  const room = els.roomCode.textContent.trim();
  const v = currentVideoId ? '?v=' + currentVideoId : '';
  return `https://www.youtube.com/watch${v}#wp=${room}`;
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    flash(label + ' copied');
  } catch {
    flash('Copy failed');
  }
}

// --- init -------------------------------------------------------------

async function init() {
  const settings = await STORE.getSettings();
  els.name.value = settings.displayName;
  els.server.value = settings.serverUrl;

  els.create.addEventListener('click', createParty);
  els.join.addEventListener('click', joinParty);
  els.room.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinParty(); });
  els.leave.addEventListener('click', leaveParty);
  els.copyCode.addEventListener('click', () => copy(els.roomCode.textContent.trim(), 'Code'));
  els.copyLink.addEventListener('click', () => copy(inviteLink(), 'Invite link'));
  els.name.addEventListener('change', saveSettings);
  els.server.addEventListener('change', saveSettings);

  await refresh();
}

init();
