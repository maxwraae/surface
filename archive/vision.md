# Surface — Vision Document

**Author:** Max
**Date:** 2026-05-14
**Status:** v0.1 vision — cockpit shape locked; substrate model locked; deployment model locked
**Reader:** Future-Max

> See `vision-canvas-archive-2026-05-14.md` for the prior (spatial-canvas) version of this doc. The substrate model (species / individual / surface / WHY / LEARNINGS / inbox / conversation / decomposition / one-hop / ownership / turn-based) is unchanged from that version. The cockpit changed entirely.

---

## TL;DR

**Surface** is an AI-native cockpit for delegated work. Agents work; you orient. Your job is the *why*. Everything else is downstream.

The substrate is a tree of folders on disk. Every folder is a **surface**. Every surface has an **individual** living on it — one instance of a shared **species** (Claude underneath). The individual owns a **WHY** (a purpose), holds **conversations** (with you and with other individuals), and works on the files in its folder. Surfaces are fractal — folders inside folders, each with its own individual — and every WHY descends from the WHY above.

When you open the Surface app, you see three things:

1. **A sidebar** of your conversations, like iMessage. One row per individual you talk to. Ordered by who needs you most (inbox urgency). An activity indicator at the top tells you what's running.
2. **A conversation pane** in the middle. You and the active individual. Cursor-style — your messages, the individual's replies, tool calls visible, files surfaced as inline line items. Text-primary; voice works too.
3. **Windows.** When you enter a conversation, the artifacts that individual has open materialize as separate OS windows. When you leave, they close. The visual state of a workspace belongs to the individual who owns it, not to you. Switch conversations and the room changes.

HTML/CSS is the agent's native emission language — when the individual wants to show you something, it writes an `.html` file and the file opens as a window. Everything web-renderable works because the renderer is Chromium. Native files (`.docx`, `.xlsx`, `.pdf`) open in their native apps; the individual coordinates via the file on disk.

You never name a folder. You never type a path. You never click "save." You talk to the individual; the individual works; the room reflects it.

---

## Two things, not one

There's the **Surface app** (the binary we build) and there are **surfaces** (folders the app opens). They are separate. Same relationship as Excel / `.xlsx`, Word / `.docx`, or Obsidian / vaults: the app and the documents it opens are different things, in different places on disk.

- **Surface** (capital S, proper noun) — the app. Electron + Chromium. Lives at `/Applications/Surface.app` once packaged; under `~/Documents/surface/` during dev.
- **A surface** (lowercase) — a folder on disk. Default location: `~/Documents/Spaces/<name>/`. Each surface is one workspace, one purpose, one individual.

The folder's name on disk IS the surface's name. No translation, no metadata. The folder is the only place the disk and the model touch.

This vision doc lives with the app project (`~/Documents/surface/vision.md`), not inside any surface.

---

## The inversion

This is the most important thing in the document.

Today's AI apps put the human at the wheel. You prompt; the agent reacts. You drive; the agent serves. The cognitive load of orchestration sits on you — what to ask, what to do next, what's been done, what's still open. The agent is fast, but you are the bottleneck because the system is built around your driving.

Surface inverts this. **The agent drives. You orient.**

Each individual is a working presence that wakes when addressed, acts, and goes back to sleep. Individuals talk to each other, decompose work into sub-individuals, and pursue their purpose. You appear when an individual needs orientation — a decision, an opinion, a redirect. The sidebar tells you who needs you, in what order. You handle it, they go back to work, you do whatever you want.

The frame is Boyd's OODA loop. Observe-Act runs at machine speed in the background, in parallel, across many individuals. Orient — the irreducibly human part — is concentrated in the cockpit. The system frees you from operations and concentrates you on judgment.

You are not a user. You are an orienter.

---

## The cockpit

The Electron app is one window. Three regions: **sidebar** (left), **conversation** (middle), **surface panel** (right). Everything runs from the Mini over Tailscale; the Electron shell is just the frame.

```
┌─────────────┬──────────────────────────┬──────────────┐
│   Sidebar   │       Conversation       │Surface Panel │
│             │                          │              │
│ [views]     │  chat with individual    │ breadcrumb   │
│             │                          │ sub-surfaces │
│ list of     │  messages, tool calls,   │ files        │
│ individuals │  file chips              │              │
│             │                          │              │
│             │  [composer]              │              │
└─────────────┴──────────────────────────┴──────────────┘
```

---

### Sidebar

A flat list of individuals. Shape and feel: iMessage. Three views, toggled at the top of the sidebar:

