# 🐾 PAWP connect

**PAWP connect** is a Chrome extension to **host a watch party and watch YouTube in perfect sync with friends**. Anyone in the party can play, pause, seek, or change the playback speed, and it instantly syncs for everyone. Includes text chat with a quick‑emoji bar, a live participant list, automatic "load the same video," and drift correction.

```
youtube-watchparty/
├─ extension/   ← the Chrome extension (load this unpacked)
└─ server/      ← a small WebSocket relay (run locally or deploy once)
```

## How it works

The **host's tab is the source of truth**. When anyone controls playback, their tab broadcasts the event through a lightweight WebSocket relay to everyone else in the room. The relay never sees any video — it only forwards small JSON messages (play/pause/seek/speed/chat) and remembers just enough state so people who join late snap straight into sync. A periodic heartbeat from the host nudges everyone back together if a player drifts more than ~1 second.

---

## 1. Run the relay server

The extension needs a relay so friends can reach each other.

### Locally (for testing on one machine / same network)

```bash
cd server
npm install
npm start          # listens on ws://localhost:8080
```

### Instant public URL via Cloudflare Tunnel (no signup)

Fastest way to let friends across the internet join — works while your machine
runs the server + tunnel. Requires [`cloudflared`](https://github.com/cloudflare/cloudflared)
(`brew install cloudflared`).

**Easiest — use the helper script** ([`watchparty.sh`](watchparty.sh)). It starts the
relay (if not already up), reuses or starts the tunnel, and prints + clipboard-copies
the `wss://` URL:

```bash
./watchparty.sh            # start (or reuse) relay + tunnel, print the wss URL
./watchparty.sh url        # just print the current URL
./watchparty.sh status     # show relay + tunnel state
./watchparty.sh stop       # stop the tunnel and the relay it started
```

Run it in your **own terminal** (not via any remote/agent shell) so the tunnel
persists for your session. Runtime logs/PIDs live in `~/.youtube-watchparty/`.

**Or do it manually:**

```bash
# terminal 1 — the relay
cd server && npm start                       # ws://localhost:8080

# terminal 2 — the public tunnel
cloudflared tunnel --url http://localhost:8080
```

`cloudflared` prints a URL like `https://something-random.trycloudflare.com`.
Use it in the extension's **Server URL** field as **`wss://`** (not `https://`):

```
wss://something-random.trycloudflare.com
```

Notes:
- Only reachable while both the relay and the tunnel are running on your machine.
- The URL changes every time you restart the tunnel (quick tunnels are ephemeral).
- Cloudflare proxies WebSockets transparently, so sync works the same as local.

### Deploy once (so friends anywhere can join)

The `server/` folder is deploy-ready for **Railway**, **Render**, **Fly.io**, etc. (it includes a `Procfile` and `railway.json`, and serves a `/health` endpoint).

- Point the host at the `server/` directory, start command `node index.js`.
- The platform gives you a URL like `wss://your-app.up.railway.app`.
- Put **that `wss://…` URL** into the extension's "Server URL" field (see below).

> Use `wss://` (TLS) for deployed servers. `ws://localhost:8080` is only for local testing.

---

## 2. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin the **Watch Party** icon for easy access.

---

## 3. Host a party

1. Open any YouTube video (`youtube.com/watch?v=…`).
2. Click the extension icon.
3. Set your **display name** and the **Server URL** (e.g. `ws://localhost:8080` or your deployed `wss://…`).
4. Click **Create a party** → you get a 6‑character **room code**.
5. Click **Copy invite link** and send it to your friends.

## 4. Join a party

- **Easiest:** open the invite link your friend sent — it auto‑joins the room.
- **Or:** open a YouTube video, click the extension, enter the **room code**, and click **Join**.

Once joined, an in‑page **Watch Party** panel appears (top‑right of the video page) with the participant list, chat, and a quick‑emoji bar.

---

## Features

| Feature | Behaviour |
|---|---|
| Synced play / pause | Anyone can play or pause; everyone follows. |
| Synced seek | Scrubbing the timeline jumps everyone to the same spot. |
| Synced playback speed | Changing speed (0.5×, 2×, …) applies to all. |
| Auto‑load same video | When anyone switches videos, everyone's tab follows. |
| Drift correction | Players that fall >1s out of sync are nudged back automatically. |
| Late‑join sync | Joining mid‑video drops you in at the correct time. |
| Text chat + emojis | Chat panel with a one‑click emoji bar. |
| Participant list | See who's watching and who the host is. |

---

## Development

Pure logic is isolated and unit‑tested:

```bash
# Server: room/relay logic + a real end-to-end WebSocket test
cd server && npm install && npm test

# Extension: sync math (target time, drift threshold, echo guard)
cd extension/content && node --test
```

Architecture notes:
- **No build step** — the extension loads unpacked as plain JS.
- The WebSocket lives in the **content script** (Manifest V3 service workers sleep and can't hold a persistent socket). The content script survives YouTube's in‑app navigation.
- Shared/pure modules (`shared/messages.js`, `content/sync.js`, `server/rooms.js`) run in both the browser and Node so the same code is tested.
- Message protocol is defined once in [`extension/shared/messages.js`](extension/shared/messages.js).

---

## Notes & limitations (v1)

- **Text + emoji chat only** — no voice/video.
- **No accounts** — the room code is the only gate. Don't share it publicly.
- Works on standard `youtube.com/watch` pages (not embeds or YouTube Music).
- If a deployed server sits idle it may cold‑start; the first connection can take a moment.
