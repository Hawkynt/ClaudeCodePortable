---
name: jina-reader
description: "Fetch a webpage as clean, structured Markdown via the jina.ai reader (r.jina.ai) instead of raw HTML — use whenever you need to read web content and want to save tokens, or when a normal fetch is blocked (HTTP 403/401), returns messy/boilerplate HTML, or the page is JavaScript-rendered (SPA, docs sites, wikis like grokipedia/notion/medium). Triggers: \"fetch this page\", \"read this URL\", \"summarize this article/webpage\", \"get the docs at <url>\", or any WebFetch that returned 403/garbled HTML."
---

# jina.ai reader — clean Markdown from any URL

The jina.ai reader proxies a target page and returns **readable Markdown** (article text, headings, tables, code — boilerplate/nav/ads stripped). This is far cheaper in tokens than raw HTML and often succeeds where a direct fetch is blocked or the page is JS-rendered.

## How to use

Prefix the target URL with `https://r.jina.ai/` and fetch that, then run your prompt against the result:

```
WebFetch(
  url:    "https://r.jina.ai/https://example.com/some/article",
  prompt: "<what you want extracted>"
)
```

Rules:
- Keep the target URL's scheme in the path: `https://r.jina.ai/https://…` (or `http://…`). Do not URL-encode it.
- Works for both `WebFetch` and a raw `curl -s "https://r.jina.ai/https://…"` in Bash when you need the full text rather than an LLM extraction.

## When to reach for it (vs a plain fetch)

- A direct `WebFetch` returned **HTTP 403/401** or a cross-host redirect loop.
- The page is a **JS-heavy SPA / wiki / docs site** (grokipedia, notion, medium, confluence, gitbook) where raw HTML is mostly script.
- You want **structured Markdown to save tokens** — long articles, API docs, spec pages, tables.
- You only need the **readable content**, not the exact HTML/DOM.

## When NOT to use it

- Authenticated/private URLs (jina can't see your session) — use the proper authenticated tool (`gh`, an MCP fetch, Google Drive/Gmail tools).
- You specifically need the **raw bytes/HTML/JSON** of an API or file (fetch the URL directly).
- Very large pages you only need a slice of — fetch directly with a narrow prompt if the direct fetch works.

## Caveats

- It's a third-party proxy: the target URL (but not your auth) is sent to jina.ai. Don't route sensitive/internal URLs through it.
- Content is a rendered snapshot; for fast-changing pages re-fetch rather than trusting a cache.
- If jina itself is rate-limited or errors, fall back to a direct `WebFetch`/`curl`, or `WebSearch`.