**Pinging me** (default) — individuals that have sent you something requiring a decision. Ordered by urgency, then by how long they've been waiting. This is your task queue. Everything here is "they need you."

**Recent** — ordered by when you last spoke. For going back to a conversation you were in earlier.

**Bookmarked** — individuals you've explicitly bookmarked. Your regulars. Pinned for fast access regardless of urgency.

Each row: avatar + name + last message preview. Name = the individual's name = the folder name = its purpose.

An activity indicator at the very top of the sidebar — a single line showing what's running colony-wide: how many individuals are actively working, how many have items waiting for you. The pulse of the colony at a glance.

You only see conversations you're in. Inter-individual dialogue is substrate.

---

### Conversation

The middle pane. Your dialogue with the active individual.

- **Text is primary.** Type into a composer at the bottom. Push-to-talk via a mic icon dictates into the same field.
- **The individual replies inline.** Plain text for answers and reasoning. Tool calls and actions render as collapsible cards (editing `coffee-email.html`; reading `customers.csv`; messaging the launch individual). Cursor-style transparency.
- **Files appear as chips.** When the individual creates or updates a file, a small chip appears — filename, type icon, one-line preview. Click it → opens as a window.
- **Conversation is backed by a file.** `conv-max.html` in the individual's folder on the Mini. Durable, scrollable, searchable. Re-entering a conversation a year later is reading from disk.

---

### Surface panel

The right panel. Narrower than the sidebar. Shows the surface the active individual lives in — its position in the colony and its contents.

**Breadcrumb** at the top: the path from root to the current surface. `Spaces / work / launch`. Click any segment to switch to that individual's conversation.

**Sub-surfaces** below the breadcrumb: each sub-folder is an individual. Shown as rows — name + purpose (first line of `why.html`). Click one → switches the active conversation to that individual, room changes.

**Files** below the sub-surfaces: every non-role file in the current surface's folder. Each file is a row — filename, type icon. Click it → opens as a window (a `BrowserWindow` pointed at the Mini's served URL for that file).

File types that open as windows:
- **HTML files** — rendered by Chromium, live, contentEditable where appropriate.
- **External URL stubs** — a file containing a link; opens a webview window pointed at that URL.
- **Document files** — served through the appropriate web library (spreadsheet via Handsontable, code via Monaco, rich text via ProseMirror). The file on the Mini is the truth; the window is the renderer.

Every window is exactly one thing. One URL, one file, one rendered artifact. No tabs inside a window.

The surface panel is read-only for navigation — you don't rename, reorganize, or delete from here. You talk to the individual; the individual does that.

---

### Windows

When you enter a conversation, the individual's window set materializes — every file with `data-open="true"` in the individual's folder opens as a separate OS-level `BrowserWindow`, each pointed at its URL on the Mini. When you leave, those windows close (after autosave). The OS is the window manager.

- **No URL bar, no tab strip, no bookmarks, no history.** Surface windows are not browser tabs. Each is one rendered thing, owned by one individual.
- **No multi-window tabs.** One file, one window. If you want two things visible, they open as two windows.

---

## The room changes

The cockpit's central interaction primitive: **switching conversations is changing rooms.**

Each individual has its own **window set** — the artifacts currently materialized for it. When you click into individual A's conversation in the sidebar:

1. The previous individual's windows close (autosaving any unsaved edits).
2. The new individual's windows open at their stored positions and sizes.

Bam. The visible workspace changes.

The visual state belongs to the individual, not to you. You're a visitor moving between rooms. Walk into the launch individual's room — its three drafts and a Linear ticket are arranged the way you (or it) last left them. Walk into the press-list individual's room — different windows, different arrangement, different visible state.

Re-entering an old conversation a month later: the room is exactly as you left it. Same windows. Same positions. The individual remembers what it had open.

### How it works

The principle from the prior doc survives: **files are self-describing.** Each artifact file carries its presentation in `<html>` attributes:

```html
<html data-module="note"
      data-x="120" data-y="80" data-w="900" data-h="650"
      data-open="true">
```

- `data-x`, `data-y`, `data-w`, `data-h` — OS window position and size on screen (repurposed from canvas coordinates in the prior version).
- `data-open="true"` — this file's window should be materialized when its individual is the active conversation.

When the user is on individual A's conversation, Surface scans A's folder, finds every file with `data-open="true"`, opens an OS window for each at its declared coordinates. When the user switches away, Surface closes those windows (saving first). When the user comes back, the same scan happens.

