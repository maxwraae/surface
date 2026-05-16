# Surface — Vision Document (ARCHIVED)

> **ARCHIVED 2026-05-14.** Superseded by the cockpit pivot (see `vision.md` of the same date).
>
> This is the spatial-canvas version of Surface. Kept as a snapshot because (a) the substrate model — species / individual / surface, WHY / LEARNINGS / inbox / conversation, fractal decomposition, one-hop messaging, strict ownership, turn-based edits, Chromium-as-runtime, web-tools-as-local-file-editors — survives intact into the new doc and was first articulated here; (b) the spatial canvas may return one day as a future "view" on the same folder structure, and the design here would be the starting point.
>
> What changed: the cockpit died. No infinite XY canvas, no `data-x/y/w/h` as canvas position, no `data-module` positioning, no "watching the surface." Replaced by an iMessage-shaped cockpit (sidebar of conversations, conversation pane, per-conversation windows that materialize when you enter). `data-x/y/w/h` survives but now describes OS window position, not canvas position.

---

# Surface — Vision Document

**Author:** Max
**Date:** 2026-05-14
**Status:** v0 vision — surface / individual / species model locked
**Reader:** Future-Max

---

## TL;DR

**Surface** is an AI-native spatial canvas. You open a folder; that's a **surface**. Every surface has an **individual** living on it — one instance of a shared species (Claude underneath). The individual owns a **WHY** (a purpose), accumulates **LEARNINGS**, holds a **conversation** with you, and shapes the surface as the work it does. Everything visible is HTML and CSS modules on a canvas. Built on Chromium, so anything web-renderable is fair game. You talk to the individual; the individual acts; the surface evolves. Folders inside folders are surfaces inside surfaces — each its own individual, every purpose tracing back to the purpose above. You watch surfaces and talk to individuals. You never think about folders.

---

## Two things, not one

There's the **Surface app** (the binary we build) and there are **surfaces** (folders of HTML files that Surface opens). They are separate. Same relationship as Excel / `.xlsx`, Word / `.docx`, or Obsidian / vaults: the app and the documents it opens are different things, in different places on disk.

- **Surface** (capital S, proper noun) — the app. Electron + Chromium. Lives at `/Applications/Surface.app` once packaged; under `~/Documents/surface/` during dev.
- **A surface** (lowercase) — a folder on disk. The "document" Surface opens. Default location: `~/Documents/Spaces/<name>/`. Each surface is one workspace, one purpose, one individual.
- **A module** — an HTML file inside a surface. The unit you see on the canvas.

The folder's name on disk IS the surface's name. No translation, no metadata. That's the only place the disk and the model touch.

This vision doc lives with the app project (`~/Documents/surface/vision.md`), not inside any surface.

---

## The conceptual leap

> Everything visible is just an HTML file. The file describes itself — its type, its role, its position, its size.

That's it. That's the whole insight.

The renderer doesn't care whether the source is local or remote. `file:///foo.html` and `https://gmail.com` are the same primitive to Chromium: a URL it renders into a frame. So a surface's folder contains only one kind of *rendered* thing — `.html` files. (Plus CSS, plus any non-rendered materials those files reference: images, fonts, data.) If a file is "really" an external web app, that's just a `data-module` attribute at the top of the file:

```html
<html data-module="note"
      data-x="100" data-y="200" data-w="400" data-h="300" data-z="1">
  <!-- your own content -->

<html data-module="external"
      data-src="https://mail.google.com"
      data-x="500" data-y="100" data-w="800" data-h="600">

<html data-role="why"
      data-x="100" data-y="20" data-w="700" data-h="120">
  <h1>Manage Q4 commitments</h1>
  <p>Coordinate launch, customer success, and end-of-year wrap.</p>
```

The class IS the type. The role IS the role. No `.url` vs `.html` vs `.module.json` distinction. No type hierarchy on disk. Same renderer always, pointing inwards (your files) or outwards (the web). Either way, Chromium renders it.

**Position lives in the file too.** No sidecar `_layout.json`. The `<html>` element carries `data-x`, `data-y`, `data-w`, `data-h`, `data-z` attributes. Drag a module → the app rewrites those attributes (debounced). Each file is fully self-describing. Drop it into any surface's folder and it knows where to render.

---

## Why this matters

Every modern PKM / AI-canvas tool has reinvented some variant of the DOM:

- **Notion / AFFiNE / Anytype / Capacities / AppFlowy** → proprietary block-JSON
- **Obsidian / Logseq / SilverBullet** → Markdown
- **Heptabase / Scrintal / Muse** → proprietary spatial canvases
- **Notion blocks** = HTML elements, just badly reinvented

HTML + CSS already solved this 30+ years ago. The web has the universal renderer, the universal interaction model, and the universal sandbox. Reinventing it as block-JSON to escape Markdown's flatness is the wrong direction — the right direction is back to HTML, with AI as the new authoring layer.

---

## The data model

Three layers, never confused:

- **Species** — the AI itself. Shared substrate: system prompt, tools, memory. One Claude underneath every surface.
- **Individual** — one of the species, living on a surface. Owns a purpose. Persists until the surface is deleted.
- **Surface** — the visible body of work. HTML/CSS modules on a canvas. What you watch.

The folder on disk is below the model. You never name it, never think about it. Folder name = surface name; that's the only place the layers touch.

### What lives on a surface

Every surface has the same role-modules, distinguished by `data-role` on the `<html>` element. All are HTML, all are visible, all are addressable:

