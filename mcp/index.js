#!/usr/bin/env node
if (process.argv[2] === 'install') {
  const { run } = await import('./install.js');
  await run();
  process.exit(0);
}
// surface-mcp — one tool, `surface`, for any MCP-capable agent.
//
// The agent passes one string. Surface figures out what kind of thing it is:
//   - URL (http://, https://, file://) → open in a window
//   - Absolute or ~/-prefixed path     → open the file
//   - Anything else                    → treat as HTML; write to a temp file
//                                        and open it
//
// HTML content is written to ~/Library/Application Support/surface/temp/ with
// a timestamped + content-hashed filename. Files persist after the window
// closes (so a recently-rendered thing can be reopened or referenced), and
// Surface garbage-collects anything older than 24 hours on its next launch.
// See app/main.js — gcTempDir().

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

let _surfaceBin = null;
function findSurfaceBinary() {
  if (_surfaceBin) return _surfaceBin;

  const candidates = [
    '/Applications/Surface.app/Contents/MacOS/Surface',
    join(homedir(), 'Applications/Surface.app/Contents/MacOS/Surface'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      _surfaceBin = p;
      return _surfaceBin;
    }
  }

  // Spotlight fallback — locate any Surface.app on the system by bundle id.
  try {
    const out = execSync(
      'mdfind \'kMDItemCFBundleIdentifier == "com.maxwraae.surface"\'',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const first = out.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    if (first) {
      const bin = join(first, 'Contents/MacOS/Surface');
      if (existsSync(bin)) {
        _surfaceBin = bin;
        return _surfaceBin;
      }
    }
  } catch {
    // mdfind missing or failed — fall through
  }

  // Dev fallback: running from a repo clone, use bin/surface.
  const devBin = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'bin',
    'surface'
  );
  if (existsSync(devBin)) {
    _surfaceBin = devBin;
    return _surfaceBin;
  }

  throw new Error(
    'Surface.app not found. Download it from https://github.com/maxwraae/surface/releases and drag it to /Applications, then try again.'
  );
}

// macOS userData path for the Electron app named "surface".
const TEMP_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'surface',
  'temp'
);

const URL_RE = /^(https?|file):\/\//i;
const PATH_RE = /^(\/|~\/)/;
const HAS_TAG_RE = /<[a-zA-Z!][^>]*>/;

function classify(input) {
  const head = input.trim().slice(0, 64);
  if (URL_RE.test(head)) return 'url';
  if (PATH_RE.test(head)) return 'path';
  if (HAS_TAG_RE.test(input)) return 'html';
  // No tags, no path, no URL — treat as HTML so the agent can pass plain text
  // that still gets a window (we wrap it in a minimal document).
  return 'text';
}

function expandPath(p) {
  if (p.startsWith('~/')) return p.replace(/^~/, homedir());
  return p;
}

