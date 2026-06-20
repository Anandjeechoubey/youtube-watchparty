# Publishing PAWP connect to the Chrome Web Store

A step-by-step checklist. Everything you need is already in this repo.

## ⚠️ Read first: the relay must be reachable

PAWP connect needs a relay server to function. **Two things follow from this:**

1. **For out-of-the-box use**, set a default relay so a new user's extension works
   without any setup. Edit `extension/shared/storage.js` → `DEFAULTS.serverUrl` to
   your **always-on** relay (e.g. `wss://pawp-relay.onrender.com`). The current
   default `ws://localhost:8080` only works for developers running a local server,
   and a public listing pointed at localhost will look broken.
2. **For Google's review**, the reviewer will test the extension. If the relay is
   down, they'll see a non-functional extension and **reject it**. Deploy an
   always-on relay (see "Deploy the relay" below) and put test steps in the
   "Notes for reviewers" field.

A Cloudflare quick tunnel is **not** suitable here — its URL changes and it stops
when your machine sleeps. Use a hosted relay for anything public.

## Deploy the relay (one-time, for a permanent URL)

The repo includes deploy configs in `server/` (`Procfile`, `railway.json`). Easiest
free option, Render:
1. Push this repo to GitHub (already done).
2. render.com → New → Web Service → connect the repo → root directory `server`,
   start command `node index.js`, plan Free.
3. Copy the resulting `wss://<name>.onrender.com` URL → use it as the default in
   step 1 above and in reviewer notes.
   (Free instances sleep after ~15 min idle; first connect cold-starts in ~50s.)

## Package the extension

**For the store, use the production build** — it bakes your relay URL from `.env`
into the package and hides the Server URL field, so the extension works for every
user (and the reviewer) out of the box:

```bash
echo "SERVER_URL=wss://pawp-connect-relay.<subdomain>.workers.dev" > .env
./build-prod.sh            # produces dist/ and pawp-connect-prod-vX.Y.Z.zip
```

(`./package-extension.sh` produces a dev package that still shows the Server URL
field and defaults to localhost — fine for testing, not for the store.)

## Developer account

- Register at https://chrome.google.com/webstore/devconsole (one-time **$5** fee).

## Create the listing

1. **New item** → upload `pawp-connect-vX.Y.Z.zip`.
2. **Store listing** tab — fill from `store-assets/STORE-LISTING.md`:
   - Name, summary, detailed description, category (Social & Communication), language.
   - **Store icon**: 128×128 — `store-assets/store-icon-128.png` (also auto-read
     from the manifest `icons`).
   - **Screenshots** (1280×800): `store-assets/screenshot-1-sync-1280x800.png`,
     `store-assets/screenshot-2-popup-1280x800.png`.
   - **Small promo tile** (440×280): `store-assets/promo-small-440x280.png`.
   - **Marquee promo tile** (1400×560, optional): `store-assets/promo-marquee-1400x560.png`.
3. **Privacy practices** tab:
   - Single purpose + each permission justification (from `STORE-LISTING.md`).
   - Data usage disclosures + certifications.
   - **Privacy policy URL**: host `PRIVACY.md` and paste its URL.
4. **Notes for reviewers**: explain it needs a relay, give the live `wss://` URL,
   and steps: "Open any youtube.com/watch video → click the extension → Create a
   party → the panel appears and playback syncs."

## Submit

- Set visibility (Public / Unlisted) and target regions.
- **Submit for review.** Review typically takes a few business days.

## Pre-submit checklist

- [ ] `DEFAULTS.serverUrl` points to an always-on `wss://` relay (not localhost)
- [ ] Relay is deployed and reachable
- [ ] `version` in `manifest.json` is correct
- [ ] Packaged zip loads via "Load unpacked" with no errors
- [ ] Icons render at 16/32/48/128
- [ ] Privacy policy hosted and URL ready
- [ ] Screenshots + promo tiles uploaded
- [ ] Reviewer notes include the live relay URL + test steps

## After publishing

- To update: bump `version` in `manifest.json`, re-run `./package-extension.sh`,
  upload the new zip, submit again.