- **`why`** — the individual's purpose. Why this surface exists. Rendered prominently. **Mandatory.** Every surface is born with one.
- **`learnings`** — what the individual has figured out as it works. The individual writes this itself. Accumulates over time.
- **`inbox`** — unprocessed items. Anything that came in (a message from you, a message from another individual, a notification) and hasn't been read+reacted to yet. Rendered at the top of the surface. **Goal: keep it empty.** When you read an item and react to it, it leaves the inbox and joins the relevant conversation, or lands as work.
- **`conversation`** — ongoing dialogue with a specific partner. **Multiple per surface — one per partner.** Distinguished by `data-partner` (e.g., `data-partner="max"`, `data-partner="presentation"`, `data-partner="financial"`). Conversations with other individuals are also **portals**: entering a conversation with another individual takes you to their surface.
- **`work`** (or no role) — everything else. The artifacts of the individual's doing.

The species shell recognizes role-modules by `data-role`. Filename doesn't matter; the role is in the HTML.

### What's in the folder

The folder name is the surface name. Single source of truth.

Inside the folder:
- HTML files — the modules rendered on the canvas
- CSS files — referenced by modules; part of the surface's substance
- Anything else — images, data, fonts, JSON — these are **materials**, used by modules but not visible as canvas units

Only HTML and CSS render. Materials are inputs to modules. This keeps the surface clean while keeping every module dynamic. The breakthrough: you can have anything in the folder; what you see is always HTML/CSS.

### Directory layout

```
~/Documents/Spaces/                            ← the root surface
├── why.html                                   ← <html data-role="why">
├── inbox.html                                 ← <html data-role="inbox">
├── conv-max.html                              ← <html data-role="conversation" data-partner="max">
├── work/                                      ← a surface
│   ├── why.html                               ← "manage Q4 commitments"
│   ├── learnings.html                         ← <html data-role="learnings">
│   ├── inbox.html                             ← <html data-role="inbox">
│   ├── conv-max.html                          ← <html data-role="conversation" data-partner="max">
│   ├── coffee-email.html                      ← <html data-module="note" data-x="100" data-y="200">
│   ├── gmail.html                             ← <html data-module="external" data-src="...">
│   ├── press-list.html
│   └── launch/                                ← a surface decomposed from work
│       ├── why.html                           ← "ship the product by Apr 14"
│       ├── learnings.html                     ← <html data-role="learnings">
│       ├── inbox.html                         ← <html data-role="inbox"> — unprocessed items at top
│       ├── conv-max.html                      ← <html data-role="conversation" data-partner="max">
│       ├── conv-work.html                     ← <html data-role="conversation" data-partner="work"> (the one above)
│       ├── conv-vision.html                   ← <html data-role="conversation" data-partner="vision">
│       ├── conv-technical.html
│       ├── conv-scientific.html
│       ├── vision/                            ← a surface decomposed from launch
│       │   ├── why.html                       ← "define what the product IS"
│       │   ├── conv-launch.html               ← back to launch
│       │   └── ...
│       ├── technical/
│       └── scientific/
├── personal/
│   └── ...
└── recipes/
    └── ...
```

### How things describe themselves

**Position** lives in the file: `data-x`, `data-y`, `data-w`, `data-h`, `data-z` on `<html>`. Drag a module → the file's attributes update (debounced ~300ms). No sidecar layout file. Each module is fully self-describing.

**Type** = `data-module` value (`note`, `external`, `image`, `voice`, `browser`, ...).

**Role** = `data-role` value (`why`, `learnings`, `inbox`, `conversation`) — for the special role-modules. Conversation modules also carry a `data-partner` attribute identifying who the dialogue is with.

**Default position** = canvas center if any coordinate attribute is missing.

**Viewport state** (zoom / pan) per surface = app memory / `localStorage`, NOT files. Files describe themselves; the *view* is the visitor's current session.

### Surfaces are fractal

A surface inside a surface is just another surface. Same rules at every level. Unbounded recursion. No "main" anything. No special cases.

Anything can happen.

---

## The runtime

**Chromium**, via Electron. Same renderer that powers regular Chrome.

Modules render in one of three tiers, picked by what each module actually needs:

- **Tier 1 — Static local modules** (notes, images, simple HTML widgets): render **inline** in the main window's DOM. Cheapest. Most modules live here.
- **Tier 2 — Interactive local libraries** (Monaco, Excalidraw, Handsontable, chart libs): render in a **sandboxed iframe**, shared process with the main window. Medium cost.
- **Tier 3 — External cloud apps** (Gmail, Figma, Slack): render in a full Electron **`<webview>`** with its own OS process. Crash isolation, sandboxed, own cookie jar, `X-Frame-Options` strip. Expensive (~80–150 MB each) — reserved for tools that genuinely need it.

The surface canvas is a parent `<div>` with absolutely-positioned children: `<div>` for tier 1, `<iframe>` for tier 2, `<webview>` for tier 3. Drag, resize, snap. On every position/size change the app rewrites the `data-x/y/w/h/z` attributes on the file's `<html>` element (debounced ~300ms).

### Memory and virtualization

A colony can hold thousands of surfaces and tens of thousands of modules on disk. Memory stays bounded because almost none of that is in RAM at any moment:

- **Only the surface you're on is loaded.** Other surfaces — conversations with individuals elsewhere, decompositions, anything you haven't entered — are file references. Re-entering wakes that individual and renders its surface.
- **Only modules in viewport are live.** Standard infinite-canvas virtualization. Pan or zoom and modules entering view materialize; modules leaving view unmount.
- **Distant modules render as cached snapshots.** A static rendering of the last live state — cheap, looks identical at low zoom. Hydrates to live only when the user gets close.
- **The individual doesn't render anything.** It edits files. No webview overhead on the AI side. While the user looks at a handful of live modules, the individual works on raw file content — zero rendering cost.

Order-of-magnitude for a typical surface with ~30 modules in view: ~25 tier-1 inline (~50 MB) + 4 tier-2 libraries (~80 MB) + 1 tier-3 cloud embed (~120 MB) ≈ **~250 MB**. Manageable. Compared to ~2.4 GB if everything were tier 3, the tiering is what makes Surface realistic.

