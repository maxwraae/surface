// surface-mcp install — register Surface with detected MCP-capable agent hosts.
//
// Invoked as: `npx -y surface-mcp install` (or `node ./index.js install`).
//
// Engine-agnostic: scans the system for any host's config, adds Surface to
// each. Idempotent: re-running is safe. Read-write only on host config files
// the user already has.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';

const HOME = homedir();

// ─── host definitions ────────────────────────────────────────────────────────
// Each host knows how to detect itself and how to add the Surface entry.
// `apply` returns one of: 'added' | 'already' | { error: string }.

const HOSTS = [
  {
    key: 'claude-code',
    label: 'Claude Code',
    target: 'claude mcp add (CLI)',
    detect() {
      try {
        execSync('command -v claude', { stdio: 'ignore' });
        return { ok: true };
      } catch {
        return { ok: false, reason: "'claude' not on PATH" };
      }
    },
    apply() {
      // `claude mcp add` exits non-zero if an entry of that name already
      // exists. Check first so we can report idempotently.
      try {
        const list = execSync('claude mcp list', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (/^\s*surface[\s:]/m.test(list) || /\bsurface\b/.test(list)) {
          // best-effort match: `claude mcp list` lists names; if "surface"
          // appears as a token, treat as already configured.
          if (/(^|\s)surface(\s|:)/.test(list)) return 'already';
        }
      } catch {
        // list might not be supported on older CLIs — fall through to add.
      }
      try {
        execSync(
          'claude mcp add --scope user surface -- npx -y surface-mcp',
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return 'added';
      } catch (e) {
        const msg = (e.stderr?.toString() || e.message || '').trim();
        if (/already exists/i.test(msg)) return 'already';
        return { error: msg.split('\n')[0] || 'claude mcp add failed' };
      }
    },
  },
  {
    key: 'claude-desktop',
    label: 'Claude Desktop',
    target: '~/Library/Application Support/Claude/claude_desktop_config.json',
    path: join(
      HOME,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    ),
    detect() {
      const parent = dirname(this.path);
      if (existsSync(this.path) || existsSync(parent)) return { ok: true };
      return { ok: false, reason: 'not installed' };
    },
    apply() {
      return applyJsonHost(this.path);
    },
  },
  {
    key: 'cursor',
    label: 'Cursor',
    target: '~/.cursor/mcp.json',
    path: join(HOME, '.cursor', 'mcp.json'),
    detect() {
      // Tight: only detect if Cursor.app is installed or the user already has
      // a Cursor mcp.json. Bare `~/.cursor/` is unreliable — other tools use it.
      if (existsSync(this.path)) return { ok: true };
      if (existsSync('/Applications/Cursor.app')) return { ok: true };
      if (existsSync(join(HOME, 'Applications/Cursor.app'))) return { ok: true };
      return { ok: false, reason: 'not installed' };
    },
    apply() {
      return applyJsonHost(this.path);
    },
  },
  {
    key: 'codex',
    label: 'Codex',
    target: '~/.codex/config.toml',
    path: join(HOME, '.codex', 'config.toml'),
    detect() {
      // Tight: only detect if `codex` is on PATH or the config file already
      // exists. Bare `~/.codex/` is unreliable — other tools use it.
      if (existsSync(this.path)) return { ok: true };
      try {
        execSync('command -v codex', { stdio: 'ignore' });
        return { ok: true };
      } catch {
        return { ok: false, reason: 'not installed' };
      }
    },
    apply() {
      return applyTomlHost(this.path);
    },
  },
];

// ─── JSON host (Claude Desktop, Cursor) ──────────────────────────────────────

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
    writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    return 'added';
  } catch (e) {
    return { error: `write failed: ${e.message}` };
  }
}

// ─── TOML host (Codex / OpenCode) — regex append, no TOML parser ─────────────

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
    writeFileSync(filePath, next, 'utf8');
    return 'added';
  } catch (e) {
    return { error: `write failed: ${e.message}` };
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function pad(s, n) {
  if (s.length >= n) return s;
  return s + ' '.repeat(n - s.length);
}

function printPlan(rows) {
  console.log('');
  console.log('surface-mcp install — connecting Surface to your AI agents');
  console.log('');
  console.log('Detected hosts:');
  for (const r of rows) {
    const mark = r.detected ? '✓' : '–';
    const right = r.detected ? `→ ${r.host.target}` : `→ ${r.reason}`;
    console.log(`  ${mark} ${pad(r.host.label, 18)} ${right}`);
  }
  console.log('');
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printSummary(results) {
  console.log('');
  console.log('Done.');
  for (const r of results) {
    const mark =
      r.result === 'added' || r.result === 'already' ? '✓' : '–';
    let status;
    if (r.result === 'added') status = 'added';
    else if (r.result === 'already') status = 'already configured';
    else if (r.result === 'skipped') status = `skipped (${r.reason})`;
    else status = `error: ${r.error}`;
    console.log(`  ${mark} ${pad(r.host.label, 18)} ${status}`);
  }
  console.log('');
  console.log('Restart your agent host(s) to pick up the new server.');
  console.log('');
}

// ─── entry point ─────────────────────────────────────────────────────────────

export async function run(argv = process.argv.slice(3)) {
  const dryRun = argv.includes('--dry-run');

  const rows = HOSTS.map((host) => {
    const d = host.detect();
    return { host, detected: d.ok, reason: d.reason };
  });
  printPlan(rows);

  if (dryRun) {
    console.log('(dry-run — no changes made)');
    console.log('');
    return;
  }

  const anyDetected = rows.some((r) => r.detected);
  if (!anyDetected) {
    console.log('Nothing to do — no MCP-capable hosts detected.');
    return;
  }

  const answer = (await prompt('Proceed? [Y/n] ')).trim().toLowerCase();
  if (answer && !['y', 'yes'].includes(answer)) {
    console.log('Aborted.');
    return;
  }

  const results = [];
  for (const r of rows) {
    if (!r.detected) {
      results.push({ host: r.host, result: 'skipped', reason: r.reason });
      continue;
    }
    const res = r.host.apply();
    if (typeof res === 'string') {
      results.push({ host: r.host, result: res });
    } else {
      results.push({ host: r.host, result: 'error', error: res.error });
    }
  }
  printSummary(results);
}
