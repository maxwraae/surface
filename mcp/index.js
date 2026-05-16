#!/usr/bin/env node
// surface-mcp — MCP server that gives any AI agent the ability to open
// files and URLs in Surface windows on the user's screen. Spawned as a
// stdio child by the agent host (Claude Code, OpenCode, Cursor, etc.).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const SURFACE_BIN = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'surface'
);

const server = new Server(
  { name: 'surface', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'surface_open',
      description:
        "Open a local file path or URL in a Surface window on the user's screen. " +
        "Use this to SHOW the user anything: rendered HTML, drafts, dashboards, " +
        "web pages, files. The window appears immediately. Multiple calls open " +
        "multiple windows in the same Surface process.",
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description:
              'Absolute local file path (or ~/-prefixed) OR a URL (http://, https://, file://).',
          },
        },
        required: ['target'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'surface_open') {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  let target = String(req.params.arguments?.target ?? '').trim();
  if (!target) throw new Error('surface_open requires a non-empty target');
  if (target.startsWith('~/')) target = target.replace(/^~/, homedir());

  // Fire-and-forget: the FIRST invocation boots Electron, which then stays
  // running. We must not await it or the tool call hangs forever. Detach
  // the child so it survives independently of this MCP process.
  const child = spawn(SURFACE_BIN, [target], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return {
    content: [
      { type: 'text', text: `Opened ${target} in Surface.` },
    ],
  };
});

await server.connect(new StdioServerTransport());
