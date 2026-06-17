// Pure sync math + echo guard for the watch party. No DOM access here so it
// can be unit-tested under Node. Attaches to window.WP.sync in the browser.

(function (root) {
  'use strict';

  // Given a playback snapshot { time, paused, rate, ts } and the current
  // wall-clock time, compute where the video *should* be now. A paused video
  // stays at `time`; a playing one advances by elapsed wall time * rate. This
  // compensates for network/processing latency between snapshot and apply.
  function targetTime(snapshot, nowTs) {
    if (!snapshot || snapshot.time == null) return null;
    if (snapshot.paused) return snapshot.time;
    const rate = snapshot.rate == null ? 1 : snapshot.rate;
    const elapsed = Math.max(0, (nowTs - snapshot.ts) / 1000);
    return snapshot.time + elapsed * rate;
  }

  // Should we seek to correct drift? True when local playback is more than
  // `threshold` seconds away from where it should be.
  function shouldCorrect(localTime, target, threshold) {
    if (localTime == null || target == null) return false;
    const t = threshold == null ? 1.0 : threshold;
    return Math.abs(localTime - target) > t;
  }

  // Echo guard. When we apply a remote event to the local <video>, the player
  // fires its own 'play'/'pause'/'seeking' events. We must NOT re-broadcast
  // those. Callers wrap a remote apply in `markApplying()` and check
  // `isApplying()` before broadcasting a local event.
  function createEchoGuard(windowMs) {
    const w = windowMs == null ? 600 : windowMs;
    let until = 0;
    return {
      mark() {
        until = nowMs() + w;
      },
      active() {
        return nowMs() < until;
      },
    };
  }

  function nowMs() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.timeOrigin + performance.now()
      : Date.now();
  }

  const api = { targetTime, shouldCorrect, createEchoGuard };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.WP = root.WP || {};
  root.WP.sync = api;
})(typeof window !== 'undefined' ? window : globalThis);
