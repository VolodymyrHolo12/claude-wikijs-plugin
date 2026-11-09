#!/usr/bin/env node
// Read-only Wiki.js (2.x GraphQL) MCP server over stdio. Zero dependencies.
// Read-only by construction: only the fixed queries below are ever sent; no mutations, no raw GraphQL.
import { createInterface } from 'node:readline';

const BASE = (process.env.WIKIJS_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.WIKIJS_TOKEN || '';
const LOCALE = process.env.WIKIJS_LOCALE || 'en';
const MAX_CONTENT = 60000; // shortcut: big pages are truncated, add paging if people hit it

const QUERIES = {
  search: `query($q:String!,$path:String,$locale:String){pages{search(query:$q,path:$path,locale:$locale){results{id title description path locale} suggestions totalHits}}}`,
  byId: `query($id:Int!){pages{single(id:$id){id path locale title description content updatedAt tags{tag}}}}`,
  byPath: `query($path:String!,$locale:String!){pages{singleByPath(path:$path,locale:$locale){id path locale title description content updatedAt tags{tag}}}}`,
  tree: `query($path:String,$parent:Int,$locale:String!){pages{tree(path:$path,parent:$parent,mode:ALL,locale:$locale,includeAncestors:false){id path title isFolder pageId parent}}}`,
};

async function gql(query, variables) {
  if (!BASE || !TOKEN) throw new Error('WIKIJS_URL and WIKIJS_TOKEN env vars must be set');
  const res = await fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
    redirect: 'error', // never follow the token to another host
  });
  if (!res.ok) throw new Error(`Wiki.js HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data.pages;
}

const pageUrl = (p) => `${BASE}/${p.locale}/${p.path}`;

const TOOLS = [
  {
    name: 'wiki_search',
    description: 'Full-text search of the corporate Wiki.js. Returns page ids, titles, paths and URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        path: { type: 'string', description: 'Optional path prefix to restrict the search, e.g. "products/api"' },
      },
      required: ['query'],
    },
    run: async ({ query, path }) => {
      const r = (await gql(QUERIES.search, { q: query, path, locale: LOCALE })).search;
      // search ids are search-index ids, not page ids (pages.single(id) returns a different page) — expose path only
      return { totalHits: r.totalHits, suggestions: r.suggestions, results: r.results.map(({ id, ...p }) => ({ ...p, url: pageUrl(p) })) };
    },
  },
  {
    name: 'wiki_get_page',
    description: 'Read one Wiki.js page (markdown source) by numeric id or by path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Page path from wiki_search, without locale, e.g. "products/api/exports" (preferred)' },
        id: { type: 'integer', description: 'Real page id (e.g. from wiki_browse pageId) — not a wiki_search result' },
      },
    },
    run: async ({ id, path }) => {
      let p;
      if (id != null) p = (await gql(QUERIES.byId, { id: Number(id) })).single;
      else if (path) p = (await gql(QUERIES.byPath, { path: path.replace(/^\/+/, ''), locale: LOCALE })).singleByPath;
      else throw new Error('Pass id or path');
      if (!p) throw new Error('Page not found');
      const truncated = p.content.length > MAX_CONTENT;
      return { ...p, tags: p.tags?.map((t) => t.tag), url: pageUrl(p), content: p.content.slice(0, MAX_CONTENT), truncated };
    },
  },
  {
    name: 'wiki_browse',
    description: 'List the children (pages and folders) of a wiki folder, to navigate the page tree. No arguments = root.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'integer', description: 'Folder id from a previous wiki_browse result (preferred)' },
        path: { type: 'string', description: 'Folder path, e.g. "products"' },
      },
    },
    run: async ({ parent, path }) =>
      (await gql(QUERIES.tree, { parent: parent ?? (path ? undefined : 0), path, locale: LOCALE })).tree,
  },
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification, e.g. notifications/initialized
  try {
    let result;
    if (method === 'initialize')
      result = { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'wikijs-readonly', version: '0.1.0' } };
    else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools: TOOLS.map(({ run, ...t }) => ({ ...t, annotations: { readOnlyHint: true } })) };
    else if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
      try {
        result = { content: [{ type: 'text', text: JSON.stringify(await tool.run(params.arguments ?? {}), null, 2) }] };
      } catch (e) {
        result = { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    } else return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    send({ jsonrpc: '2.0', id, result });
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  handle(msg);
});
