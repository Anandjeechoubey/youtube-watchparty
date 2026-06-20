#!/usr/bin/env bash
#
# watchparty.sh — start the relay + a public Cloudflare tunnel and print the
# wss:// URL to paste into the extension. Reuses whatever is already running.
#
#   ./watchparty.sh          # start (or reuse) relay + tunnel, print wss URL
#   ./watchparty.sh url      # just print the current wss URL (don't start anything)
#   ./watchparty.sh status   # show relay + tunnel state
#   ./watchparty.sh stop     # stop the tunnel and the relay this script started
#
set -uo pipefail

PORT="${PORT:-8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$HOME/.youtube-watchparty"
mkdir -p "$STATE_DIR"
SRV_LOG="$STATE_DIR/server.log"
TUN_LOG="$STATE_DIR/tunnel.log"
SRV_PID="$STATE_DIR/server.pid"
TUN_PID="$STATE_DIR/tunnel.pid"

relay_up()   { curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; }
pid_alive()  { [ -f "$1" ] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null; }
# -a: cloudflared writes some non-text bytes to the log, which makes grep treat
# it as binary and print "Binary file … matches" instead of the URL. Force text.
tunnel_url() { grep -aEo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUN_LOG" 2>/dev/null | head -1; }
wss_of()     { local u="$1"; [ -n "$u" ] && echo "wss://${u#https://}"; }

# A live PID is NOT proof the tunnel works — the edge registration can drop
# while the process lingers. Verify by actually fetching /health through it.
tunnel_reachable() {
  local url; url="$(tunnel_url)"
  [ -n "$url" ] || return 1
  curl -fsS --max-time 6 "$url/health" 2>/dev/null | grep -q "relay ok"
}

print_url() {
  # Return the URL whenever the tunnel process is alive and a URL exists — even
  # if not yet locally reachable (quick-tunnel DNS can lag 1-3 min). Use
  # `status` to check actual reachability.
  if pid_alive "$TUN_PID" && [ -n "$(tunnel_url)" ]; then
    local wss; wss="$(wss_of "$(tunnel_url)")"
    echo "$wss"
    if command -v pbcopy >/dev/null 2>&1; then printf "%s" "$wss" | pbcopy; fi
    return 0
  fi
  return 1
}

ensure_relay() {
  if relay_up; then
    echo "✓ relay already running on :$PORT"
    return 0
  fi
  echo "• starting relay on :$PORT ..."
  ( cd "$ROOT/server" && { [ -d node_modules/ws ] || npm install >/dev/null 2>&1; } )
  ( cd "$ROOT/server" && PORT="$PORT" nohup node index.js >"$SRV_LOG" 2>&1 & echo $! >"$SRV_PID" )
  for _ in $(seq 1 20); do relay_up && break; sleep 0.5; done
  relay_up && echo "✓ relay up on :$PORT" || { echo "✗ relay failed to start (see $SRV_LOG)"; return 1; }
}

ensure_tunnel() {
  if pid_alive "$TUN_PID" && tunnel_reachable; then
    echo "✓ tunnel already running"
    return 0
  fi
  # Clean up a stale/dead tunnel (process gone, or edge registration dropped).
  if pid_alive "$TUN_PID"; then kill "$(cat "$TUN_PID")" 2>/dev/null; fi
  rm -f "$TUN_PID"

  command -v cloudflared >/dev/null 2>&1 || { echo "✗ cloudflared not installed — run: brew install cloudflared"; return 1; }
  echo "• starting Cloudflare tunnel ..."
  : > "$TUN_LOG"
  nohup cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >"$TUN_LOG" 2>&1 &
  echo $! >"$TUN_PID"
  # Wait until it's actually reachable, not just until a URL is printed.
  for _ in $(seq 1 45); do tunnel_reachable && break; sleep 1; done
  if tunnel_reachable; then
    echo "✓ tunnel up"
  elif [ -n "$(tunnel_url)" ]; then
    # cloudflared produced a URL but DNS hasn't propagated yet — not a failure.
    echo "⚠ tunnel started; URL not resolving yet (DNS may need a few more seconds)."
    echo "  Re-check with: $0 status"
  else
    echo "✗ tunnel failed to start (see $TUN_LOG)"; return 1
  fi
}

stop() {
  if pid_alive "$TUN_PID"; then kill "$(cat "$TUN_PID")" 2>/dev/null && echo "✓ tunnel stopped"; fi
  rm -f "$TUN_PID"
  if pid_alive "$SRV_PID"; then kill "$(cat "$SRV_PID")" 2>/dev/null && echo "✓ relay stopped"; fi
  rm -f "$SRV_PID"
}

case "${1:-start}" in
  url)
    print_url || { echo "no tunnel running — run: $0"; exit 1; }
    ;;
  status)
    relay_up && echo "relay:  UP on :$PORT" || echo "relay:  DOWN"
    if pid_alive "$TUN_PID" && tunnel_reachable; then
      echo "tunnel: UP  -> $(wss_of "$(tunnel_url)")"
    elif pid_alive "$TUN_PID"; then
      echo "tunnel: STALE (process alive but not reachable — run: $0 to restart)"
    else
      echo "tunnel: DOWN"
    fi
    ;;
  stop)
    stop
    ;;
  start|"")
    ensure_relay || exit 1
    ensure_tunnel || exit 1
    echo
    echo "════════════════════════════════════════════════════════════════"
    echo "  Server URL for the extension (paste into 'Server URL'):"
    echo
    echo "    $(wss_of "$(tunnel_url)")"
    echo
    command -v pbcopy >/dev/null 2>&1 && { printf "%s" "$(wss_of "$(tunnel_url)")" | pbcopy; echo "  (copied to clipboard)"; }
    echo "════════════════════════════════════════════════════════════════"
    echo "  Keep this terminal open. Stop everything with: $0 stop"
    ;;
  *)
    echo "usage: $0 [start|url|status|stop]"; exit 1
    ;;
esac
