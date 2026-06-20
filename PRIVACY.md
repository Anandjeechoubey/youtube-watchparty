# Privacy Policy — PAWP connect

_Last updated: 2026-06-20_

PAWP connect ("the extension") lets you watch YouTube videos in sync with friends
("a watch party"). This policy explains exactly what data the extension handles.

## What the extension stores (on your device only)

- **Display name** — the name shown to others in your party.
- **Server URL** — the address of the relay server you choose to connect to.
- **Active session** — the current room code, so the extension can reconnect after
  a page reload.

This data is stored locally via `chrome.storage` and never leaves your device
except as described below.

## What the extension transmits

When you are in a party, the extension sends the following to the **relay server
you configure** (the Server URL), which forwards it to the other members of your
party so playback stays in sync:

- Playback events you trigger (play, pause, seek position, playback speed).
- The current video ID (so everyone loads the same video).
- Chat messages and emojis you send.
- Your display name and the room code.

That is all. The relay is a "dumb pipe": it only forwards these small messages to
other people in the same room and keeps the latest state in memory so people who
join late can sync. The reference relay server stores **nothing** on disk and
keeps no logs of message content.

## What the extension does NOT do

- It does **not** collect or transmit your browsing history.
- It does **not** read or upload video content.
- It does **not** use analytics, advertising, tracking, or fingerprinting.
- It does **not** sell or share data with any third party.
- It does **not** access pages other than `https://www.youtube.com/*`.

## Who can see your data

Only the people in your party (anyone with the room code) can see your chat
messages, display name, and playback actions, via the relay server. If you run
your own relay (recommended), no third party is involved at all. If you connect to
a relay operated by someone else, that operator could see messages passing through
it — only connect to a relay you trust.

## Permissions and why they are needed

- **`storage`** — save your display name, server URL, and active session locally.
- **`activeTab` + `scripting`** — inject the party controls into the YouTube tab
  you are viewing when you start or join a party.
- **Host access to `https://www.youtube.com/*`** — run the sync controls and the
  in-page panel on YouTube watch pages.

## Children

The extension is not directed to children under 13 and collects no personal
information beyond a display name you choose.

## Changes

If this policy changes, the "Last updated" date above will change accordingly.

## Contact

Questions? Contact the developer at **anandjechoubey@gmail.com**.
