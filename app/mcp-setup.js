// MCP host detection and registration — CJS, for the Electron main process.
//
// Mirrors the logic in mcp/install.js (ESM, for the terminal `npx install`
// flow). The two serve different runtimes; keep them in sync manually.

const { execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { homedir } = require('os');
const { join, dirname } = require('path');

const HOME = homedir();

// Electron's env may not include /opt/homebrew/bin — augment PATH so
// `command -v claude` and `claude mcp add` work.
const AUGMENTED_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  process.env.PATH,
].join(':');

const EXEC_OPTS = {
  encoding: 'utf8',
  timeout: 5000,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PATH: AUGMENTED_PATH },
};

// --- host definitions --------------------------------------------------------

const HOSTS = [
  {
    key: 'claude-code',
    label: 'Claude Code',
    detect() {
      try {
        execSync('command -v claude', { ...EXEC_OPTS, stdio: 'ignore' });
        return { ok: true };
      } catch {
        return { ok: false, reason: "'claude' not on PATH" };
      }
    },
    apply() {
      try {
        const list = execSync('claude mcp list', EXEC_OPTS);
        if (/(^|\s)surface(\s|:)/m.test(list)) return 'already';
      } catch { /* fall through */ }
      try {
        execSync(
          'claude mcp add --scope user surface -- npx -y surface-mcp',
          EXEC_OPTS,
        );
        return 'added';
      } catch (e) {
        const msg = (e.stderr || e.message || '').trim();
        if (/already exists/i.test(msg)) return 'already';
        return { error: msg.split('\n')[0] || 'claude mcp add failed' };
      }
    },
  },
  {
    key: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    detect() {
      const parent = dirname(this.configPath);
      if (existsSync(this.configPath) || existsSync(parent)) return { ok: true };
      return { ok: false, reason: 'not installed' };
    },
    apply() {
      return applyJsonHost(this.configPath);
    },
  },
  {
    key: 'cursor',
    label: 'Cursor',
    configPath: join(HOME, '.cursor', 'mcp.json'),
    detect() {
      if (existsSync(this.configPath)) return { ok: true };
      if (existsSync('/Applications/Cursor.app')) return { ok: true };
      if (existsSync(join(HOME, 'Applications', 'Cursor.app'))) return { ok: true };
      return { ok: false, reason: 'not installed' };
    },
    apply() {
      return applyJsonHost(this.configPath);
    },
  },
  {
    key: 'codex',
    label: 'Codex',
    configPath: join(HOME, '.codex', 'config.toml'),
    detect() {
      if (existsSync(this.configPath)) return { ok: true };
      try {
        execSync('command -v codex', { ...EXEC_OPTS, stdio: 'ignore' });
        return { ok: true };
      } catch {
        return { ok: false, reason: 'not installed' };
      }
    },
    apply() {
      return applyTomlHost(this.configPath);
    },
  },
];

// --- JSON host (Claude Desktop, Cursor) --------------------------------------

function applyJsonHost(filePath) {
  let obj = {};
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      obj = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      return { error: `parse failed: ${e.message}` };
    }
  }
  if (!obj.mcpServers || typeof obj.mcpServers !== 'object') {
    obj.mcpServers = {};
  }
  if (obj.mcpServers.surface) return 'already';
  obj.mcpServers.surface = { command: 'npx', args: ['-y', 'surface-mcp'] };
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    return 'added';
  } catch (e) {
    return { error: `write failed: ${e.message}` };
  }
}

// --- TOML host (Codex) -------------------------------------------------------

function applyTomlHost(filePath) {
  let existing = '';
  if (existsSync(filePath)) {
    try {
      existing = readFileSync(filePath, 'utf8');
    } catch (e) {
      return { error: `read failed: ${e.message}` };
    }
  }
  if (/^\[mcp_servers\.surface\]/m.test(existing)) return 'already';
  const block =
    '[mcp_servers.surface]\n' +
    'command = "npx"\n' +
    'args = ["-y", "surface-mcp"]\n';
  let next;
  if (!existing) {
    next = block;
  } else if (existing.endsWith('\n\n')) {
    next = existing + block;
  } else if (existing.endsWith('\n')) {
    next = existing + '\n' + block;
  } else {
    next = existing + '\n\n' + block;
  }
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, next, 'utf8');
    return 'added';
  } catch (e) {
    return { error: `write failed: ${e.message}` };
  }
}

// --- public API --------------------------------------------------------------

function detectHosts() {
  return HOSTS.map((h) => {
    const d = h.detect();
    return { key: h.key, label: h.label, detected: d.ok, reason: d.reason };
  });
}

function applyHost(key) {
  const host = HOSTS.find((h) => h.key === key);
  if (!host) return { error: `unknown host: ${key}` };
  return host.apply();
}

module.exports = { detectHosts, applyHost };
