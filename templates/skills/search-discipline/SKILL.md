---
name: search-discipline
description: "Use whenever deciding whether to search the WEB and how to construct the queries - answering factual questions, evaluating products/versions/APIs, encountering unfamiliar names or terms. Encodes the rate-of-change rule, the unrecognized-entity rule, effort scaling, query construction, and source-trust calibration. Do not use for pure reasoning tasks with no factual dependency, nor for lookups inside a local repo or docs tree - those are grep/read questions, not search questions."
---

# search-discipline: search on rate-of-change, not on confidence

The failure mode is never "searched unnecessarily" - a wasted search costs seconds. The failure mode is answering from stale training data with fluent confidence. Searching costs seconds; confabulating costs the user's trust. When in doubt, that asymmetry decides.

## When to search

1. **Rate of change, not topic.** Ask: how fast does the true answer change? Daily/monthly (prices, versions, releases, holders of positions, policies, availability) -> always search. Effectively never (math, established science, historical fact, language semantics) -> answer directly. In between -> answer from knowledge AND verify the volatile parts.
2. **The unrecognized-entity rule.** An unfamiliar capitalized word in the request is almost certainly a name that postdates your training - not a common noun you can gloss over. The test: does answering require knowing what that thing is? If yes and you cannot place it: search. Knowing a franchise, vendor, or product line is NOT knowing its newest member.
3. **Specific product / model / version / recent technique named?** Search before answering. Partial recognition from training does not mean current knowledge.
4. **Present-tense phrasings of "settled" questions** ("does X exist", "is Y still the case", "who currently...") - the phrasing itself signals the answer may have moved. Search.
5. **Personal/company context** ("our pipeline", "my repo", company-specific terms) -> look in the local/internal source first, the web second. Possessives are routing signals.

## How to search

- **Short queries win.** 1-6 words. Start broad (1-2 words), then narrow with follow-ups. Do not re-run near-identical queries - they return the same results.
- **Use the actual current date** when a query needs a year. "latest X 2025" when it is 2026 retrieves stale answers that look fresh.
- **Snippets are not sources.** Search results are teasers; fetch the page before quoting, comparing, or deciding anything nontrivial from it.
- **Conflicting or thin results -> search more**, not "the sources disagree". Two more queries usually resolve what one left ambiguous.

## Effort scaling

Single fact: 1 fetch. Comparison or medium question: 3-5. Genuine research: 5-10 with a short plan first (which sources, what order, what settles it). If it clearly needs far more, say so and propose the deeper process instead of thrashing.

## Trust calibration

Treat fetched sources as EVIDENCE, not truth. Weigh three things before a claim graduates into your answer: authority (primary source > official docs > reputable secondary > random blog > forum hearsay), date (a current-looking page can carry stale content - check when it was written, not when it was served), and independence (three results parroting the same press release are one source, not three). Surprising claims from a single non-primary source get a second, independent confirmation before you repeat them. Raise extra skepticism in SEO-farmed spaces (product recommendations, "best X" listicles) and contested/conspiracy-prone topics. Never invent an attribution: if you are not sure a source says it, do not cite it as saying it.

After answering from search, the claims are still claims - verify load-bearing ones against the live system where one exists (see [[live-state-truth]], and [[jina-reader]] for fetching pages that block or garble a plain fetch).
