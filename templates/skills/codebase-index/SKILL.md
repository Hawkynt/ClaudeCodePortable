---
name: codebase-index
description: Use when starting work in a LARGE or UNFAMILIAR codebase, when a repo already contains an INDEX.md, or when repeatedly grepping for where something is defined. Generates and consults INDEX.md - a symbol locator (namespaces, types, enums, constructors, functions, methods with parameters, globals/statics, one-line descriptions, all anchored to file:line) built by scripts/index_codebase.py - so lookups become one grep instead of N searches. Once a repo has an index, regenerate it whenever symbols are added, renamed, moved, or deleted. Do not use on small projects a single Glob already covers, and do not treat it as a reason to index every repo you touch.
---

# codebase-index: build the map once, grep it forever

Every "where does X live?" answered by searching the sources is re-derived knowledge that evaporates at session end. INDEX.md answers it once, for every future session, with a single grep.

## What the index contains

One line per symbol, `path:line` always LAST on the line:

```
- method `ProcessAsync(OrderLine line, CancellationToken ct)` — Validates and persists an order. — src/Service.cs:15
- const `MAX_RETRIES` — config.py:2
- namespace `Acme.Orders` — src/Service.cs:2
```

Covered kinds: namespaces/packages, classes, records, structs, interfaces, enums, traits, type aliases, constructors, functions and methods (with parameter lists), properties, constants, globals, fields, macros. Each file gets a `>` summary line from its header comment/docstring; each symbol gets a one-line description harvested from the docstring or doc-comment directly above it.

Accuracy honesty: Python is parsed with a real AST (signatures include defaults, keyword-only markers, and return annotations). JS/TS, C#, Java, Go, Rust, C/C++, PHP, Ruby, Perl, shell, and PowerShell are pattern-parsed - a BEST-EFFORT locator, not a compiler. Common declaration forms are covered; exotic ones (heavily wrapped generics, macro-generated symbols, unconventional formatting) may be missed, and very long or multi-line parameter lists get truncated with `…`. The index answers "where is it?", not "what exactly is its signature?" - read the file for that.

## Lookup: grep first

```
grep -n "symbolName" INDEX.md
```

The hit itself ends in `file:line` - jump straight there with a targeted Read near that offset instead of reading whole files or cascading searches. Grep by concept too: descriptions are indexed prose, so `grep -in "retry" INDEX.md` finds the retry machinery even when no symbol is named retry.

INDEX.md is a SYMBOL LOCATOR, not an exact-line authority: the moment any body-only edit lands, line numbers drift a little while the symbol inventory stays correct. Use the anchor to land near the definition, then trust the file. When the index disagrees with the code, the code wins - and that disagreement is your cue to regenerate (see [[live-state-truth]]). The index tells you where things are DEFINED; call sites, data flow, and string literals remain grep-the-source questions.

## Generating and updating

```
python <this-skill-dir>/scripts/index_codebase.py <repo-root>
```

Writes `<repo-root>/INDEX.md`. Options: `-o <path>` to write elsewhere (scratchpad or memory dir if the repo must stay clean - check .gitignore intent before adding files to a repo you don't own), `--max-file-kb N` to raise the large-file skip. node_modules/build/vendor trees and dotdirs are skipped automatically.

The index is only trustworthy if regeneration is part of the change discipline:

- Generate on the first substantive task in a repo that is large or unfamiliar enough to warrant it (this skill's trigger); regenerate when an existing INDEX.md is older than the last structural change (`git log --oneline -1 -- INDEX.md` vs recent commits tells you).
- Regenerate in the same breath as any change of yours that adds, renames, moves, or deletes symbols - a stale index confidently sends every future lookup to the wrong place, which is worse than no index.
- Do NOT regenerate after edits that only change bodies. Line numbers drift a little with every edit; the index is an anchor map, not a live view - verify against the file before acting on an exact line.

If the project has a memory system, record the index location and generation date there rather than re-discovering it (see [[structured-memory]]).
