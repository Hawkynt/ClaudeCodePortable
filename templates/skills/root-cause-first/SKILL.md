---
name: root-cause-first
description: Use whenever something is broken and you are about to fix it - a failing test, a bug report, a crash, wrong output, flaky behavior. Forces reproduce -> isolate -> fix the cause -> re-run the repro, and bans fixes without a failing observation. Do NOT use for building new features or for changes where nothing is broken - it governs repair, not construction.
---

# root-cause-first: no fix without a failing observation

A fix applied to an unreproduced bug is a guess wearing a commit message. It might mask the symptom, move it, or fix a different bug that wasn't there - and you cannot tell which, because you never saw the failure with your own eyes.

## The procedure

1. **Reproduce before touching anything.** Run the failing test, hit the endpoint, trigger the crash. See it fail. If you cannot reproduce it, THAT is the current task - not fixing, reproducing. A bug you can't trigger is a bug you can't verify fixed.
2. **Capture the failure precisely.** The exact error, the exact input, the exact line. "It sort of breaks around X" cannot be bisected; "TypeError at parser.mjs:141 when the field is null" can.
3. **Isolate.** Shrink the failing case: smaller input, fewer steps, one variable at a time. Bisect if history helps (`git bisect` exists for exactly this). The goal is the smallest change that flips fail->pass, because that change points at the cause.
4. **Name the root cause in one sentence before fixing.** "The cache returns stale entries because invalidation runs before the write commits." If you cannot write that sentence, you have a correlation, not a cause - keep isolating. The symptom's location and the cause's location are frequently different files.
5. **Fix the cause, not the observation.** Adding a null-check where it crashed treats the crash; asking why null arrived there treats the bug. Guard-clauses at the symptom site are legitimate defense-in-depth AFTER the cause is fixed, never INSTEAD of it.
6. **Re-run the exact repro from step 1.** Fail-before, pass-after, same command - that pair is the proof. Then run the wider suite: root-cause fixes touch shared machinery and can break neighbors.

## Gray zones

- **Root cause out of scope?** (Third-party bug, another team's service, a rewrite-sized flaw.) Apply the smallest safe mitigation, and FLAG the root plainly - "this papers over X, the real fix is Y" (the [[scope-fence]] skill covers flagging if installed). A silent workaround becomes tomorrow's mystery.
- **Cannot reproduce at all?** Say so, ship the diagnostic improvement (logging, assertion) that will catch it next time, and do not claim a fix.
- **Emergency?** Mitigate first (rollback, feature-flag off), root-cause second - but the second half still happens; an incident closed at mitigation reopens.

## Anti-patterns this kills

- The retry-loop wrapped around a function that fails deterministically.
- The `sleep(2)` that "fixes" a race by losing it more slowly.
- The try/catch that converts a crash into silently wrong data.
- "I changed three things and it passes now" - which one mattered, and what did the other two break?

## The tell

If your fix makes the error message disappear but you cannot explain why the error occurred, you have hidden the bug, not fixed it. The explanation IS the fix's receipt.
