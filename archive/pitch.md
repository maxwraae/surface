# Surface

**A browser that gives the web local files.**

For fifteen years, every web app has stored your data in someone else's cloud. Notion holds your notes. Figma holds your designs. Google holds your documents. Linear holds your tickets. You don't own any of it — you rent access, and you lose it the moment the company changes its mind.

Surface fixes that. It's a Chromium browser with one capability the standard browser doesn't have: it gives the web page running inside it a real local filesystem. Pages can read, write, and watch your files directly. The file is the source of truth. The web app is just an editor that knows how to render it.

This unlocks two things at once. One for the people using the web. One for the people building on it.

---

## For people

**Your data is yours, in files you can see.** Any Surface-aware web app — note editor, spreadsheet, design tool, slide deck, anything — saves to a folder on your disk. You can grep across your notes. Back them up. Sync the folder with iCloud, Dropbox, Syncthing, git — whatever you already trust. Open the files in `vim`, or Excel, or whatever else. The web app is *one of many* editors, not a vault.

**No accounts. No sign-up. No paywall to read your own stuff.** You pick a folder once; the app remembers. The app's creator never sees your files. They live on your machine.

**Your AI agent can finally show you things, not just describe them.** Today, an agent talks to you in text. If it wants to show you a draft, a chart, a layout, a working calculator, a 3D scene, a sequence diagram — it has to flatten it into prose or hand you a file you have to open somewhere else. The conversation breaks. In Surface, the agent just *shows you.* It writes HTML — which models are extraordinarily good at — and a window appears. Whatever has ever been rendered in a browser is fair game as an output medium. The agent gets visual hands.

**You and your agent edit the same files.** The agent writes a draft → it appears in your editor. You comment on a row of the spreadsheet → the agent sees it on next read. No special "AI integration" required — just shared bytes on disk.

**Offline by default.** No internet, no problem. Your apps still work. Your files are right there.

**Privacy by construction.** Nothing leaves your machine unless an app explicitly sends it. The default state of a Surface app is local.

---

## For developers

**Ship a static site that's a real app.** Add a few lines of `window.surface.*` and your web app reads and writes the user's local files. The user's disk is your storage layer. No backend, no auth, no database, no sync code, no billing system for storage. The cloud half of your product collapses.

**Standard-compatible.** Surface implements the File System Access API surface — `window.showOpenFilePicker`, `window.showDirectoryPicker`, `window.showSaveFilePicker`, the standard handle shape. Apps already written against it run in Surface unchanged. Surface-aware apps get extras: **persistent grants** (no re-picking on every page load), **push-based watch** with `byMe` self-write suppression, **mtime-based conflict detection** on writes.

**Sync is free.** Watch a file; re-render when it changes. That's the entire sync layer. The user edits the file elsewhere — your app reacts. Your app edits it — the user sees it everywhere it's open. Two-way sync as a substrate property, not something you build.

**AI-ready by construction.** Any agent that can write a file can drive your app. You don't have to add "AI features" — agents become peer-editors of your app the moment your app touches a real file.

**Differentiated UX.** Local-first apps feel categorically different. Instant — no spinners on save. Private — nothing leaves the machine. Trustworthy — the user can see and back up everything. Users notice.

**Distribution is just a URL.** Your app is a website. People who use it in stock Chrome get File System Access API behavior (with the pick-every-time friction). People who use it in Surface get the upgraded experience. One codebase, two grades of capability.

---

## How it works

```js
if (window.surface?.isSurface) {
  const handle = await window.surface.pickFile();
  let content = await handle.read();
  render(content);

  handle.watch(async (event) => {
    if (event.byMe) return;            // ignore our own writes
    content = await handle.read();
    render(content);                    // file changed externally; re-render
  });

  onEdit(async (next) => {
    await handle.write(next);           // user edited; persist
  });
}
```

That's the whole pattern. Pick once (grant persists across restarts), read, watch, write. Conflict detection, self-write suppression, and recursive folder grants are built in.

Full spec: [`docs/surface-api.md`](docs/surface-api.md).

---

## What Surface is not

- **Not a chat app.** No agent, no model, no chat UI. Bring your own — Claude Code, OpenCode, ChatGPT, voice, anything that can run a shell command. Surface is engine-agnostic.
- **Not a browser for browsing.** No URL bar, no tab strip, no bookmarks, no history. Each window is one rendered thing the agent (or the CLI) opened.
- **Not a new web standard.** Apps integrate by calling `window.surface.*` — no new HTML, no new manifests, no new framework. A normal website with three extra lines of code becomes Surface-aware.
- **Not cloud-hostile.** Apps can still talk to clouds when clouds are the right answer (real-time collaboration, mobile sync). Surface just removes the *obligation*.

---

## Why this hasn't existed

The pieces have all been around. Chromium has been the best general renderer for over a decade. The File System Access API has shipped in Chrome since 2020. Local-first as a movement has been talked about for years. AI agents now write production-grade HTML.

But:

- Chrome's File System Access API forces a picker every time. No persistent grants. Apps can't act like real editors — every session is a fresh negotiation. The friction kills the model.
- No browser is built around *agents.* Every existing browser is shaped for human navigation: URL bars, tabs, history, bookmarks, back-forward, autocomplete. The shape gets in the way when the user is the agent.
- Cloud-first web apps lock data in because that's their business model. The incumbents won't ship local-first because local-first dissolves their revenue.
- And the simplest version of this — a Chromium that gives pages a real filesystem — is so unglamorous that nobody packaged it. People who could see it just used Chrome and worked around the limits.

Surface is the integration. Not a new browser engine. Not a new format. Not a new framework. The missing primitive the web has needed since the beginning.

---

## Status

v0.2.

Working today:

- The bridge — `window.surface` plus the FSA-API subset documented in [`docs/surface-api.md`](docs/surface-api.md).
- Two-gate permissions (origin + path), persistent across restarts.
- Watch with `byMe` — SHA-1 ring buffer of self-writes, so apps never reload from their own edits.
- Conflict detection on writes (`baseMtime` → `ConflictError:`).
- Default-app routing by extension.

Next up:

- The CLI (`surface open <path-or-url>`, `surface grant <folder>`) — the universal handle for any agent to drive Surface from a shell.
- Packaged `.dmg`.
- In-app permissions UI (revoke, inspect grants).
- Recursive folder watch, async directory iterators, `removeEntry`, `move`.

The smallest interesting thing you can build on Surface is a Markdown editor in 40 lines of JavaScript. Try it.
