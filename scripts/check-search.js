// Focused search regression checks; synthetic messages only, no network or user data.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, overrides) {
  const module = { exports: {} };
  vm.runInNewContext(source(file), { module, Buffer, console, setTimeout, clearTimeout,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name) });
  return module.exports;
}

async function main() {
  const item = { uid: 7, accId: 'a', accEmail: 'example@163.com', path: 'INBOX',
    subject: 'ADNI Update [Do not reply]', from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'Reader', address: 'reader@example.com' }], date: '2026-10-22', seen: true };
  let saved = { uidValidity: '10', messages: [{ ...item, uid: 9, subject: 'Other mail' }, item], total: 2 };
  const cache = load('src/main/cache.js', {
    electron: { app: { getPath: () => '/unused' } },
    'fs/promises': { readFile: async () => JSON.stringify(saved) },
  });
  assert.equal((await cache.readList('a', 'INBOX', { search: 'UPDATE', limit: 1 })).messages[0].uid, 7,
    'Search must ignore case and filter before applying the limit');
  for (const search of ['sender', 'sender@example.com', 'reader', 'reader@example.com']) {
    assert.equal((await cache.readList('a', 'INBOX', { search })).messages.length, 2);
  }
  assert.equal((await cache.readList('a', 'INBOX', { search: 'absent' })).messages.length, 0);

  let result = [];
  let live = true;
  let fetched = [];
  let released = 0;
  class FakeImap extends EventEmitter {
    constructor() { super(); this.mailbox = { exists: 2, uidValidity: 10 }; }
    async connect() {}
    async noop() {}
    async getMailboxLock(folder, options) {
      assert.equal(folder, 'INBOX'); assert.equal(options.readOnly, true);
      return { release() { released++; } };
    }
    async search(query, options) { assert.equal(query.or[0].subject, 'update'); assert.equal(options.uid, true); return result; }
    async *fetch(uids, query, options) {
      fetched = Array.from(uids); assert.equal(options.uid, true);
      if (live && fetched.includes(7)) yield { uid: 7, envelope: { ...item, from: [item.from] }, flags: new Set(['\\Seen']) };
    }
  }
  const mail = load('src/main/mail.js', { electron: { app: { getVersion: () => 'test' } },
    imapflow: { ImapFlow: FakeImap }, './oauth': {}, './cache': cache });
  const account = { id: 'a', email: item.accEmail, imap: {}, user: 'test', pass: 'fixture' };
  const search = () => mail.listMessages(account, 'INBOX', { search: 'update' });
  assert.equal((await search()).messages[0].uid, 7, 'Server omission must not hide a live cached match');
  result = [7];
  assert.equal((await search()).messages.length, 1, 'Server/cache overlap must be deduplicated');
  assert.equal(fetched.length, 1);
  live = false;
  assert.equal((await search()).messages.length, 0, 'Deleted cached hits must not reappear');
  live = true; result = []; saved.uidValidity = 'old'; fetched = [];
  assert.equal((await search()).messages.length, 0);
  assert.equal(fetched.length, 0, 'Cached UIDs from an old generation must not be fetched');
  result = false;
  await assert.rejects(search(), /服务器未能完成搜索/);
  assert.equal(released, 5, 'Search errors must release the mailbox lock');

  const app = source('src/renderer/app.js');
  const handlers = {};
  const elements = { 'search-row': { hidden: false }, 'search-input': {
    focus() { this.focused = true; }, select() { this.selected = true; },
    addEventListener(name, fn) { handlers[name] = fn; } }, 'modal-root': { innerHTML: '' }, 'sync-status': {} };
  const context = { IS_COMPOSE_WINDOW: false, IS_READER_WINDOW: false, listToken: 0,
    document: { activeElement: { matches: () => true }, addEventListener(name, fn) { handlers.documentKeydown = fn; } },
    S: { accountsState: 'ready', accounts: [{ id: 'a' }, { id: 'b' }], status: { a: 'online', b: 'offline' },
      sel: { accId: 'a', path: 'INBOX' }, folders: {}, search: 'update', limit: 50, errors: [], messages: [], selectedKeys: new Set() },
    $: (id) => elements[id], isUnified: () => false, accById: () => ({ email: item.accEmail }),
    renderList() {}, closeMessage() {}, keyOf: (m) => String(m.uid), folderMeta: () => null,
    call: async (name) => {
      if (name === 'messages:cached') return { messages: [item], total: 2 };
      throw new Error('服务器未能完成搜索');
    },
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('const COMMON_SCOPES'), app.indexOf('function trustedSenders()'))
    + app.slice(app.indexOf('function renderSyncStatus()'), app.indexOf('// ---------- 列表'))
    + app.slice(app.indexOf('async function loadList()'), app.indexOf('async function refreshFolders('))
    + app.slice(app.indexOf("$('search-input').addEventListener('input'"), app.indexOf('// ---------- 主进程事件')), context);
  let prevented = false;
  handlers.documentKeydown({ ctrlKey: true, key: 'f', preventDefault() { prevented = true; } });
  assert(prevented, 'Ctrl+F must override browser find even when an input has focus');
  assert.equal(elements['search-input'].focused, true);
  assert.equal(elements['search-input'].selected, true);
  const html = source('src/renderer/index.html');
  assert(!html.includes('id="btn-search"'), 'Sidebar search entry must be removed');
  assert(/id="search-row">/.test(html), 'Search field must be visible initially');
  handlers.keydown({ key: 'Escape', target: elements['search-input'], preventDefault() {}, stopPropagation() {} });
  assert.equal(context.S.search, '');
  assert.equal(elements['search-row'].hidden, false, 'Escape must keep the search field visible');
  context.S.search = 'update';
  await context.loadList();
  assert.equal(context.S.messages[0].uid, 7, 'Remote search failure must retain local matches');
  assert.equal(elements['sync-status'].textContent, '搜索未完成');
  context.S.errors = []; context.renderSyncStatus();
  assert.equal(elements['sync-status'].textContent, '搜索完成');
  context.S.search = ''; context.renderSyncStatus();
  assert.equal(elements['sync-status'].textContent, '已同步', 'An unrelated offline account must not mask selected-folder status');
  console.log('PASS: persistent search, Ctrl+F focus, Escape clear, cached matching, remote omissions/errors, UID generation, deduplication, lock release, and scoped status.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
