# Chrome Web Store listing — PAWP connect

Copy-paste fields for the developer dashboard. Adjust wording to taste.

---

## Item name
PAWP connect

## Summary (≤ 132 characters)
Watch YouTube together in perfect sync with friends — shared play, pause, seek, speed, and built-in group chat.

## Category
Social & Communication

## Language
English

---

## Detailed description

**PAWP connect turns any YouTube video into a watch party.** Start a party in one
click, share the room code (or invite link), and everyone watches the same video
at the same moment — perfectly in sync.

**Anyone in the party can control playback.** Play, pause, scrub the timeline, or
change the playback speed, and it instantly syncs for everyone. Switch to a new
video and the whole party follows automatically.

**React together.** A built-in side panel shows who's in the party and includes a
group chat with a one-click emoji bar, so you can talk while you watch.

**Features**
- 🐾 One-click watch parties with a shareable room code and invite link
- ▶️ Synced play, pause, and seek — anyone can drive
- ⏩ Synced playback speed
- 🎬 Auto-load the same video when anyone switches
- 🔁 Automatic drift correction keeps everyone aligned
- 💬 Group chat with a quick-emoji bar
- 👥 Live participant list

**How it works**
PAWP connect syncs your party through a lightweight relay server. The relay never
touches the video — it only passes small "play/pause/seek/chat" messages between
party members. You can use a shared relay or run your own (it's open source and
free). No account, no tracking, no ads.

**Privacy**
PAWP connect collects no browsing history and shows no ads. It stores only your
display name and chosen server URL, on your device. See the privacy policy for
details.

---

## Single purpose (required field)
PAWP connect synchronizes YouTube video playback (play, pause, seek, speed) and
provides a group chat among friends watching the same video together, so a "watch
party" stays in sync.

## Permission justifications (Privacy practices tab)

- **storage** — Save the user's display name, chosen relay server URL, and current
  room so the party can reconnect after a page reload.
- **activeTab** — Identify and act on the YouTube tab the user is currently viewing
  when they open the popup to start or join a party.
- **scripting** — Inject the watch-party controls/UI into the current YouTube tab
  on demand (e.g., when the user starts a party from the popup on a tab that was
  already open).
- **Host permission `https://www.youtube.com/*`** — The extension only operates on
  YouTube watch pages, where it reads/controls the video element and shows the
  party panel.
- **Remote code** — None. All code is contained in the package; the only network
  use is a WebSocket connection to the user-configured relay server.

## Data usage disclosures (answer in the dashboard)
- Does the item collect or use personal/sensitive data? **Display name only**
  (user-provided), plus chat messages the user types — used solely to operate the
  watch party. Not sold, not used for unrelated purposes, no tracking.
- Data is transmitted to the user-configured relay server to sync the party.
- Certified: not selling data; not using data for credit/lending; not using data
  for purposes unrelated to the single purpose above.

## Privacy policy URL
Host `PRIVACY.md` and link it here, e.g.:
`https://github.com/Anandjeechoubey/youtube-watchparty/blob/main/PRIVACY.md`
