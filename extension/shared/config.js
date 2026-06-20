// Build-time configuration.
//
// In development this is empty, so the popup shows the Server URL field and you
// can point the extension at any relay (localhost, a tunnel, etc.).
//
// The production build (./build-prod.sh) OVERWRITES this file, setting
// lockedServerUrl to the relay from .env. When locked, the extension always uses
// that relay and hides the Server URL field in the UI.

(function (root) {
  root.WP = root.WP || {};
  root.WP.config = {
    lockedServerUrl: '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
