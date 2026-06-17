// Thin wrappers over chrome.storage.local for the few persisted settings.
// Attaches to window.WP.storage (content script + popup share the namespace
// only within their own context; this file is included in both).

(function (root) {
  'use strict';

  const DEFAULTS = {
    displayName: '',
    serverUrl: 'ws://localhost:8080',
    lastRoom: '',
  };

  function get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    });
  }

  function set(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  // Returns the full settings object with defaults filled in.
  async function getSettings() {
    const stored = await get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...stored };
  }

  async function setSettings(partial) {
    await set(partial);
  }

  const api = { DEFAULTS, getSettings, setSettings, get, set };

  root.WP = root.WP || {};
  root.WP.storage = api;
})(typeof window !== 'undefined' ? window : globalThis);
