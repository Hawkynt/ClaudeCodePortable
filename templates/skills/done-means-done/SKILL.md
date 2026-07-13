---
name: done-means-done
description: "Use immediately before declaring any task complete, closing any request, or presenting work as finished. Forces a completion audit against the ORIGINAL request - every explicit requirement ticked off as done-and-verified, everything skipped named plainly. Do NOT confuse it with correctness review (that is adversarial-verify's job): this catches what you DIDN'T do, not what you did wrong."
---

# done-means-done: audit against the ask, not against your memory of it

Long tasks erode the request. By the end, "add the feature with tests, update the docs, and keep the old API working" has quietly become "add the feature" - and the model that did 60% of the work sincerely believes it did 100%. The defense is mechanical: re-read the source of truth before saying done.

## The audit

Before the words "done", "complete", or "finished" leave you:

1. **Re-read the ORIGINAL request.** The actual message(s) - scroll back to them. Not your plan, not your summary, not your memory; all three drift. Include requirements added mid-conversation ("also make sure it...", "oh and don't touch...").
2. **Extract every explicit requirement.** Each noun-verb the user asked for: the feature AND the tests AND the docs AND the constraint ("without breaking X", "in the same style as Y"). Constraints are requirements; so are prohibitions.
3. **For each: done, and verified HOW?** "Implemented" is a claim; "implemented, test Z passes, ran it" is a verified item. An item you believe works but never exercised gets marked honestly: "written, not yet run".
4. **Anything not done gets NAMED, never dropped.** "I skipped the migration script because the schema question is still open" costs one sentence and keeps trust. A silently missing item costs the user a debugging session to discover your omission.
5. **Check the deliverable reached its destination.** The file written (not just drafted in your head), the answer actually stated (not implied), the command output shown (not summarized away).

## The traps this catches

- **"Tests green" masquerading as "requirements met".** The suite passing proves you didn't break what the suite covers - not that you built what was asked. These are different facts.
- **The forgotten second half.** "Do X and Y" where Y was mentioned once and never again. Multi-part requests fail at the AND.
- **The eroded constraint.** "...but keep it backwards compatible" honored for the first file and forgotten by the fourth.
- **The upgraded interpretation.** You built something better than asked - and didn't build what was asked. State the substitution explicitly and why; the user may want the boring version.

## Relation to companions

This is the completeness gate; [[adversarial-verify]] is the correctness gate (attack what you built), and together they bracket the finish (both stand alone if the other is not installed). Run this one LAST - a correct implementation of half the request still fails the audit.

## The tell

If you are summarizing what you did instead of checking it against what was asked, you are writing a defense, not an audit. The audit reads the request first and your work second - never the other way around.