function wrapPlainText(text) {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Surface</title>
<style>
  html,body{margin:0;padding:0}
  body{font:17px/1.65 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
       color:#1a1a1a;background:#fafaf7;
       padding:3rem;max-width:38rem;margin:0 auto}
  pre{white-space:pre-wrap;word-wrap:break-word}
</style></head><body><pre>${esc}</pre></body></html>`;
}

async function htmlToTempFile(content) {
  await mkdir(TEMP_DIR, { recursive: true });
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 8);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const filename = `${stamp}-${hash}.html`;
  const fullPath = join(TEMP_DIR, filename);
  await writeFile(fullPath, content, 'utf8');
  return fullPath;
}

const TOOL_DESCRIPTION = `Open something in a Surface window on the user's screen — a file, a URL, or HTML you just wrote.

Use this whenever you want the user to SEE something, not just read your description of it. Surface gives you visual hands: the most general renderer on the planet (Chromium), in a window, on the user's machine.

You can pass three kinds of things:

1. A URL — "https://...", "http://...", "file://...". Opens the page in a window. Use for websites, web apps, online docs, dashboards, anything live.

2. An absolute or ~/-prefixed file path. Opens that file. HTML files render directly. PDFs render in Chromium's built-in viewer. Other files render with Chromium's defaults.

3. Raw HTML content — anything with tags. Surface writes it to a temporary file and opens it. This is your main output medium: when you want to show the user something you're generating right now — a chart, a draft, a layout, a calculator, a table, a sequence diagram, a working prototype — write HTML and pass it here.

HTML is the substrate. Use it generously. Every web technology works:

  - Charts: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  - Diagrams: <script src="https://cdn.jsdelivr.net/npm/mermaid"></script>
  - Math: <script src="https://cdn.jsdelivr.net/npm/katex"></script>
  - Tables: plain <table>, or DataTables, or CSS Grid
  - Layout: Flexbox, Grid, everything
  - Interaction: inline <script> with vanilla JS

Style for legibility. Avoid the generic-AI default look:
  - System fonts: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
  - Soft warm background (#fafaf7) rather than pure white
  - Dark text (#1a1a1a), generous line-height (~1.6)
  - Real typographic hierarchy — one h1 hero, comfortable body at ~17px
  - Generous padding around content (3rem on desktop)
  - Max-width ~36rem for prose, full-width for dashboards
  - Subtle code background (#f1efea) — never pure gray

Each call opens one window. Multiple calls open multiple windows in the same Surface process. Windows persist until the user closes them.

Examples:

  surface("https://en.wikipedia.org/wiki/Hypertext")
  surface("~/Documents/draft.html")
  surface("/Users/max/data/report.pdf")
  surface("<!DOCTYPE html><html><body style='font-family:system-ui;padding:3rem;background:#fafaf7'><h1>Hello</h1><p>This is a Surface window.</p></body></html>")

  // A chart
  surface(\`<!DOCTYPE html><html><head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  </head><body style="font-family:system-ui;padding:2rem;background:#fafaf7">
    <h1>Q1–Q4 Sales</h1>
    <canvas id="c" width="600" height="300"></canvas>
    <script>new Chart(document.getElementById('c'),{type:'bar',data:{labels:['Q1','Q2','Q3','Q4'],datasets:[{label:'Sales',data:[12,19,8,15]}]}});</script>
  </body></html>\`)
`;

const server = new Server(
  { name: 'surface', version: '0.4.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'surface',
      description: TOOL_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description:
              'What to show. A URL, a file path (absolute or ~/-prefixed), or HTML content.',
          },
        },
        required: ['content'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'surface') {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }
  const raw = String(req.params.arguments?.content ?? '');
  if (!raw.trim()) throw new Error('surface requires non-empty content');

  const kind = classify(raw);
  let target;
  let label;

  if (kind === 'url') {
    target = raw.trim();
    label = target;
  } else if (kind === 'path') {
    target = expandPath(raw.trim());
    label = target;
  } else if (kind === 'html') {
    // Pass as file:// URL so main.js opens it in plain Chromium (skipping the
    // default-app routing that would otherwise wrap it in the doc-app editor).
    // Agent-generated HTML is render output, not an artifact to edit.
    const tempPath = await htmlToTempFile(raw);
    target = pathToFileURL(tempPath).href;
    label = 'rendered HTML';
  } else {
    // plain text — wrap and render in plain Chromium too
    const tempPath = await htmlToTempFile(wrapPlainText(raw));
    target = pathToFileURL(tempPath).href;
    label = 'rendered text';
  }

  // Fire-and-forget. The first invocation boots Electron, which then stays
  // running; subsequent invocations hit Surface's single-instance lock.
  // Detach so we don't await Electron's lifetime — but capture stderr for a
  // short window so an immediate launch failure surfaces to the agent rather
  // than being silently swallowed.
  const surfaceBin = findSurfaceBinary();
  const child = spawn(surfaceBin, [target], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  const earlyFailure = await new Promise((res) => {
    const timer = setTimeout(() => res(null), 600);
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) res(null);
      else res(`Surface exited with code ${code}. ${stderr.trim()}`);
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      res(`Failed to launch Surface: ${err.message}`);
    });
  });
  if (earlyFailure) throw new Error(earlyFailure);
  child.unref();

  return {
    content: [{ type: 'text', text: `Surface window opened: ${label}` }],
  };
});

await server.connect(new StdioServerTransport());
