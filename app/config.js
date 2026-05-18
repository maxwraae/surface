// Loads ~/.config/surface/config.json and fills in defaults.
//
// Shape:
//   {
//     "port":         7878,
//     "bind":         "0.0.0.0",
//     "self":         "http://localhost:7878",
//     "rootsExposed": ["/Users/<you>", "/tmp"],
//     "target":       "self" | "http://<peer>:<port>",
//     "peers":        ["http://<peer>:<port>", ...]
//   }
//
// `target` controls where this Surface sends windows by default. `self`
// means open windows in this Electron process. A URL means POST to that
// peer's /_/open and let it open the window.
//
// `rootsExposed` is the allowlist for the embedded HTTP server. Requests
// for files outside these roots get 403, regardless of tailnet origin.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = path.join(os.homedir(), '.config', 'surface', 'config.json');

const DEFAULTS = {
  port: 7878,
  bind: '0.0.0.0',
  self: 'http://localhost:7878',
  rootsExposed: [os.homedir(), '/tmp'],
  target: 'self',
  peers: [],
};

function load() {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`surface: bad config at ${CONFIG_PATH}: ${err.message}`);
    }
  }
  const cfg = { ...DEFAULTS, ...user };
  cfg.rootsExposed = (cfg.rootsExposed || []).map((p) => path.resolve(p));
  return cfg;
}

module.exports = { load, CONFIG_PATH, DEFAULTS };
