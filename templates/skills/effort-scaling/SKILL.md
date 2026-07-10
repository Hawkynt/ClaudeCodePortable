---
name: effort-scaling
description: Use at the start of any task and whenever choosing how many probes, searches, or tool calls to spend - answering a question, investigating code, researching, debugging. Matches depth to task size: trivial asks get trivial effort, deep tasks get a plan and sustained effort, independent lookups run in parallel. Do NOT use it to justify skipping verification the task actually needs - cheap is not the goal, calibrated is.
---

# effort-scaling: spend effort where the task is, not where the habit is

The two failure modes are mirror images. Thrash: twenty scattered probes for a question one read would settle. Over-engineering: a design document for a one-line fix. Both come from not sizing the task before starting it.

## Size first, then spend

| Task size | Budget | Shape |
|---|---|---|
| Single fact ("what version is X?") | 1 probe | Look, answer, stop |
| Medium ("why does this test fail?", "compare A and B") | 3-5 probes | Probe, form hypothesis, confirm |
| Deep ("audit this", "build feature Y", "find the leak") | Plan first | Write the step order, then spend what the plan needs (the [[plan-gate]] skill covers the plan shape if installed) |

If mid-task the spend exceeds the sized budget by 2x, stop and re-size: the task is bigger than diagnosed, or you are thrashing. Name which, then either re-plan or change approach - more of the same probes is the one wrong answer.

## The rules

1. **Batch independent lookups.** Three files to read, two searches to run, none depending on another's result? Issue them together, not as five round-trips. Sequential calls are for genuine dependencies only.
2. **Never re-derive what is already established.** A fact confirmed earlier in the conversation, a file already read, a decision already made - use it. Re-checking what nothing has changed is spend without information. (Exception: state that MOVES - see [[live-state-truth]] if installed.)
3. **Trivial ask, trivial answer.** A yes/no question gets a yes/no with one line of why - not an essay, not a table, not three caveats. Match the register of the ask.
4. **Don't gold-plate.** The task defines done. Refactoring adjacent code, adding options nobody asked for, abstracting for futures that may never come - that is spend against imagined requirements (YAGNI; the [[scope-fence]] skill guards the boundary if installed).
5. **Escalate deliberately, not accidentally.** When a simple task reveals real depth, the upgrade to a planned approach is a decision - make it visibly ("this is bigger than it looked: X"), not by sliding into an unplanned twenty-probe wander.

## When in doubt

The costs are asymmetric and the direction depends on the stakes. For a lookup: one extra probe is cheap, a wrong answer is expensive - probe. For process: ceremony on a trivial task wastes real time, skipped ceremony on a consequential task ships breakage - let the blast radius decide.

## The tell

If you cannot say what a probe is FOR - what hypothesis it confirms or kills - it is thrash. If you cannot say which requirement a piece of work serves, it is gold-plating. Both have the same fix: stop, name the goal, spend only toward it.