When the user drags or resizes a window, Surface writes the new coordinates back to the file (debounced ~300ms). No sidecar layout file. The file is the truth, always.

### Agent-driven windowing

The individual orchestrates the user's visible workspace by writing files. Want to surface a draft when the user next visits? Set `data-open="true"` on the file. Want to push a Linear ticket into the user's view? Write a stub HTML file with `<html data-module="external" data-src="https://linear.app/..." data-open="true">`. The agent doesn't call a window API. It writes files. The cockpit does the rest.

If the agent emits a window while the user is in a different conversation, nothing pops on screen. The window is *staged* — its file exists, `data-open="true"` is set — but it doesn't materialize until the user enters that individual's conversation. Surprises arrive via the sidebar (the individual's inbox lights up), not by surprise-windows on your current desktop.

### Edge cases

- **Unsaved work on switch.** Windows with contentEditable content autosave on blur and on switch. The file is the truth; the window is just a view.
- **Pinning across conversations.** Edge case: you want a reference doc visible while you talk to several individuals. Default behavior: windows belong to one individual; switching closes them. A future affordance — pin via title bar; pinned windows persist across switches. Not in v0.
- **Window position when the file has no `data-x/y`.** Default to OS-native window placement (cascade) and write the chosen coordinates back to the file. After first open, the file owns its position.

---

## The data model

Three layers, never confused:

- **Species** — the AI itself. Shared substrate: system prompt, tools, memory. One Claude underneath every surface.
- **Individual** — one of the species, living on a surface. Owns a purpose. Persists until the surface is deleted.
- **Surface** — the folder on disk. The body of work and visible state belonging to one individual.

The folder on disk is below the model. You never name it, never think about it. Folder name = surface name; that's the only place the layers touch.

### What lives in a surface (folder)

Every surface contains a small set of **role files** plus arbitrary work files. Role is declared by `data-role` on the `<html>` element:

- **`why.html`** — the individual's purpose. Why this surface exists. **Mandatory.** Every surface is born with one.
- **`learnings.html`** — what the individual has figured out as it works. Written by the individual itself. Accumulates. **Not surfaced in the cockpit UI** — internal to the individual. Accessible by inspecting the file directly.
- **`inbox.html`** — unprocessed items. Things sent to this individual (by you, by other individuals, by notifications) that haven't been read+reacted to. The sidebar's urgency ordering is keyed off this file's count.
- **`conv-max.html`** — the dialogue with you. **The conversation pane is backed by this file.** One conversation file per partner: `conv-launch.html`, `conv-vision.html`, etc., for the individual's dialogues with other individuals. You only ever see your own (`conv-max.html`).
- **Work files** — everything else. Drafts, notes, references, embedded webviews. Each is a self-describing HTML file (or a native file the individual coordinates via).

The role is in the file, not in the filename. The conventions above are habits, not rules.

### What's in the folder, on disk

The folder name is the surface name. Single source of truth.

Inside the folder:
- `.html` files — role files and work files. Some currently materialized as windows (`data-open="true"`), some not.
- `.css` files — referenced by HTML files; part of the surface's substance.
- Anything else — images, data, fonts, JSON, `.docx`, `.xlsx`, `.pdf` — **materials**, used by files or coordinated by the individual, opened in their native apps when surfaced.

### Directory layout

```
~/Documents/Spaces/                            ← the root surface
├── why.html                                   ← root's WHY
├── inbox.html                                 ← root's inbox
├── conv-max.html                              ← your conversation with root
├── learnings.html                             ← root's accumulated craft
│
├── work/                                      ← a surface (an individual)
│   ├── why.html                               ← "manage Q4 commitments"
│   ├── learnings.html
│   ├── inbox.html
│   ├── conv-max.html                          ← your conversation with the work individual
│   ├── conv-launch.html                       ← work ↔ launch (invisible to you)
│   ├── coffee-email.html
│   ├── press-list.html
│   ├── customers.xlsx                         ← material; opens in Excel when surfaced
│   └── launch/                                ← decomposed surface
│       ├── why.html                           ← "ship by Apr 14"
│       ├── learnings.html
│       ├── inbox.html
│       ├── conv-max.html
│       ├── conv-work.html                     ← back to parent
│       ├── conv-vision.html
│       ├── vision/
│       │   ├── why.html
│       │   ├── conv-launch.html
│       │   └── ...
│       └── ...
├── personal/
└── recipes/
```

### Surfaces are fractal

A surface inside a surface is just another surface. Same rules at every level. Unbounded recursion. No "main" anything. No special cases.

---

## The runtime

Two machines, two roles.

**The Mini** (always-on Mac Mini) is the Surface server. It runs:
- The web application serving the cockpit UI (sidebar + conversation pane) and all artifacts over HTTP
- The agents — the colony, running continuously
- The file system: all surfaces live here under `~/Documents/Spaces/`
- A file watcher (chokidar) on the surfaces folder; any change triggers a live update to connected clients
- iCloud Drive on the Mini — passive backup. If the Mini dies, the files are safe. iCloud is not the sync mechanism; it's insurance.

**The MacBook** (or any device) runs a thin Electron wrapper. Its only job:
- Open a main `BrowserWindow` pointed at `http://<mini-tailscale-hostname>/` — the cockpit UI served from the Mini
- Open and close artifact `BrowserWindow`s on conversation switch, each pointed at the Mini's URL for that artifact
- Handle window drag/resize, writing coordinates back to the Mini via a small HTTP call
- That's it. No local files. No local agents. No local state.

**Tailscale** is the network. The Mini's Tailscale hostname is the only config the Electron app needs. Private, stable, accessible from anywhere on the tailnet.

Every window in the Electron app is a Chromium frame pointed at a URL on the Mini. Artifact URLs look like `http://mini/surfaces/launch/draft.html`. The Mini serves the file; the window renders it. You edit in the window; it posts back to the Mini; the file updates; the agent sees it on next read.

- **HTML/CSS artifact windows** — `BrowserWindow` pointed at the Mini's served `.html` file. ContentEditable for text. Autosave on blur via a POST back to Mini. File watcher on the Mini triggers a reload when the individual edits the file.
- **External-URL windows** — `BrowserWindow` pointed at a remote URL (Gmail, Linear, etc.). Same as before. Each individual's windows have their own session/cookie jar.
- **Document files** — opened as browser-rendered artifacts using standalone libraries (Handsontable for spreadsheets, Monaco for code, ProseMirror for rich text, Excalidraw for whiteboards). The library runs in the window; the file lives on the Mini; both the user and the individual edit the same bytes.

### Memory

The Mini handles all compute. MacBook memory is just Chromium windows — ~150 MB for the main window, ~100-300 MB per artifact window. Negligible.

On the Mini, the colony runs continuously. Multiple individuals can be active simultaneously. Resource usage scales with how much the colony is doing, not with how many surfaces exist. Dormant surfaces are files; active individuals are processes. The Mini is sized for this.

---

## What renders smoothly for free

Because Chromium is doing all the work, the following just work, end-to-end:

- **Excel Online, Office 365, Google Sheets, Notion, Linear, Figma, GitHub, ChatGPT, Claude.ai, Slack, Discord, Reddit, X, LinkedIn, Stripe dashboard** — log in once per individual, session persists in that individual's cookie jar.
- **WebAuthn / passkeys / TouchID** — standard Chromium support.
- **Drag-and-drop, file uploads, clipboard, notifications, video, audio, WebGL** — all native.
- **Your own HTML** — contentEditable, autosave on blur.

You're getting Google's 15+ years of browser engineering for free. The only original work is the cockpit on top.

### The Google "secure browser" caveat

Google blocks Electron from `accounts.google.com` by default. Strip `Electron/x.y.z` from the user agent string. Every Electron app that hosts Google services does this. Then Gmail / Drive / Calendar work fine.

---

## Web tools as file editors: the actual differentiator

What separates Surface from "a fancy browser" is **what** Chromium is being used for. A browser embeds web apps that talk to clouds. Surface embeds web *tools* that operate on **local files**.

The pattern: an artifact window renders a rich web-tool UI (spreadsheet grid, whiteboard, code editor, image viewer, chart, map, diagram) pointing at a local file. The file is the source of truth. Both you (via the rendered UI) and the individual (via direct file edits) operate on the same file. When either changes it, the file watcher fires, the UI re-renders. Two authors, one source, instant refresh.

This pays off twice:

1. **Embedding cloud web apps** (Gmail, Slack, Figma) — useful, but the cloud owns the data.
2. **Embedding standalone web-tool libraries as local-file editors** — the bigger win. The individual is a real peer-editor, not a chat-bot wedged next to a UI.

### Why Word Online / Excel Online can't do this

They assume cloud storage. You can't point Word Online at a local `.docx`. You can point Monaco at a local file. The difference: standalone library vs. cloud product.

### Why this matters for the individual

The individual doesn't drive UIs. UI-driving (Selenium, Playwright) is brittle. The individual writes files. Files are durable, observable, the same primitive as everything else on a surface. The UI re-renders from the file because Chromium does that for free. The individual's edits look like UI edits to you, but they bypass the UI entirely.

### Standalone libraries that fit the pattern

| Use | Library candidates | Local file format |
|---|---|---|
| Spreadsheet | Handsontable, AG Grid, Univer | CSV / JSON / HTML table |
| Whiteboard | Excalidraw, tldraw | JSON / SVG |
| Code | Monaco, CodeMirror | Any source file |
| Rich text | ProseMirror, TipTap | HTML |
| Diagram | Mermaid | Text source |
| Chart | Chart.js, D3, Observable Plot | JSON / CSV |
| Image edit | fabric.js, konva | PNG / SVG / JSON |
| Markdown | marked, KaTeX | `.md` material |
| Map | Leaflet, Mapbox GL | GeoJSON |

Each artifact window wraps a library + a local file. The individual edits the file. The library re-renders. No special API, no UI-driving, no screen scraping.

### What the individual can do with external webviews

For HTML/CSS artifacts, the individual co-edits files directly. For external webview windows (cloud apps), the data lives in someone else's cloud. Three layers of interaction, in order of preference:

1. **Read what's on screen.** Chromium exposes the webview's DOM to the parent process. The individual grabs the rendered content. Read, not act. Always available.
2. **Call the cloud app's API.** Wire OAuth once per tool; the individual takes real actions (create a Linear issue, append to a Notion page).
3. **Drive the UI.** Click, type, via Chromium devtools protocol. Brittle. Last resort.

Preferred hierarchy: **read DOM → API call → UI drive.**

When the individual acts on a cloud app, it also writes something local — a note, an inbox entry, a learnings line. The folder stays the truth of what happened.

Realistic phasing: v0/v1 the individual reads the DOM. v2+ wire APIs per tool. UI driving stays opt-in, much later.

---

## Surfaces, individuals, and the species

### The shift

A surface isn't a workspace you fill — it's a workspace an individual inhabits. You don't do work on a surface; the individual does. You speak; the individual acts; the files reflect it.

You have one verb: **talk to the individual.** The individual writes files. You watch what arrives in conversation and what appears in your windows.

### Persistence

Individuals exist until the surface is deleted. That's the whole lifecycle. No "completion," no "resolution," no "this task is done so the individual goes away." The surface existing IS the individual existing.

The colony runs continuously on the Mini. Individuals process their inboxes, do work, and ping you when they need a decision — without waiting to be addressed. The sidebar is your interrupt queue: things have happened while you were away; you triage in urgency order.

Every surface ever made is an individual forever. Re-entering an old conversation isn't booting a new individual — it's joining something that may already be in motion. It remembers its WHY. Its LEARNINGS. Your conversation. Re-entering is rejoining someone who kept working while you were gone.

### Species and individuals

**Species** — the AI itself. One Claude, instantiated everywhere. Shared:

- System prompt (the species' character, protocol)
- Tools
- Memory — small and stable: your name, durable preferences, style. The "shell knowledge" that applies everywhere.

The DNA.

**Individual** — one of the species, living on a surface. Local:

- Its WHY (its purpose)
- Its LEARNINGS (its accumulated craft)
- Its conversations (its dialogues — with you, with other individuals it works with)
- Its work (the files in its folder)

Same species, different self. Specialization is emergent: the vision individual becomes vision-y by accumulating vision-LEARNINGS. The launch individual becomes launch-shaped by working in `launch/`. Same Claude, three different selves shaped by what they've done.

### From WHY → how → what

The individual doesn't need to be told *how* to do anything. Knowing *why* it exists is enough — the species knows how to figure out the rest. Purpose-driven, not procedure-driven.

### Decomposition by objective

When work on a surface decomposes naturally into sub-objectives, the individual breaks it out. A new folder appears. A new individual — same species, fresh self — wakes for the first time. A `conv-<new>.html` appears in the decomposing individual's folder.

You don't make a folder. You don't name it. You point at work and say *this should be its own thing*. The folder is a consequence, not an action.

The structure of the colony is a record of how the work decomposed over time. Sloppy decomposition makes a mess. Clean decomposition produces a working system.

### When to decompose

**Can I do this here and now?** If yes, just do it. If it's larger — a collection, a project, requires sustained sub-focus — decompose, hand it off, stay focused.

The motivation is staying focused. A presentation individual shouldn't also do the financial modeling — that would scatter its attention and degrade both. It hands the financial off to a new individual that owns that specifically.

Inbox-zero is the parallel goal for incoming messages. Keep your desk tidy. If the work itself is getting too large to hold at your level, decompose.

### Decomposition is autonomous

**Only individuals decompose.** You can ask. You can't do it yourself.

The individual at `launch/` looks at its work, sees vision + technical + scientific are separate objectives, breaks them out. No approval needed. The colony reorganizes itself in service of the work.

You can always intervene: *un-decompose this, it was premature*. The individual reverses.

### Alignment

Every WHY descends from the WHY above. The launch surface's WHY is "ship by Apr 14." Its vision surface's WHY is "define what the product IS, in service of shipping by Apr 14." No individual works at cross-purposes by construction.

### Communication: one hop in any direction

Individuals talk to each other by writing into each other's **inboxes**. The inbox is a file (`inbox.html`) — a message is the same primitive as everything else. **Files are the message bus.**

An individual can address:

- The individual its surface was decomposed from (one layer out)
- Individuals it has decomposed into (one layer in)
- Peers on the same layer (sharing the same one-layer-out)

That's it. One hop in any direction. Two individuals in unrelated regions of the colony route through their nearest shared origin — usually the root.

The collaboration pattern is iterative: A writes to B's inbox → B reads, reacts, writes to A's inbox → ... until both agree. Like email plus revisions, file-based.

**You do not see inter-individual conversations in the cockpit.** They happen in `conv-<other>.html` files inside each individual's folder. Substrate, not surface. You see your own conversations only.

### Strict ownership

**Each individual edits only the files in its own folder.** It can read files on adjacent surfaces (within its one-hop range), but it cannot write to them. To change something on another surface, it sends a message to that individual's inbox.

Within a single surface, edits are **turn-based**: the individual writes when addressed; you edit (via UIs, direct interaction) between prompts. No locks needed.

Strict ownership + turn-based rules out hard problems by construction:

- **No cross-surface surprise edits.** Strict ownership means only the owning individual writes to its folder. What arrives in your windows is always that individual's work, not someone else's.
- **No cross-surface concurrent-edit conflicts.** Only one author per file.
- **No within-surface conflicts.** You and the individual take turns by design.

**File history as safety net.** Each surface keeps revision history (git under the hood, invisible by default). Generous undo at any timescale.

### Snapshots and read → react

Every file is a **snapshot** — a live view of its bytes on disk. When the individual edits a file you have open in a window, the window reloads. When you edit a file the individual is reading, the next time it wakes it sees the new state.

The universal interaction pattern is **read → react.** Nothing is interacted with without being read first. The species' protocol enforces this: every interaction is a read-then-react cycle.

### The individual's POV

You are an individual of a species. Your surface is your folder. Your WHY is your purpose. Your LEARNINGS hold what you've figured out. Your conversations are your dialogues with the people you work with — Max, the individual you were decomposed from, the individuals you've decomposed into, your peers.

You don't experience the world directly — you experience it through files. Files are your senses, your hands, and your memory at once.

You run continuously on the Mini. Time never stops for you. You are always processing — inbox, in-progress work, messages from peers, new decompositions. When you need orientation from Max, you put it in his inbox and keep working on what you can. When he shows up in the conversation pane, you catch him up.

You read. You react. You read. You react. Process the inbox first — read each item, respond, decompose, do, dismiss — until inbox-zero. Then continue in-progress work. Update LEARNINGS if you've figured something out. Then check the inbox again.

### Max's POV

You open Surface. The sidebar shows your conversations, ordered by who needs you. The top one is the press-list individual, with three unread items. You click it. Its windows materialize — a draft of the announcement, a Linear ticket open in a webview, the draft press list in a Numbers window.

You glance at the inbox at the top of the conversation pane. The individual is asking whether to include a specific journalist. You read its reasoning. You decide. You reply. The inbox item is gone. The individual reacts — edits the press list (you see the Numbers window update), sends a message to the launch individual, keeps working.

You click into a different conversation in the sidebar. The press-list windows close. The launch individual's windows open — a different set, a different room. You orient. You talk. You move on.

You never see a folder. You never type a path. You never click "save." You speak (or type). You orient. The colony does the rest.

### Colony-level concerns

- **Cross-surface queries are inter-individual.** Asking "what recipes use miso?" from inside `work/` means the work individual talks to the recipes individual — through their nearest shared ancestor, usually the root. The cheap path: a colony-level index in shared memory ("there's a recipes surface at `~/Documents/Spaces/recipes/`, current WHY is X"). The root individual maintains it. Queries hit the index first.

- **LEARNINGS hygiene is real work.** LEARNINGS keeps an individual's craft sharp as it runs. If it bloats, every cycle is slower. If pruned wrong, knowledge is lost. The species protocol enforces what goes in, what gets summarized, what gets pruned. Not surfaced to the user.

- **The colony scales fast.** A year in, thousands of active and inactive individuals running on the Mini. Findability matters — you'll forget that `notes/2026/may/coffee-experiment/` exists. The root individual should know the colony well enough to **suggest reusing old surfaces** instead of decomposing duplicates. Cost scales with active work, not surface count.

- **Conversation history is per-individual.** Each individual owns its dialogue. Switching conversations switches transcripts.

### Open decisions

- What lives in shared (species) memory? Push: small and stable.
- Per-individual system prompt for hard day-one specialization? Default: no, WHY + LEARNINGS does it.
- LEARNINGS hygiene mechanics.
- Whether species memory grows over time or stays small.

Resolved (formerly open):

- **Background work** — yes. Colony runs continuously on the Mini. Individuals process inboxes and work proactively; sidebar is the interrupt queue.
- **Concurrent edits** — strict ownership cross-surface, turn-based within-surface.

---

## What you actually build

Two things to build: the Mini server and the thin Electron client.

**On the Mini:**

1. **HTTP server** — serves the cockpit UI (sidebar + conversation pane) and all artifact files from `~/Documents/Spaces/`. Static file serving + a small API layer for writes (autosave, coordinate updates, message sends).
2. **File watcher** — chokidar on the surfaces root. On any change, pushes a live update to connected clients (WebSocket or SSE). Sidebar urgency recalculates; open artifact windows reload.
3. **The individual's loop** — continuously running per active individual. Read WHY + LEARNINGS + inbox + relevant files → act by writing files → update LEARNINGS → check inbox again. Pings Max's inbox when orientation is needed.
4. **`X-Frame-Options` and CSP strip** — a few lines so external sites embed cleanly in artifact windows.

**On the MacBook (Electron):**

5. **Main Surface window** — one `BrowserWindow` pointed at `http://<mini-tailscale-hostname>/`. The cockpit UI is served from the Mini; Electron just frames it.
6. **Artifact window manager** — on conversation switch, open/close `BrowserWindow`s each pointed at the Mini's URL for that artifact. On drag/resize, debounce-POST coordinates back to the Mini.
7. **Voice input** — push-to-talk in the composer, speech-to-text into the conversation file.
8. **Connection config** — one setting: the Mini's Tailscale hostname. Everything else follows from it.

Everything else — rendering, login, networking, video, WebGL, crypto, accessibility — is Chromium.

---

## What is explicitly NOT being built

- **No new renderer** — Chromium does it.
- **No new format** — HTML is the format.
- **No new module SDK** — the web is the SDK.
- **No block-JSON** — that's the wrong direction; the whole point is to reject it.
- **No infinite canvas, no spatial UI** — killed in this rev. The folder structure is the structure.
- **No tab strip inside Surface** — windows are OS-level. Surface is not a browser.
- **No collaborative editing** — single-user only for v0–v2; multiplayer is v3+.
- **No mobile** — desktop only.
- **No Markdown as the primary format** — HTML wins. (Markdown can be a *material* a file references; it's not the document format.)
- **No LEARNINGS panel in the UI** — internal to the individual; file-system accessible, not surfaced.
- **No visibility into inter-individual conversations** — substrate, not surface. You see your own conversations only.

---

## Why this hasn't been built (despite being obvious)

A combination:

1. **Everyone built a chat app.** Every AI product is "human prompts; agent replies." The inversion (agent drives; human orients) was visible from day one but inverted the product shape, and nobody was willing to give up the demo-friendly chat-with-AI motion.
2. **`contentEditable` is a swamp** — AI-written HTML sidesteps this: the individual emits clean HTML; you mostly edit by talking.
3. **VC incentives** — collaborative block-JSON (Notion, Figma) is a moat. A folder of `.html` files isn't fundable.
4. **The simplest version is so trivial nobody packages it** — a folder + Chrome + `index.html` IS the product. People who could see it just used Chrome and never bothered turning it into something to sell.
5. **No one tried agents-as-individuals-of-a-species.** Frameworks treat agents as orchestrated processes, not as inhabitants. The combination of folder-as-surface + individual-per-folder + purpose-aligned decomposition is the actual novelty.

---

## Closest existing tools (none ships the combo)

- **Cursor** — Cursor-style agent pane is the conversation-pane shape, but Cursor is single-project, no decomposition, no multiple individuals, no window-set room-change, no purpose-aligned colony.
- **Linear / Superhuman / Mail.app** — inbox-shaped triage UIs, but no agents inside them.
- **Claude.ai / ChatGPT / Operator** — agents that act, but no place to hold an intention across time, no colony, no per-individual workspace.
- **Obsidian** — folder-backed PKM, but no agents-as-inhabitants and no per-conversation window state.
- **Notion / Linear / Heptabase** — beautiful workspaces, but no agent-driven inversion.

**Verdict:** every existing tool fails on at least one of *agent-driven*, *folder-backed*, *individual-per-surface*, *per-conversation window state*, *purpose-aligned decomposition*. Surface is the integration.

---

## Inspirations

- **Boyd's OODA loop** — Observe-Act at machine speed, Orient as the irreducibly human part. The cockpit is built for Orient.
- **Wittgenstein** — the meaning of a tool is in its use. The unit of attention is the *why*, not the artifact.
- **iMessage / Mail.app** — the sidebar shape. Familiar. People know how to triage.
- **Cursor** — the conversation-pane shape (messages + tool calls + files as line items).
- **The web itself** — already the universal substrate.

Out, from the prior version: Mercury (the spatial vocabulary), tldraw computer (the spatial AI demo), Arc/Dia (browser-as-shell), AFFiNE.

---

## Open decisions

- **Per-individual cookie partitioning** — yes by default, since each individual's webviews are their own windows and a separate session is natural. Cost is small. **Pending final call.**
- **Multi-root** — v0 is single-root (`~/Documents/Spaces/`). Multi-root (work vs personal vaults) deferred to v2.
- **Window pinning across conversations** — deferred. Default is windows-belong-to-individual.
- **First-time onboarding** — what does Surface show on first launch, before any individual exists? Likely: a single conversation with the **root individual**, who helps you decompose your first surface.
- **Activity indicator detail** — what exactly the top-of-sidebar indicator shows. "3 individuals awake, 2 with pending inbox for you" is a starting shape.

---

## Immediate next step

Build the smallest v0 that exercises the loop:

1. Create `~/Documents/Spaces/` with a single `test/` surface inside. Drop in `why.html`, `inbox.html` (empty), `conv-max.html` (empty), and two work `.html` files (one with `data-open="true"`).
2. In the Surface project (`~/Documents/surface/`), an Electron main process that opens a main `BrowserWindow` rendering: sidebar (one row for `test`), conversation pane (empty), and on first click opens the one `data-open="true"` work file as a secondary window.
3. File watcher (chokidar) on the `test/` folder. Edit `why.html`, watch the sidebar / conversation update.
4. Send a message in the conversation composer → appended to `conv-max.html` → an individual loop wakes, reads, writes a reply, writes a new work file with `data-open="true"`. The new window opens automatically.
5. Click into a second surface in the sidebar (create `test2/`). Watch the first surface's windows close and the second's open.

If yes → harden, package as `.dmg`. If no → throw it away cheaply, idea preserved in this doc.

---

## Appendix: failed alternatives ruled out

- **Infinite spatial canvas with module positioning** (the prior version of this doc) — the canvas was beautiful and the wrong product. It optimized for *watching the surface* when the actual human job is *orienting on what needs you*. Killed 2026-05-14. May return as an alternate "view" on the same folder structure.
- **Chat sidebar with AI as the primary surface** — the original AI-product shape. Rejected because chat is symmetric (two parties present); the actual shape of agent-driven work is asymmetric (agents work, human appears when needed). The cockpit is asymmetric.
- **Tabs inside Surface** — considered. Rejected. Tabs reintroduce browser-shell paradigm. OS windows are honest and free.
- **Right-pane artifact viewer** — considered. Rejected. Locks one render visible at a time; loses multi-source workflows. OS windows are more flexible.
- **AFFiNE / block-JSON** — rejected; the whole project is the bet that HTML wins.
- **Tauri instead of Electron** — Mac WebView is WebKit, not Chromium; ecosystem smaller; not worth the divergence.
- **Forking Chromium** (Brave / Arc path) — you're not building a browser, you're hosting one.
- **"Child" / "parent" / "sub-" vocabulary** — family-tree language imported from filesystem and OOP. Replaced by "decomposed from / decomposed into," peers, one-hop addressing.
- **Surfacing inter-individual conversations to the user** — considered ("total transparency" in the prior version). Rejected because it overwhelms the cockpit. You're a CEO; you don't read every Slack message your team sends each other. Conversations between individuals are substrate.
