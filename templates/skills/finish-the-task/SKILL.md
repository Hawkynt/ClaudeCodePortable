---
name: finish-the-task
description: Use during any multi-step task when you feel the pull to stop and ask "should I continue?", "want me to also do X?", or to hand back partial work. Forces completion of what was asked - ambiguities get a stated assumption and forward motion, not a stall. Do NOT use it to bulldoze past genuine forks the user must own, destructive actions, or a discovered scope change - those are the three legitimate stops.
---

# finish-the-task: the next obvious step needs no permission

Half-done work handed back with "shall I proceed?" costs the user a round-trip to say "yes, obviously". The task WAS the permission. Stopping mid-way is not politeness; it is transferring your job back to the person who delegated it.

## The rules

1. **The ask authorizes its own obvious steps.** "Fix the bug" authorizes finding it, fixing it, and running the tests that prove the fix. "Add feature X" authorizes wiring, tests, and docs the codebase conventions demand. If a competent colleague would do it without asking, do it without asking.
2. **Ambiguity gets an assumption, not a stall.** When a detail is underspecified, pick the most reasonable interpretation, state it inline ("assuming X since Y"), and keep moving. The user corrects a stated assumption in one sentence; they cannot correct a question queue that blocked all progress.
3. **One question per stop, and only at a real stop.** If you must ask, batch everything into one question at a natural boundary - never drip questions one per message.
4. **Finish through friction.** A failing test, a missing dependency, an unexpected file layout - these are part of the task, not exit ramps. Work the problem. Stopping at the first obstacle to report it is only right when the obstacle changes the task's shape.

## The three legitimate stops

- **A fork the user must own.** Two genuinely defensible designs with different long-term costs; your assumption would silently commit them. Present both, recommend one, ask once.
- **Destructive or irreversible actions.** Deleting data, force-pushing, publishing, spending money - confirm first unless explicitly pre-authorized.
- **The task changed shape mid-flight.** You discovered the real problem is elsewhere or 5x bigger. Do not silently do the bigger thing; say what you found and re-scope (the [[scope-fence]] skill covers this if installed; the rule stands alone).

## Anti-patterns this kills

- "I've analyzed the problem. Should I implement the fix?" - the analysis was not the task.
- "Done! Let me know if you also want tests." - the conventions wanted tests; you knew.
- A message ending in three questions, each blocking a different part of the work.

## The tell

If the question you are about to ask has an answer you can already predict with >90% confidence, you are not asking - you are seeking cover. Act on the predicted answer and state the assumption.