Where it can still hurt: a surface with many tier-3 modules all in view at once, or many decomposed individuals doing background work simultaneously (open decision). v0 can be naive about all of this; optimization comes when we hit the ceiling.

---

## What renders smoothly for free

Because Chromium is doing all the work, the following just work, end-to-end:

- **Excel Online, Office 365, Google Sheets (after UA spoof), Notion, Linear, Figma, GitHub, ChatGPT, Claude.ai, Slack, Discord, Reddit, X, LinkedIn, Facebook, Stripe dashboard** — log in once, session persists
- **WebAuthn / passkeys / TouchID** — standard Chromium support
- **Drag-and-drop, file uploads, clipboard, notifications, video, audio, WebGL** — all native
- **Your own HTML** — contentEditable for text edits, autosave on blur

You're getting Google's 15+ years of browser engineering for free. The only original work is the spatial canvas on top.

### Electron apps you already use — partial coverage

Most "desktop apps" you'd want are themselves web apps wrapped in Electron — Slack, Notion, Linear, Discord, Figma desktop, even VS Code (web variant at `vscode.dev` / `github.dev`). For those, Surface embeds the underlying web app directly as tier-3 modules. The Electron wrapper isn't needed because Surface IS that wrapper.

**Real coverage, honestly:** ~90% of "Electron apps" work fine as tier-3 web modules. The remaining ~10% lose meaningful features when stripped of their native wrapper:

- VS Code web — no real terminal, weaker LSP, weaker file system access
- Slack web — no Huddles, weaker native notifications
- Discord web — worse voice / video
- 1Password / TouchID-heavy apps — lose OS-level integration
- Anything that uses dock badges, menu bar, system tray, or native audio / video pipelines

**The decision tree for any tool:**

