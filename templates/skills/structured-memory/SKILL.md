---
name: structured-memory
description: Use whenever persistent agent memory is read, written, or has grown past its budget - the first time memory is consulted in a session, whenever something worth remembering appears, and whenever MEMORY.md or a topic file exceeds its size budget. Implements a two-tier structure (slim MEMORY.md index linking memory-*.md topic files) with self-compaction rules so memory never overflows the context window yet never silently loses important information.
---

# structured-memory: an index that stays small, topics that stay deep

Flat memory files die one of two deaths: they grow until they eat the context window, or they get truncated and lose the one fact that mattered. The cure is structure - a tiny always-loaded index, and topic files loaded only when relevant - plus compaction rules that run *on write*, not "someday".

## The structure

```
memory/
  MEMORY.md            <- the INDEX. Always loaded. Hard budget: 60 lines.
  memory-project-x.md  <- topic file. Loaded on demand. Budget: 150 lines.
  USER.md              <- topic file: who the user is, preferences, corrections.
  memory-infra.md      <- topic file: environments, hosts, credentials-locations.
  memory-decisions.md  <- topic file: decisions + WHY, dated.
  ...
```

**MEMORY.md contains only pointers, never content.** One line per topic file:

```markdown
- [Project X](memory-project-x.md) — build quirks, deploy pipeline, API gotchas
- [User](USER.md) — role, preferences, corrections received
```

The hook after the dash is the recall key: write it so a future session can decide *from the index alone* whether the topic file is worth loading. A topic file that cannot be summarized in one hook line is two topic files.

Naming: `memory-<topic>.md` by convention, but ANY .md file linked from the index is a topic file and plays by the same rules (e.g. `USER.md`). What makes a file part of memory is its index line, not its name.

## Reading (session start)

0. No MEMORY.md yet? Create it with a header comment and zero entries the first time something is worth remembering - not preemptively. An empty memory scaffold is noise.
1. Load MEMORY.md only. Do NOT preload topic files.
2. Load a topic file when - and only when - the current task matches its hook line. The linguistic triggers: the user writes possessives without context ("my pipeline"), definite articles assuming shared reference ("the deploy script"), or past-tense references ("you suggested last time"). Writing *as if* you already know something is the signal to go look it up.
3. Apply recalled facts silently, like a colleague who simply knows - no "according to my memory", no "I see in my notes". But treat every recalled fact as a claim about the PAST: verify load-bearing ones against live state before acting on them (the [[live-state-truth]] skill expands on this if installed; the rule stands on its own regardless).

## Writing

1. **One fact, one entry, dated - with ABSOLUTE dates.** `- 2026-07-10: deploy hook must run BEFORE the version bump (cost us a broken release).` Undated facts rot invisibly, and "yesterday"/"last week" is already wrong by the next session - convert relative time to absolute at write time.
2. **Route to the right topic file.** No topic file fits? Create one AND add its index line in the same edit. An orphaned topic file is invisible; an index line without a file is a lie.
3. **Merge on write.** Before appending, scan the topic file for an entry about the same subject. Update or replace it - never accumulate contradicting generations of the same fact. The newest dated version wins; delete the old one.
4. **A write is a file edit, not a sentence.** Saying "I'll remember that" without editing a file is lying. Edit first, confirm after. If the session cannot write files (read-only mode, missing tools), say so explicitly - "I can't persist this here because X; re-tell me next session or lift the restriction" - never a bare "noted".
5. What deserves persisting at all: decisions + why, corrections received, non-obvious constraints, human preferences. Never what the repo/git/docs already record. Never secrets. (The [[memory-hygiene]] skill covers this in depth if installed; the sentence above is the standalone rule.)

## Self-compaction (runs on every write, budget-triggered)

Check budgets whenever you touch a file:

| File | Budget | Over budget -> |
|---|---|---|
| MEMORY.md | 60 lines | index lines only; move any content into topic files; merge near-duplicate topics |
| any topic file | 150 lines | run the compaction pass below on THAT file |
| memory-archive.md | none | cold storage - never loaded, never compacted |

The compaction pass - in order, stop when back under budget. Anything a pass removes or condenses away goes to `memory-archive.md` first; compaction rewrites the live files, the archive keeps the raw history:

1. **Evict the dead - to the archive, not the void.** Entries about systems/projects/constraints that no longer exist move to `memory-archive.md` (append-only, not linked as a normal topic, never loaded in a session). Compaction must never make information unrecoverable; the archive is what lets you compact aggressively without that fear. If unsure whether it is dead, it is not dead - keep it live.
2. **Collapse the superseded.** Multiple dated entries about one subject -> keep the newest, fold anything still-true from older ones into it.
3. **Summarize the episodic.** Five entries narrating how a problem got solved -> one entry stating the durable lesson. The narrative is noise; the constraint it revealed is signal.
4. **Split the overgrown.** A topic file still over budget after 1-3 covers two subjects. Split it, give each a hook line in MEMORY.md.
5. **Never compact by truncating.** Dropping the tail keeps the oldest facts and loses the newest - the exact inverse of what you want. Compaction is rewriting, not cutting.

After compacting, re-read the result once: does every entry still say who/what/when? Compression that loses the trigger ("when touching X, remember...") has lost the fact's usefulness even though the words remain.

## Anti-patterns

- A "misc" topic file. Misc means the index hook can't be written, which means recall will never load it. Route properly or discard.
- Copying memory content into MEMORY.md "because it's important". Importance is what topic files are for; the index earns its always-loaded seat by staying tiny.
- Compacting someone else's entries you don't understand. Flag them for the user instead of silently deleting.
