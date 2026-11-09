# wikijs — read-only Wiki.js plugin for Claude Code

Lets Claude search and read the corporate Wiki.js (is it a bug or expected behavior? how should X work?) and navigate the page tree. Read-only.

## Install (Claude desktop app, or Claude Code CLI with the Claude in Chrome extension)

```
/plugin marketplace add <this repo's GitHub URL or owner/repo>
/plugin install wikijs@foxway
```

Update later with `/plugin marketplace update foxway`.

## Use

Ask in any language, e.g. "Is 'Client not linked' on a bid a bug? Check the wiki."

- **No token (default):** before opening anything, Claude asks
  1. which wiki to use, unless you already gave it or `WIKIJS_URL` is set, in the form `https://wiki.example.tech`;
  2. which browser: the **built-in browser** (desktop app) or **your own Chrome** (Claude in Chrome extension).

  Then you sign in with SSO yourself in that browser. You see only what your wiki account can see.

  Claude asks these once per conversation and then searches without asking again; each lookup (search plus reading the top 3 pages) is a single browser call. If the Claude app itself asks you to allow the wiki site or the page script, choose the option that allows it for that site going forward, so you aren't asked on every search.
- **With a read-only API key (optional):** set `WIKIJS_URL` and `WIKIJS_TOKEN` env vars (key in a Wiki.js group with only `read:pages`/`read:source`), restart Claude Code. Uses the MCP tools `wiki_search`, `wiki_get_page`, `wiki_browse`.

Self-test: `node test.mjs`.