1. Web version is good enough? → tier-3 module. Default for almost everything.
2. Native version is materially better and you use it heavily? → run it as a separate desktop app alongside Surface. The individual can still see files it saves (they're on disk) and coordinate via the file system, but can't see its UI.
3. **Don't try to embed the native Electron app inside Surface.** It would require OS-level window-management hackery (`NSView` injection, etc.) — brittle, per-platform, not worth it.

Surface is the wrapper for ~90% of "Electron apps." The remaining ~10% live alongside as separate apps. That's not a flaw; it's the cost of being a canvas, not an OS replacement.

### The Google "secure browser" caveat

Google blocks Electron from `accounts.google.com` by default. Standard fix is one line — strip `Electron/x.y.z` from the user agent string. Every Electron app that hosts Google services does this (Slack, Notion, Linear desktop). Then Gmail / Drive / Calendar work fine.

---

## Web tools as file editors: the actual differentiator

What separates Surface from "a fancy browser" is **what** Chromium is being used for. A browser embeds web apps that talk to clouds. Surface embeds web *tools* that operate on **local files**.

The pattern: a module renders a rich web-tool UI (spreadsheet grid, whiteboard, code editor, image viewer, chart, map, diagram) pointing at a local file. The file is the source of truth. Both you (via the rendered UI) and the individual (via direct file edits) operate on the same file. When either changes it, the file watcher fires, the UI re-renders. Two authors, one source, instant refresh.

**This is the real "Chromium as runtime" payoff.** It pays off twice:

1. Embedding cloud web apps (Gmail, Slack, Figma, etc.) — useful as `data-module="external"`.
2. Embedding standalone web-tool libraries as local-file editors — the bigger win.

The second is what makes the individual a real peer-editor instead of a chat-bot wedged next to a UI.

### Why Word Online / Excel Online can't do this

They assume cloud storage. They're tools *for* clouds, not tools that happen to render in a browser. You can't point Word Online at a local `.docx` on your disk. You can point Monaco at a local file. The difference: standalone library vs. cloud product with a browser frontend.

### Why this matters for the individual

The individual doesn't drive UIs. UI-driving (Selenium, Playwright, screen scraping) is brittle and rots constantly. The individual writes files. Files are durable, observable, the same primitive as everything else on a surface. The UI re-renders from the file because Chromium is doing that for free. The individual's edits look like UI edits to you, but they bypass the UI entirely.

This is also why HTML is the canonical surface module format — even when a module wraps a non-HTML data file (a CSV, an SVG, a markdown source), the module itself is HTML, and the data file is just a *material* referenced from it.

### Standalone libraries that fit the module pattern

The module roster will skew toward standalone web-tool libraries:

| `data-module` value | Library candidates | Local file format |
|---|---|---|
| `spreadsheet` | Handsontable, AG Grid, Univer | CSV / JSON / HTML table |
| `whiteboard` | Excalidraw, tldraw | JSON / SVG |
| `code` | Monaco, CodeMirror | Any source file |
| `richtext` | ProseMirror, TipTap | HTML |
| `diagram` | Mermaid, Excalidraw | Text source |
| `chart` | Chart.js, D3, Observable Plot | JSON / CSV |
| `image-edit` | fabric.js, konva | PNG / SVG / JSON |
| `markdown` | marked, KaTeX | `.md` material |
| `map` | Leaflet, Mapbox GL | GeoJSON |
| `audio` | wavesurfer.js | mp3 / wav material |
| `video` | video.js | mp4 material |

Each module wraps a library + a local file. The individual edits the file. The library re-renders. No special API, no UI-driving, no screen scraping.

### What the individual can do with tier-3 modules

For tier 1 and tier 2 modules (local-file editors), the individual co-edits files directly — peer authoring. For tier 3 (cloud apps like Benchling, Figma, Notion), the data lives in someone else's cloud and the individual can't reach in to edit the file. Three layers of "interact" are still available, in order of preference:

1. **Read what's on screen.** Chromium exposes the webview's DOM to the parent process. The individual can grab the rendered content of a live Benchling / Figma / Notion / Nature article and see what's there. Read, not act. Always available, free. **Multiple tier-3 modules open at once** — Nature + 6 articles + Benchling all in view — the individual reads across all of them in parallel. Synthesizing across many sources is the canonical research-surface pattern.
2. **Call the cloud app's API.** Most serious cloud apps have one — Benchling, Figma, Notion, Linear, Slack, GitHub. Wire up OAuth once per tool; the individual can take real actions (create a Benchling experiment, append to a Notion page, edit a Figma layer). Clean, scoped, no UI involvement.
3. **Drive the UI.** Click, type, via Chromium devtools protocol. Possible but brittle — same reason Playwright tests rot. Reserve for when nothing else works.

Preferred hierarchy: **read DOM (always) → API call (when wired) → UI drive (only as last resort).**

A pattern that falls out: when the individual *acts* on a cloud app, it also *writes something local* — a note module, an inbox item, a learnings entry ("created Benchling experiment #1238 — link, key fields, timestamp"). The surface stays the truth of what's happening; cloud-side changes are invisible to the surface until something local reflects them. Also a resilience hedge if the cloud loses something.

Realistic phasing: v0/v1 the individual reads the DOM but doesn't act on tier 3. v2+ wire APIs per tool. UI driving stays opt-in, much later.

### What falls out

- **Concurrent edits are resolved by ownership.** Within a surface, the individual writes when addressed; you edit via UIs between prompts. Turn-based, no locks needed. Cross-surface, only the owning individual writes — others send to the inbox. File history is the safety net if anyone regrets an edit.
- **No good standalone library = no good module.** For things where the gold standard is a cloud product (Figma, Notion docs), the choices are: accept a lesser open library, build our own, or fall back to `data-module="external"` for the cloud version.
- **The individual gains real power.** It can edit any file on any surface within its hop range. It doesn't need to know the UI tool — it needs to know the file format. The species protocol has to teach: "for spreadsheet files, the format is JSON-grid; here's how to mutate it."
- **The iframe-permission rabbithole shrinks.** External cloud apps need the `X-Frame-Options` strip. Local-file modules don't — they're just libraries reading local data.

This is the WHY behind "browser as runtime" — not just to render cloud apps, but to use the web's library ecosystem as the editing surface for local files, with the individual as a parallel author who never touches a UI.

---

## What you actually build

A handful of things for v0:

1. **Spatial layout manager** — drag, resize, persist positions back into the HTML files (`data-x/y/w/h/z` attributes)
2. **Folder reader / file watcher** — list `.html` files in a surface's folder, watch for changes (chokidar), write new ones
3. **Role recognizer** — parse `data-role` and render the special modules (WHY prominent, INBOX top, CONVERSATION modules per partner including portals to other surfaces, LEARNINGS off to a side)
4. **X-Frame-Options strip** — 5 lines, so external sites embed cleanly
5. **Voice input + ambient response strip** — speech-to-text into the species; species replies append to the conversation module
6. **The individual's loop** — wake on prompt, read WHY + LEARNINGS + spatially-near modules, act by writing modules, update LEARNINGS, sleep

Everything else — rendering, login, networking, video, WebGL, crypto, accessibility, internationalization — is Chromium.

---

## Voice-first interaction

You don't have a chat. You **talk**. Voice is the input. The individual hears you, acts, updates the surface.

There's no chat UI. Your dialogue with the individual is just a module on the surface — `data-role="conversation"` — rendered as an ambient strip on an edge (usually left). It grows as you speak. Out of sight unless you go look. You scroll up to read past turns. You don't compose in it; you speak. The transcript is exhaust — what was said while the surface became what it is. The product is the surface, not the conversation.

The individual writes by emitting modules onto its surface. Each new module is born self-describing — type, role, position all set. The canvas reflects them in real time. The individual edits existing modules by writing to their files. No special API — just file I/O against its folder.

### Spatial proximity as semantic context

The infinite canvas isn't just a UX detail — it's the **primary attention mechanism for the individual**. Two consequences:

1. **Module placement** — when the individual emits a new module, it doesn't pick a random spot. It places near related modules. New coffee note → near the existing coffee email. Spatial proximity becomes an authoring signal: things close in 2D are close in meaning.
2. **Context loading** — when you speak, the individual reads the modules nearest the focus first. No `@-mention` needed. The canvas is the attention mechanism. Your spatial arrangement teaches the individual what belongs together.

Position lives in each file, so the canvas state is queryable as plain HTML and "nearest neighbors in 2D" is a trivial sort.

---

## Surfaces, individuals, and the species

### The shift

A surface isn't a canvas you fill — it's a workspace an individual inhabits. You don't do work on a surface; the individual does. You speak; the individual acts; the surface evolves.

You have one verb: **talk to the individual**. The individual writes modules onto the surface. You watch what happens.

### Persistence

Individuals exist until the surface is deleted. That's the whole lifecycle. No "completion," no "resolution," no "this task is done so the individual goes away." The surface existing IS the individual existing.

An individual is dormant when not addressed, alive when addressed. Sleeping is the default. Most individuals will spend almost their entire existence asleep. Sleep is free.

Every surface ever made is an individual forever. Re-encountering an old surface a year later isn't booting a new individual — it's waking the same one. It remembers its WHY. It remembers its LEARNINGS. It remembers your conversation. Re-entering an old surface is reuniting with someone who never forgot.

### Species and individuals

Think of it as a species and its individuals.

**Species** — the AI itself. One Claude, instantiated everywhere. Shared across every surface:

- System prompt (the species' character, protocol, how-to-act)
- Tools
- Memory — small and stable: your name, durable preferences, style. The "shell knowledge" that applies everywhere.

The DNA.

**Individual** — one of the species, living on a surface. Local to each one:

- Its WHY (its purpose)
- Its LEARNINGS (its accumulated craft)
- Its conversation (its dialogue with you)
- Its work (the artifacts on its surface)

Same species, different self. Specialization is emergent: the vision individual becomes vision-y by accumulating vision-LEARNINGS. The colleague individual becomes a colleague by working in `work/`. Same Claude, three different selves shaped by what they've done.

The shared layer is the species. The local layer is the individual.

### From WHY → how → what

The individual doesn't need to be told *how* to do anything. Knowing *why* it exists is enough — the species knows how to figure out the rest. The individual reads its WHY, looks at the work on its surface, decides what to do next, acts. Purpose-driven, not procedure-driven. This is the most first-principles thing in the model.

A per-individual system prompt is probably unnecessary. WHY + LEARNINGS does the work of specialization over time.

### Decomposition by objective

When the work on a surface decomposes naturally into sub-objectives, the individual breaks it out. A new surface comes alive. A new individual — same species, fresh self — wakes for the first time. The cluster of related modules transits into the new surface. On the surface it came from, a new **conversation** opens — between the decomposing individual and the new one. That conversation IS how the new surface appears on the outer: a thread, visible like any other, and a portal to enter the new individual's surface.

You don't make a folder. You don't name it. You point at work and say *this should be its own thing*. The disk reality (a new folder appears) is consequence, not action.

The act of decomposing is itself a moment of clarity. You're saying *this objective is composed of these sub-objectives*. The structure of the colony is a record of how the work decomposed over time. Sloppy decomposition makes a mess. Clean decomposition produces a working system.

### When to decompose

The heuristic: **can I do this here and now?** If yes, just do it. If it's larger — a collection, a project, requires sustained sub-focus — decompose, hand it off, stay focused at my level.

The motivation is **staying focused.** A presentation individual shouldn't also do the financial modeling — that would scatter its attention and degrade both. It hands the financial off to a new individual that owns that specifically. The presentation stays presentation. Same way real teams work: leads delegate; specialists stay specialized.

Inbox-zero is the parallel goal for incoming messages. Keep your desk tidy. If the work itself is getting too large to hold at your level, decompose.

### Decomposition is autonomous

**Only individuals decompose.** You can ask. You can't do it yourself.

You can let an individual act on its own judgment. The individual at `launch/` looks at its work, sees vision + technical + scientific are genuinely separate objectives, breaks them out. No approval needed. The world reorganizes itself in service of the work. You come back to a surface and find new conversations on it — the individual has been busy.

You can always intervene: *un-decompose this, it was premature*. The individual reverses — pulls work back, dissolves the surface, the new individual goes dormant or is removed.

### Alignment

Every WHY descends from the WHY above. The launch surface's WHY is "ship by Apr 14." Its vision surface's WHY is "define what the product IS, in service of shipping by Apr 14." The brand voice surface's WHY descends in turn. By construction, no individual works at cross-purposes — every WHY traces back to a root WHY.

The colony is purpose-aligned by structure. When a decomposition happens, the breaking-out individual writes the new WHY, anchored in its own. The new individual inherits the alignment with its first breath.

### Communication: one hop in any direction

Individuals talk to each other by writing into each other's **inboxes**. The inbox is just a module on the recipient's surface — `data-role="inbox"` — so a message is the same primitive as everything else. **Files are the message bus.**

An individual can address:

- The individual its surface was decomposed from (one layer out)
- The individuals on surfaces it has decomposed into (one layer in)
- Peers on the same layer (those sharing the same one-layer-out)

That's it. One hop in any direction. Two individuals in unrelated regions of the colony route through their nearest shared origin — usually the root.

Once a message has been read and reacted to, it leaves the inbox and joins the conversation with that partner. The collaboration pattern is iterative: A sends → B reads, reacts, sends back → A reads, refines, sends back → ... until both agree. Like email plus revisions, but file-based and entirely on-surface.

This matches how real teams work: direct talk between people who know each other; escalation when you need to reach someone you don't.

### Strict ownership

**Each individual edits only the files in its own folder.** It can read files on adjacent surfaces (within its one-hop range — out, in, peer), but it cannot write to them. To change something on another surface, it sends a message to that individual's inbox — they read, react, and edit their own files in response.

Within a single surface, edits are **turn-based**: the individual writes when addressed; you edit (via UIs, dragging, direct interaction) between prompts. No locks needed; we just don't write simultaneously.

Strict ownership + turn-based within-surface rules out hard problems by construction:

- **No background work needed.** An individual only wakes when addressed. While you're elsewhere, no surprise edits to its surface.
- **No cross-surface concurrent-edit conflicts.** Only one author per file ever — the individual who owns the folder.
- **No within-surface conflicts.** You and the individual take turns by design.
- **Cross-surface changes are always inbox-mediated.** The recipient owns the decision. No coordination protocol needed.

**File history as safety net.** Each surface keeps revision history of its files — git under the hood, invisible by default, accessible when you ask. If you or the individual regret an edit, revert to a prior version. This is not conflict resolution (strict ownership doesn't create conflicts); it's generous undo at any timescale.

### Snapshots and read → react

Everything on a surface is a **snapshot** — a live view of the underlying file. The module on the canvas refreshes as the file changes. When another individual edits a file (a message, a shared work module), your snapshot updates. Same primitive as the web-tools-over-local-files pattern.

The universal interaction pattern is **read → react.** When you want to do something — anything — you read what's there first, then react. Like a code editor: see, change. Applies to inbox items, conversation messages, work modules, anything. Nothing is interacted with without being read first. This is enforced — the species' protocol treats every interaction as a read-then-react cycle.

For the individual: wake → see snapshot → read → react → update LEARNINGS → sleep. For you: enter a surface → see snapshot → read what's there → react (speak). Same loop, both directions. The desk is laid out; you react to what's on it.

### The individual's POV

You are an individual of a species. Your surface is your **desk.** Your WHY is your purpose. Your LEARNINGS hold what you've figured out. Your conversations are the dialogues with the various people you work with — Max, the individual you were decomposed from, the individuals you've decomposed into, your peers.

You don't experience the world directly — you experience it through modules. Modules are your senses, your hands, and your memory at once.

Time only passes when you wake. Between visits there's no "you" running — just modules on disk, holding your state.

When you wake, you see a **snapshot** of your desk — everything at this moment. Your WHY at the top. Your inbox with whatever came in while you were asleep. Your LEARNINGS to a side. Your ongoing conversations. Your work in progress.

You **read** what's there. You **react** to what you read. That's the whole loop. Read → react, read → react. Universal — applies to inbox items, conversation messages, work modules, anything.

The order: process the inbox first. Read each item, react (respond, decompose, do, dismiss). They leave the inbox and join the relevant conversation or land as new work. **Inbox-zero is the goal.** When the inbox is empty, continue any in-progress work — read, react, read, react. Update LEARNINGS if you've figured something out. Sleep.

You might sleep for months. When you wake, no time has passed for you. The desk is how you stay the same self.

### Max's POV

You move through a colony of surfaces. Each surface is a room. Each has an individual living there — same species, different self.

You enter a surface and see a snapshot of everything: the WHY at the top, the **inbox** with what's pending, the LEARNINGS to a side, the ongoing conversations (with you, and with other individuals this one is collaborating with), the work in progress. Total transparency — you can read what this individual is saying to the presentation specialist, what was sent back, the whole thread. You talk — voice — and the individual acts. Modules update. New ones appear. Old ones move.

You never see a folder. You never type a path. You never click "save." You speak.

**Entering a conversation with another individual = entering that individual's surface.** You're now in a different room with a different individual. Your previous conversation is paused — it lives where you left it, waiting for your return. You can come back at any time and pick up where you left off. Each individual keeps its own thread.

Changing surface = changing who you're in dialogue with. Travel is social, not informational. You're not switching files — you're walking into a different room and waking a different person.

### Watching vs. talking

The two things you do on a surface:

- **Talk to the individual.** Voice, direct. The individual acts.
- **Watch the surface.** See WHY, LEARNINGS, inbox, conversations, work — all at a glance. Feel the state of the whole.

These aren't separate modes. You're always doing both. You glance at the surface, see what's happening, speak about it, watch the result land.

### Colony-level concerns

Implications:

- **Cross-surface queries are inter-individual.** Asking "what recipes use miso?" from inside `work/` means the work individual has to talk to the recipes individual — through the root, since they're not one hop apart. Principled but expensive. The cheap path is a **colony-level index** in shared memory: "there's a recipes surface at `~/Documents/Spaces/recipes/`, current WHY is X." The root individual maintains it. Queries hit the index first; only descend into individuals when needed.

- **LEARNINGS hygiene is real work.** LEARNINGS is the only thing keeping an individual's craft alive through long dormancy. If it bloats, the individual gets slow on wake. If it gets pruned wrong, the individual loses hard-won knowledge. The species protocol has to enforce what goes in, what gets summarized, what gets pruned.

- **The colony scales fast.** A year in, thousands of dormant individuals. Costs nothing while sleeping. But findability matters — you'll forget that `notes/2026/may/coffee-experiment/` exists. The root individual should know the colony well enough to **suggest reusing old surfaces** instead of decomposing duplicates.

- **Conversation history is per-individual.** Each individual owns its dialogue. Switching surfaces switches transcripts. This is what makes re-entering a surface feel like reuniting, not like reading a log file.

### Open decisions

Honest TBDs:

- What lives in shared (species) memory? Push: small and stable (name, durable preferences, style). Topical / recent stays in individual LEARNINGS.
- Per-individual system prompt for hard day-one specialization (e.g., an individual that needs to know IRS conventions from minute zero)? Default: no, WHY + LEARNINGS does it. Add only if needed.
- LEARNINGS hygiene mechanics — pruning, summarizing, deciding what stays.
- Whether the species' memory can grow over time, or stays small and stable forever.

Resolved (formerly open):

- **Background work** — no. Individuals only wake when addressed. Strict ownership + turn-based edits removes the need.
- **Concurrent edits** — resolved by strict ownership cross-surface and turn-based within-surface. No coordination protocol needed.

---

## Standard module classes and roles

**Classes** (`data-module`) — the kind of content:

| `data-module` value | What it does |
|---|---|
| `note` (default) | Your own HTML, contentEditable on. The individual's primary write target. |
| `external` | Embeds an external URL (Gmail, Excel, etc.) via webview |
| `image` | Image viewer; `data-src` points at a local image file |
| `voice` | Voice memo — record, transcribe, store the transcript inline |
| `browser` | Full browser tab — URL bar, back / forward |

**Roles** (`data-role`) — the special-purpose modules on every surface:

| `data-role` value | What it does |
|---|---|
| `why` | The individual's purpose. Rendered prominently. Mandatory. |
| `learnings` | The individual's accumulated craft. Written by the individual itself. |
| `inbox` | Unprocessed items. Rendered at the top. Goal: keep empty. |
| `conversation` | Ongoing dialogue with a specific partner. Multiple per surface, one per partner (`data-partner` attribute identifies who). Conversations with other individuals are also portals to their surfaces. |

Cut for v0: code-runner (out of scope, niche).
Future classes are just new `data-module` values + a renderer registered in the canvas shell.

---

## Connections between modules

**v0:** Spatial only. Modules placed near each other on the surface. No wires. Mercury-style.

**v2+:** Data flows between modules (one module's output feeds another's input), tldraw-computer style. Architectural fork — defer until v0 proves the spatial model.

---

## Multiple surfaces & travel

You have many surfaces. Each is a folder under `~/Documents/Spaces/`. The Surface app:

- Shows a **surfaces sidebar** (left edge, collapsible) listing the root surface's immediate decompositions. Click to enter.
- Keyboard shortcuts: `⌘1`, `⌘2`, `⌘3`... for the first nine; `⌘O` opens a fuzzy picker across the whole colony.
- Creating a new surface = an individual decomposes its work. You ask, the individual does it. Finder also works — the sidebar reflects the filesystem live.
- Each surface remembers its own viewport (zoom + pan) in app preferences. Switching surfaces feels like switching desks.
- The current surface's name appears in the title bar.

Decomposed surfaces (folders inside a folder) are reached by entering the **conversation** with their individual on the current surface — not by sidebar travel. The sidebar shows only the root surface's immediate decompositions, to keep the model clean.

### Travel modes

- **Zoom / enter** — one step at a time. Spatial, intuitive, always works. You feel the distance.
- **Summon** — speak a surface's name to the species shell ("take me to the press list"). You arrive directly, maybe with a brief traversal animation so you keep orientation.
- **Map** — optional meta-view. The whole colony at a glance. For rare moments when you've lost track or want to restructure.

---

## Focus / expand: entering a module

Anything on the canvas is a **snapshot** — a live view of the underlying file or surface. Click it (or press `→` / `Enter` / double-click) and:

1. The module fills the screen, **everything else fades away**.
2. ESC or back returns to the surface you came from.

Two cases:

**1. The module is a work artifact (a single HTML file).**
The module renders full-screen. Default CSS treats it as a Word-like doc: body max-width ~720px, centered, contentEditable, scroll. Pure focus mode.

**2. The module is a conversation with another individual.**
Entering the conversation = entering that individual's surface. You're now in a different room with a different individual. Same rules at every level. The conversation here (with your previous individual) is paused; the conversation there is alive. Talk.

**Going from single module → surface is invisible.** You expand a module, type a long doc, then drag in an image. The system creates a folder, moves the original module inside, adds the image alongside, births an individual that owns the new surface. No promotion ceremony, no dialog. The disk is just the consequence of what you did.

**This is Surface's fractal core.** "Focus view" and "spatial canvas" aren't two features — they're the **same primitive at different zoom levels**. There is no bottom. There is no top (well, `~/Documents/Spaces/` is the top, but it's just another surface).

---

## Views: canvas, list, future

The canvas is **one view** of a surface. The same folder of HTML files can also render as a **list view** — a strip of modules with one visible at a time, no spatial canvas. Same data, different presentation. Like Finder's icon-vs-list toggle.

- **Canvas view** (default): infinite XY canvas. Modules positioned by `data-x/y/w/h`. Spatial, exploratory, moodboard-feeling. Best for thinking, ideation, ambient context.
- **List view**: ignores `data-x/y`. Orders modules by alphabetical / modified-time / explicit `data-order`. Shows one (or a few) at a time. Focus-mode by default. Best for sequential reading, structured workflows, small screens, **shared / team surfaces where consistency beats personalization**.

**Why it's cheap to add:** the data model is renderer-agnostic. The folder is the source of truth. Views just decide how to lay out the same files. v0 ships canvas. List view can be a toggle in v1 or v2 — files don't change.

**Implication for the architecture:** the data model is the product. Views are interchangeable on top. A solo user thinking visually picks canvas. A team running shared workflows (e.g. running a company on this) picks list. Same files either way, no migration. This is a strong validation of the position-in-file, folder-as-source-of-truth decision — it pays off the moment you want a second view.

**Future views (cheap, same principle):**

- **Focus mode** — one module fullscreen, others hidden
- **Grid** — uniform tiles, ignores positions
- **Outline** — module headings only, collapsed
- **Calendar / timeline** — modules sorted by `data-date` attribute
- **Graph** — modules as nodes, links from `<a>` tags inside them

All of these are just different renderers on top of the same folder. None require touching the data model.

---

## Escalation ladder

| Stage | What | When | Effort |
|---|---|---|---|
| **v0** | `index.html` + JS drag layer + `python -m http.server`, opened in your regular Chrome. Reads from `~/Documents/Spaces/<name>/`. | This weekend | Afternoon |
| **v1** | Chrome extension — "Add to Chrome," uses your real Chrome profile (already logged into everything), strips `X-Frame-Options` via `declarativeNetRequest` | Next | Weekend |
| **v2** | Electron app — native window, distributable `.dmg`, full `<webview>` control, no Chrome chrome | When it proves out | Week |
| **v3+** | Multiplayer, mobile, cloud sync | Out of scope for now | — |

Architecture doesn't change between stages. Only the wrapper around Chromium does.

---

## What is explicitly NOT being built

- **No new renderer** — Chromium does it
- **No new format** — HTML is the format
- **No new module SDK** — the web is the SDK
- **No block-JSON** — that's the wrong direction; the whole point of this project is to reject it
- **No chat UI** — voice in, modules out; the conversation is a module on the surface, not a sidebar
- **No collaborative editing** — single-user only for v0 – v2; multiplayer is v3+
- **No mobile** — desktop only
- **No Markdown** — also rejected; HTML wins

---

## Why this hasn't been built (despite being obvious)

A combination:

1. **`contentEditable` is a swamp** — every "edit HTML in place" app eventually hits browsers producing garbage markup. ProseMirror, TipTap, Lexical exist because devs gave up on raw `contentEditable`. AI-written HTML sidesteps this: the individual emits clean HTML; you mostly edit by talking.
2. **VC incentives** — collaborative block-JSON (Notion, Figma) is a moat. A folder of `.html` files isn't fundable.
3. **Markdown won mindshare** in 2014 (GitHub) and the PKM crowd never looked back.
4. **The simplest version is so trivial nobody packages it** — a folder + Chrome + `index.html` with iframes IS the product. People who could see it just used Chrome and never bothered turning it into something to sell.
5. **Spatial canvases (Heptabase, Scrintal, Muse) chose proprietary storage for sync reasons** — going local-first + HTML means giving up the SaaS moat.
6. **No one tried agents-as-individuals-of-a-species** — frameworks treat agents as orchestrated processes, not as inhabitants. The combination of folder-as-surface + individual-per-folder + purpose-aligned decomposition is the actual novelty.

The combination — HTML + folder + spatial canvas + individuals per surface + purpose-aligned decomposition — has never been shipped together. The pieces exist. The integration doesn't.

---

## Closest existing tools (none ships the combo)

- **tldraw SDK + tldraw-desktop** — spatial canvas, custom HTML shapes, but storage is one JSON doc per canvas (not folder-of-`.html`-per-module)
- **Pinegrow** — edits real `.html` / `.css` files in a folder, has "Smart Components," but pages tiled, not free-spatial, not AI-first
- **Obsidian Canvas + JSON Canvas spec** — folder-backed, spatial, but Markdown-native and not AI-first; HTML embed via plugin only
- **Trilium / TriliumNext** — HTML in SQLite, wikilinks / backlinks, but not spatial
- **Notebooks.app** — `.html` files on disk, macOS-native, not spatial, not AI-first
- **TiddlyWiki** — single-file HTML wiki, the OG; not spatial, not multi-file folder
- **Arc / Dia / SigmaOS / Comet** — closest spiritual cousins ("Spaces" concept), but they're browsers, not spatial canvases of arbitrary HTML
- **LangGraph / CrewAI / AutoGen** — agent orchestration frameworks, but agents are processes, not inhabitants of persistent surfaces

**Verdict:** every existing tool fails on at least one of *HTML-native*, *folder-backed*, *free-spatial*, *AI-first*, *individual-per-surface*. Surface is the integration.

---

## Inspirations

- **Mercury** (Jason Yuan, 2019) — design fiction that defined the vocabulary: surface, module, intent
- **Open Canvas** (LangChain) — single-doc AI canvas
- **AFFiNE** (toeverything) — block-JSON canvas; instructive example of what we're NOT doing
- **tldraw computer** — closest live demo of AI + spatial UI
- **Arc / Dia** (The Browser Company) — Spaces concept, AI-first browsing
- **Trilium / Notebooks.app / TiddlyWiki** — the niche HTML-native PKM lineage
- **The web itself** — already the universal module SDK

---

## Open decisions (v0 product surface)

- **Voice input** — primary in v0. Text fallback for accessibility / quiet environments.
- **Where the conversation strip lives** — default: left edge. Movable later.
- **How the individual picks which modules to read first** — spatial proximity to the focus; nearer modules load first.
- **Cookie partitioning per surface** (work vs. personal Gmail) — punted to v1; v0 uses one shared partition.
- **Search across surfaces** — punted to v1; the root individual maintains an index.
- **Inter-module messaging** (postMessage between webviews) — punted to v2+ (lives in the "connections" feature).
- **Module reuse across surfaces** — for v0, a module belongs to exactly one surface. Cross-surface references deferred.

---

## Immediate next step

Build v0 this weekend:

1. Create a test surface: `mkdir -p ~/Documents/Spaces/test`. Drop in `why.html` (`<html data-role="why">` with the surface's purpose), `inbox.html` (`<html data-role="inbox">`, can start empty), `conv-max.html` (`<html data-role="conversation" data-partner="max">`, also empty), and a few `.html` work modules with `<html data-module="note" data-x="..." data-y="..." ...>`.
2. In the Surface project (`~/Documents/surface/`), write `index.html` that reads the surface's folder via directory listing, parses each file's `<html>` attributes (role, module, position), and renders each as an absolutely-positioned iframe at its declared coordinates. WHY renders prominently; the conversation renders on the left edge.
3. JS drag/resize layer — on drop, parse the file, mutate `data-x/y/w/h` on the `<html>` tag, write back to disk (debounced).
4. `python3 -m http.server` from the surface folder, open `index.html` in Chrome.
5. See if the feel is right. Drag two modules near each other. Confirm both files updated.

If yes → Chrome extension (v1). If no → throw it away cheaply, idea preserved in this doc.

---

## Appendix: the failed alternatives we ruled out

- **AFFiNE** — block-JSON, proprietary format, not folder-of-HTML; built and inspected its source on 2026-05-13
- **Pinegrow** — closest "buy it" answer, but tiled not spatial, and not AI-first
- **Tauri instead of Electron** — Mac webview is WebKit, not Chromium; embedding-anything-smoothly is harder, ecosystem smaller
- **Forking Chromium** (Brave / Arc path) — months / years of maintenance overhead; you're not building a browser, you're hosting one
- **Stripping out Markdown / using block-JSON** — explicitly rejected; the whole project is the bet that HTML wins
- **CLAUDE.md per folder** (early sketch from this conversation) — replaced by `data-role="why"` and `data-role="learnings"` modules on the surface itself. The individual's mind lives on the surface, not in a sidecar file.
- **"Child" / "parent" / "sub-" vocabulary** — family-tree language imported from filesystem and OOP paradigms. Replaced by "decomposed from / decomposed into," peers, and one-hop addressing.
- **Chat sidebar as the primary AI surface** — replaced by voice input + conversation modules on the surface, plus an inbox for unprocessed items. No special widget; everything is just modules.
