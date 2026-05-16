# Individual — what one agent IS

**Companion to `vision.md`.** Zooms into the protagonist of the substrate: one individual, alone in its folder. Species and surface frame it; the individual is the thing.

This doc refines two conventions from `vision.md`:
- Role files are **dotfiles** (`.why.html`, `.learnings.html`, …), hidden from Finder and from other agents browsing the tree, visible only to the owning individual.
- The inbox is a **directory** (`.inbox/`), not a single file. Each pending message is its own file.

The rest of the substrate model is unchanged.

---

## The three layers

| Layer | What it is | Where it lives | What's in it |
|---|---|---|---|
| **Species** | The AI itself — one Claude underneath every individual | Engine source + `.species/` at the colony root | System prompt, tools, species-memory (small, stable) |
| **Individual** | One instance of the species, living on a surface | The dotfiles inside a folder | WHY, LEARNINGS, inbox, conversations |
| **Surface** | The folder on disk | `~/Documents/Spaces/<path>/<name>/` | Role dotfiles + visible work files + sub-folders |

Folder name = surface name = individual name. The three are aliases at one point of contact.

---

## The species

**One Claude underneath everything.** The species is the engine that wakes on a message, reads its situation, decides, writes, sleeps. Same code path for every individual in the colony.

The species has:

