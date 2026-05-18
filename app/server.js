// Embedded HTTP server. Runs inside the Electron main process when Surface
// is in daemon mode. Three jobs:
//
//   1. Serve local files over HTTP so a Surface on another machine can render
//      them in a window — GET/HEAD on absolute paths.
//   2. Accept writes from those remote renderers — PUT on absolute paths.
//   3. Open windows in *this* Surface when a remote agent or peer asks via
//      POST /_/open. This is the cross-Surface RPC.
//
// All file requests are gated through bridge/permissions.js, the same
// permission store used by the IPC bridge. At startup we pre-grant a
// synthetic "server" origin against each path in config.rootsExposed,
// so requests for files outside those roots get 403 — regardless of which
// tailnet peer they come from.
//
// Auth model for v1: trust the tailnet. The port is bound to 0.0.0.0
// because tailnet peers come in via the Tailscale interface and that's
// our boundary. If the tailnet is shared with untrusted users, this needs
// a per-peer token — out of scope for v1.

const http = require('http');
const fs = require('fs');
const path = require('path');
const urlMod = require('url');
const perms = require('./bridge/permissions');

const SERVER_ORIGIN = 'http://surface-server';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

function addBaseHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,HEAD,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function start({ config, openCliTarget }) {
  const { port, bind, rootsExposed, peers } = config;

  perms.grantOrigin(SERVER_ORIGIN);
  for (const root of rootsExposed) {
    perms.recordPathGrant(SERVER_ORIGIN, root, 'folder');
  }

  const server = http.createServer(async (req, res) => {
    addBaseHeaders(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    const parsed = urlMod.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname || '/');

    if (pathname.startsWith('/_/')) {
      return handleMeta(req, res, pathname, { openCliTarget, peers });
    }

    return handleFile(req, res, pathname);
  });

  server.on('error', (err) => {
    console.error(`[surface server] ${err.code || ''} ${err.message}`);
  });

  server.listen(port, bind, () => {
    console.log(`[surface server] listening on ${bind}:${port}`);
    console.log(`[surface server] roots: ${rootsExposed.join(', ')}`);
  });

  return server;
}

async function handleMeta(req, res, pathname, { openCliTarget, peers }) {
  if (pathname === '/_/health' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }
  if (pathname === '/_/peers' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ peers: peers || [] }));
  }
  if (pathname === '/_/open' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { url } = JSON.parse(body.toString('utf8') || '{}');
      if (typeof url !== 'string' || !url) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'missing url' }));
      }
      openCliTarget(url);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, url }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: String(err.message || err) }));
    }
  }
  res.statusCode = 404;
  res.end('not found');
}

function handleFile(req, res, pathname) {
  const abs = path.resolve(pathname);

  if (!perms.pathGranted(SERVER_ORIGIN, abs)) {
    res.statusCode = 403;
    return res.end(`forbidden: ${abs} is not under an exposed root`);
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    let stat;
    try { stat = fs.statSync(abs); } catch {
      res.statusCode = 404;
      return res.end('not found');
    }
    if (stat.isDirectory()) {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'HEAD') return res.end();
      const entries = fs.readdirSync(abs).map((n) => ({
        name: n,
        path: path.join(abs, n),
      }));
      return res.end(JSON.stringify(entries));
    }
    res.setHeader('Content-Type', mimeFor(abs));
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('ETag', `"${stat.mtimeMs}-${stat.size}"`);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs).pipe(res);
  }

  if (req.method === 'PUT') {
    return readBody(req).then((body) => {
      fs.writeFileSync(abs, body);
      res.statusCode = 204;
      res.end();
    }).catch((err) => {
      res.statusCode = 500;
      res.end(String(err.message || err));
    });
  }

  res.statusCode = 405;
  res.end('method not allowed');
}

module.exports = { start };
