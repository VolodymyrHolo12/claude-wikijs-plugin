// Self-check: fake Wiki.js on localhost, drive server.mjs over stdio. Run: node test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const seen = [];
const page = { id: 7, path: 'api/exports', locale: 'en', title: 'Exports', description: 'd', content: 'Nulls are expected.', updatedAt: '2026-01-01T00:00:00Z', tags: [{ tag: 'api' }] };
const wiki = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c)).on('end', () => {
    const { query } = JSON.parse(b);
    seen.push({ query, auth: req.headers.authorization });
    const pages = query.includes('search(') ? { search: { results: [page], suggestions: [], totalHits: 1 } }
      : query.includes('single(') ? { single: page }
      : query.includes('singleByPath(') ? { singleByPath: page }
      : { tree: [{ id: 1, path: 'api', title: 'API', isFolder: true, pageId: null, parent: 0 }] };
    res.setHeader('Content-Type', 'application/json').end(JSON.stringify({ data: { pages } }));
  });
}).listen(0);
await new Promise((r) => wiki.on('listening', r));

const srv = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], {
  env: { ...process.env, WIKIJS_URL: `http://127.0.0.1:${wiki.address().port}`, WIKIJS_TOKEN: 'test-token' },
});
const pending = new Map();
let buf = '';
srv.stdout.on('data', (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0; ) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    pending.get(m.id)?.(m);
  }
});
let n = 0;
const rpc = (method, params) => new Promise((r) => { const id = ++n; pending.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = async (name, args) => { const m = await rpc('tools/call', { name, arguments: args }); assert.ok(!m.result.isError, m.result.content[0].text); return JSON.parse(m.result.content[0].text); };

assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18' })).result.serverInfo.name, 'wikijs-readonly');
assert.deepEqual((await rpc('tools/list')).result.tools.map((t) => t.name), ['wiki_search', 'wiki_get_page', 'wiki_browse']);
assert.equal((await call('wiki_search', { query: 'exports' })).results[0].url.endsWith('/en/api/exports'), true);
assert.equal((await call('wiki_get_page', { id: 7 })).content, 'Nulls are expected.');
assert.deepEqual((await call('wiki_get_page', { path: '/api/exports' })).tags, ['api']);
assert.equal((await call('wiki_browse', {}))[0].isFolder, true);
assert.equal((await rpc('tools/call', { name: 'wiki_delete', arguments: {} })).error.code, -32602);

assert.ok(seen.every((s) => s.auth === 'Bearer test-token'));
assert.ok(seen.every((s) => !/mutation/i.test(s.query)), 'server must never send mutations');
console.log(`OK: ${seen.length} wiki calls, all read-only`);
srv.kill(); wiki.close();
