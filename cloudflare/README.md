# PAWP connect relay — Cloudflare Durable Objects

An always-on, no-cold-start, **free** relay. Each party room is a Durable Object
addressed by its room code, using the WebSocket Hibernation API so idle rooms
cost nothing while staying instantly reachable.

> Free-tier note: this uses **SQLite-backed Durable Objects** (`new_sqlite_classes`
> in `wrangler.toml`), which are included on the **free** Workers plan. You do not
> need Workers Paid.

## Deploy (one time)

```bash
cd cloudflare
npm install
npx wrangler login          # opens the browser to authorize your Cloudflare account
npm run deploy
```

`wrangler deploy` prints your URL, e.g.:

```
https://pawp-connect-relay.<your-subdomain>.workers.dev
```

## Use it in the extension

Set the extension's **Server URL** to that host with the `wss://` scheme:

```
wss://pawp-connect-relay.<your-subdomain>.workers.dev
```

(The extension appends `?room=CODE` itself.) To make it the built-in default for
everyone, set `DEFAULTS.serverUrl` in `extension/shared/storage.js` to the same
`wss://…` URL and re-package.

## Verify

```bash
# health check
curl https://pawp-connect-relay.<your-subdomain>.workers.dev/health
# -> watch-party relay ok
```

Then open two YouTube tabs, join the same room, and confirm play/pause/seek/chat
sync. Live logs:

```bash
npm run tail
```

## Local dev

```bash
npm run dev      # wrangler dev — runs the Worker + DO locally with Miniflare
```

`wrangler dev` serves a local URL; use `ws://127.0.0.1:8787` as the Server URL to
test before deploying.

## How it maps to the Node relay

Same JSON protocol (`join`/`playback`/`video`/`chat`/`heartbeat` →
`joined`/`participants`/`host`). The only difference: the room is taken from the
connection URL (`?room=CODE`) instead of being tracked per-connection, because a
Durable Object **is** the room. Per-connection identity (clientId, name) is stored
via `serializeAttachment` so it survives hibernation; room state (host, last
video, last snapshot) lives in DO storage.
