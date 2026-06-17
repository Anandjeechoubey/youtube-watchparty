// Wraps the YouTube watch-page <video> element. Exposes a small imperative
// API and emits normalized events when the *local user* drives playback.
// Remote applies go through applyRemote* which are echo-guarded by the caller.

(function (root) {
  'use strict';

  function createPlayer(echoGuard) {
    let video = null;
    const listeners = { play: [], pause: [], seek: [], rate: [] };

    function on(event, fn) {
      if (listeners[event]) listeners[event].push(fn);
    }
    function emit(event, payload) {
      // A local DOM event that we caused by applying a remote command must not
      // be re-broadcast, so suppress while the echo guard is active.
      if (echoGuard && echoGuard.active()) return;
      (listeners[event] || []).forEach((fn) => fn(payload));
    }

    function getVideoEl() {
      return document.querySelector('video.html5-main-video') || document.querySelector('video');
    }

    function snapshot() {
      if (!video) return null;
      return {
        time: video.currentTime,
        paused: video.paused,
        rate: video.playbackRate,
        ts: Date.now(),
      };
    }

    function bind() {
      const el = getVideoEl();
      if (!el || el === video) return !!video;
      video = el;

      video.addEventListener('play', () => emit('play', snapshot()));
      video.addEventListener('pause', () => emit('pause', snapshot()));
      // 'seeked' fires after a user scrub; use it so we report the final time.
      video.addEventListener('seeked', () => emit('seek', snapshot()));
      video.addEventListener('ratechange', () => emit('rate', snapshot()));
      return true;
    }

    // Keep trying to attach until YouTube has rendered the player.
    function ensureBound(cb) {
      if (bind()) {
        cb && cb();
        return;
      }
      const iv = setInterval(() => {
        if (bind()) {
          clearInterval(iv);
          cb && cb();
        }
      }, 500);
    }

    // --- imperative controls (used to apply remote commands) -------------

    function withGuard(fn) {
      if (echoGuard) echoGuard.mark();
      fn();
    }

    function play() {
      if (video) withGuard(() => video.play().catch(() => {}));
    }
    function pause() {
      if (video) withGuard(() => video.pause());
    }
    function seek(time) {
      if (video && time != null) withGuard(() => { video.currentTime = time; });
    }
    function setRate(rate) {
      if (video && rate) withGuard(() => { video.playbackRate = rate; });
    }

    function isPaused() {
      return video ? video.paused : true;
    }
    function getTime() {
      return video ? video.currentTime : null;
    }
    function getRate() {
      return video ? video.playbackRate : 1;
    }
    function isReady() {
      return !!video;
    }

    // Current YouTube video id from the URL (?v=...).
    function getVideoId() {
      const m = location.href.match(/[?&]v=([\w-]{11})/);
      return m ? m[1] : null;
    }

    return {
      on,
      ensureBound,
      snapshot,
      play,
      pause,
      seek,
      setRate,
      isPaused,
      getTime,
      getRate,
      isReady,
      getVideoId,
    };
  }

  root.WP = root.WP || {};
  root.WP.createPlayer = createPlayer;
})(typeof window !== 'undefined' ? window : globalThis);