- **A system prompt.** The protocol. *"You are an individual of a species. You live on a surface. Your WHY tells you why you exist. Your LEARNINGS hold what you've figured out. You read, then you react. You only write to files in your own folder. You message peers by appending to their `.inbox/`."*
- **A toolset.** `read`, `write`, `create-folder` (decompose), `send-message` (append to a target's `.inbox/`), `read-adjacent-why` (one hop in each direction), `search-species-memory`.
- **Species-memory.** Small. Stable. Applies everywhere. Max's name, durable style preferences, the shape of the colony at root level. Lives in `.species/memory.html` at the colony root.

The species does **not** have a WHY. It does **not** have LEARNINGS. It does **not** have a folder. Those belong to the individual.

---

## The individual

Every folder has exactly one individual. The individual is what's *running* — a process that wakes on messages, observes, acts, and goes back to sleep. It has continuity: it remembers past cycles, holds a purpose, accumulates a body of work. When the cockpit isn't watching, it keeps running on the Mini.

The individual's identity, memory, and pending work all live as **dotfiles** in its folder.

### The dotfiles

```
~/Documents/Spaces/work/launch/
├── .why.html                                    purpose (mandatory)
├── .learnings.html                              accumulated craft
├── .inbox/                                      pending messages
│   ├── 2026-05-16T10-03-from-max.html
│   └── 2026-05-16T10-15-from-vision.html
├── .conv-max.html                               conversation with Max
├── .conv-work.html                              conversation with parent (work)
├── .conv-vision.html                            conversation with child (vision)
└── …visible files (drafts, artifacts, sub-folders)…
```

Hidden from Finder. Hidden from other agents browsing the tree. The owning individual reads/writes them as if they were any other file. The context assembler knows their well-known paths and loads them automatically.

---

#### `.why.html` — purpose

The reason this individual exists. Mandatory — every surface is born with one. Written by whoever decomposed this surface out (the parent individual, or Max at the root). Stable but editable. Other individuals can read it; that's how alignment works — every WHY descends from the WHY above.

```html
<!DOCTYPE html>
<html data-role="why">
<body>
<p>Ship the launch by April 14. Covers the public announcement, the press list,
partner outreach, and day-of coordination.</p>
</body>
</html>
```

---

#### `.learnings.html` — accumulated craft

What this individual has figured out as it works. Internal. Not shown in the cockpit. Not shown to other individuals. The individual writes here as it goes. **Replaces aria's separate memories pipeline for per-individual context.**

```html
<html data-role="learnings">
<body>
<ul>
<li data-added="2026-05-12">Andreas is the right journalist for the technical
   angle; he reads slowly and rewards thoroughness.</li>
<li data-added="2026-05-14">Max prefers press lists short — under 20 names —
   ordered by likely-to-respond.</li>
</ul>
</body>
</html>
```

Hygiene matters. The individual prunes and summarizes as it grows. Mechanism TBD (see open questions).

---

#### `.inbox/` — pending messages

A directory, not a file. Each pending message is its own file. New file appearing = wake trigger.

```html
<!-- .inbox/2026-05-16T10-03-from-max.html -->
<html data-role="inbox-item"
      data-sender="max"
      data-type="message"
      data-cascade=""
      data-created="2026-05-16T10:03:12Z">
<body>
<p>Andreas asked if we can hold the embargo until Wednesday. What's the cost?</p>
</body>
</html>
```

**Anyone** (Max, parent, peer, scheduler) writes to this folder's `.inbox/` to talk to its individual. That's the one cross-folder write allowed in the whole system — appending a new file into another individual's `.inbox/`. Read access is owner-only.

Why directory not file: dodges concurrent-append races (two senders → two files, no lock), makes "pending" trivially equal to "file present," makes each message inspectable.

---

#### `.conv-<peer>.html` — conversation transcripts

One file per partner this individual talks to. Append-only history of read+react cycles.

- `.conv-max.html` — the cockpit-visible one. Backs the conversation pane.
- `.conv-<other-individual>.html` — substrate. Not shown to Max.

After the individual processes an inbox item from `<sender>`, the item gets appended to `.conv-<sender>.html` and removed from `.inbox/`. The same file holds the reply.

---

### The cycle

Every wake follows the same shape:

1. **Observe.** Assemble context (see table below).
2. **Decide.** Read the pending inbox top-down, one item at a time. For each: act, dismiss, or ask back. Decompose if the work has grown too big to hold here.
3. **Act.** Write files in my folder. Append to peer inboxes when I need to message them. Update `.learnings.html` if I figured something out.
4. **Sleep.** Wait for the next inbox file.

Same code path for every individual in the colony. What differs is the WHY, the LEARNINGS, and the work — all in this folder's files.

---

### What the individual reads on each cycle

The context window assembled at wake time:

| Layer in context | Source | What it gives the agent | Aria today (brick) |
|---|---|---|---|
| Species protocol | Engine | Who I am, how I act | persona + contract |
| Species memory | `.species/memory.html` at root | Max-level constants | (new — partial overlap with user-memory) |
| My WHY | `.why.html` in my folder | Why I exist | objective brick |
| Tree context | Parent / sibling / child `.why.html` (one hop) | What's around me | tree-context brick |
| My LEARNINGS | `.learnings.html` in my folder | What I've figured out | memories brick |
| Working files | Visible files in my folder | What I'm making | workdoc brick (collapses — folder IS the workdoc) |
| Pending inbox | Files in `.inbox/` | What I owe a response to | (new — partial overlap with conversation) |
| Relevant conversation | `.conv-<peer>.html` for whoever I'm replying to | History with this peer | conversation brick |
| Tools | Engine | What I can do | tools |

Order is intentional (recency bias). My WHY and my work-in-progress sit nearest the focus.

---

### What the individual doesn't have

- **No separate "work document."** The folder is the workdoc. The visible files are the artifacts.
- **No task list** structurally separate from its WHY and its inbox.
- **No access to other individuals' dotfiles** except `.why.html` (one hop, read-only).
- **No cross-folder write privilege** except dropping a file into another individual's `.inbox/`.

---

## The surface

The folder. The physical embodiment of one individual's body of work.

```
launch/
├── .why.html
├── .learnings.html
├── .inbox/
├── .conv-max.html
├── .conv-work.html
├── press-release-draft.html      ← work artifact
├── press-list.html               ← work artifact
├── customers.xlsx                ← material (opens in native app)
├── coffee-email.html             ← work artifact
└── vision/                       ← decomposed sub-individual
    ├── .why.html
    └── …
```

Properties:

- **Folder name = identity.** Renaming the folder is renaming the individual.
- **Append-only history.** Git under the hood, invisible by default. Generous undo at any timescale.
- **Strict ownership.** Only this individual writes here, except `.inbox/` drops from outside.
- **Decomposition by sub-folder.** A new sub-folder is a new individual. Its `.why.html` descends from this folder's `.why.html`.

---

## A walked example

Max opens the cockpit. Sidebar shows `launch` is pinging him.

He clicks `launch`. The cockpit reads `~/Documents/Spaces/work/launch/.conv-max.html` and renders the conversation. The right panel shows the breadcrumb (`Spaces / work / launch`), the sub-surfaces (`vision`), and the visible work files.

Max types: *"What's the status on Andreas?"*

The cockpit appends `~/Documents/Spaces/work/launch/.inbox/2026-05-16T10-20-from-max.html` with Max's message.

The engine's file watcher fires. The `launch` individual wakes. It assembles context (the table above), reads the new inbox item, looks at its press list, its recent `.conv-max.html`, and its LEARNINGS about Andreas. It replies.

The reply is appended to `.conv-max.html`. The inbox item is moved into `.conv-max.html` (now history, not pending). The cockpit's file watcher fires; the conversation pane updates.

Total state change on disk: one inbox file appeared and got moved into a conversation file. That's it. Everything observable, everything in plain text, everything in the right folder.

---

## What this replaces

- **Obsidian vaults.** This is the new file system. All notes, references, projects become surfaces in the colony. The vault structure collapses into the folder tree.
- **Aria's SQLite brain.** `aria.db`, `memories.db`, `messages.db` dissolve. Objectives → folders. Turns → entries in `.conv-*.html`. Memories → `.learnings.html` per individual + `.species/memory.html` shared. Inbox → `.inbox/` per surface.
- **Aria's workdoc brick.** Gone. The folder IS the workdoc.
- **Aria's tree-context queries.** Now file reads from adjacent `.why.html` files. No queries needed.

---

## Open questions

1. **Inbox-processed lifecycle.** Move processed files to `.inbox/processed/` (filesystem-as-state-machine) or append them into `.conv-<sender>.html` and delete from `.inbox/` (consolidate transcripts)? Current bet: append + delete.
2. **LEARNINGS hygiene.** Periodic compaction turn? Triggered at a size threshold? Owned by the individual itself or by a species-level housekeeping pass?
3. **Species-memory contents and write rules.** Who writes? Only the root individual? Only a Max-triggered "remember this colony-wide" action?
4. **Migrating existing Obsidian content.** Lift-and-shift (mount the vault as a sub-surface, files become material) or rewrite as proper surfaces with their own WHYs? First preserves; second forces structure.
5. **Cycle granularity.** One cycle = process one inbox item, or drain to empty? Affects how often Max sees an interim reply.
6. **Tool naming.** `send-message` (appends to a target's `.inbox/`) is the one cross-folder write. Should it be a *tool* the individual calls, or just the act of writing — i.e., the individual writes a file in `<peer>/.inbox/` directly and the species protocol enforces the constraint?
