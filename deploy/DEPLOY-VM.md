# Deploy the PAWP connect relay on an always-free VM

End result: a permanent, always-on `wss://your-domain` with **no cold start**, for
free. ~20 minutes, mostly waiting. Works on **Oracle Cloud Always Free** (most
generous) or **Google Cloud `e2-micro`**.

The on-VM work is automated by [`vm-setup.sh`](vm-setup.sh). You only do the
console clicks below.

---

## 1. Create the VM

### Oracle Cloud (recommended)
1. Sign up at https://www.oracle.com/cloud/free/ (credit card for identity check;
   Always Free resources are never charged).
2. **Create instance** → Image: **Canonical Ubuntu 24.04** → Shape: an **Always
   Free–eligible** one (`VM.Standard.A1.Flex` ARM with 1 OCPU/6 GB, or
   `VM.Standard.E2.1.Micro`).
3. Add your SSH public key (or let it generate one). **Create**.
4. Note the instance's **public IP**.

### Google Cloud (alternative)
1. https://cloud.google.com/free → create a project.
2. Compute Engine → Create instance → Machine type **e2-micro**, region one of
   `us-west1` / `us-central1` / `us-east1` (Always Free), boot disk Ubuntu 24.04.
3. Note the **external IP**.

## 2. Open ports 80 and 443 to the internet (cloud firewall)

This is separate from the OS firewall (the script handles that one).

- **Oracle:** VCN → the instance's **Subnet** → **Security List** → **Add Ingress
  Rules**: Source `0.0.0.0/0`, IP Protocol TCP, Destination ports **80** and
  **443** (add both).
- **GCP:** VPC network → Firewall → Create rule: Ingress, targets All instances,
  source `0.0.0.0/0`, allow TCP **80, 443**.

## 3. Get a free domain pointing at the VM (for TLS / `wss://`)

`wss://` needs a real certificate, which needs a hostname.

1. Go to https://www.duckdns.org, sign in, create a subdomain, e.g. `pawp`.
2. Set its IP to your VM's public IP → you now have `pawp.duckdns.org`.

(If you own a domain, just point an A record at the IP and use that instead.)

## 4. Run the setup script on the VM

SSH in, then:

```bash
ssh ubuntu@YOUR_VM_IP
curl -fsSL https://raw.githubusercontent.com/Anandjeechoubey/youtube-watchparty/main/deploy/vm-setup.sh | bash -s -- pawp.duckdns.org
```

It installs Node, runs the relay as a `systemd` service on `localhost:8080`,
installs Caddy, and fetches a Let's Encrypt certificate for your domain. After
~30s for the cert:

```bash
curl https://pawp.duckdns.org/health      # -> watch-party relay ok
```

## 5. Point the extension at it

Your permanent relay URL is:

```
wss://pawp.duckdns.org
```

- Paste it into the extension's **Server URL** field, and/or
- Make it the built-in default for everyone: set `DEFAULTS.serverUrl` in
  `extension/shared/storage.js` to `wss://pawp.duckdns.org`, then re-package.

That's it — always on, no cold start, free.

---

## Operating it

```bash
sudo systemctl status pawp-relay     # relay state
sudo journalctl -u pawp-relay -f     # live relay logs
sudo systemctl restart pawp-relay    # restart relay
sudo systemctl reload caddy          # reload proxy/TLS
```

**Update to the latest code:** re-run the same `vm-setup.sh` line — it pulls the
repo and restarts the service.

## Troubleshooting

- `curl https://domain/health` hangs → ports 80/443 not open in the **cloud**
  security list (step 2), or DNS not propagated yet.
- TLS error → DuckDNS IP doesn't match the VM, or the cert hasn't issued yet
  (`sudo journalctl -u caddy -f` to watch).
- Relay not responding locally → `sudo journalctl -u pawp-relay -e`.
