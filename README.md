# wikijs — read-only Wiki.js plugin for Claude Code

Lets Claude search and read the corporate Wiki.js (is it a bug or expected behavior? how should X work?) and navigate the page tree. Read-only.

## Install (Claude desktop app, Code tab)

```
/plugin marketplace add <this repo's GitHub URL or owner/repo>
/plugin install wikijs@foxway
```

Update later with `/plugin marketplace update foxway`.

## Use

Ask in any language, e.g. "Is 'Client not linked' on a bid a bug? Check the wiki."

- **No token (default):** Claude opens the wiki in the built-in browser; sign in with SSO yourself. You see only what your wiki account can see.
- **With a read-only API key (optional):** set `WIKIJS_URL` and `WIKIJS_TOKEN` env vars (key in a Wiki.js group with only `read:pages`/`read:source`), restart Claude Code. Uses the MCP tools `wiki_search`, `wiki_get_page`, `wiki_browse`.

Self-test: `node test.mjs`.
