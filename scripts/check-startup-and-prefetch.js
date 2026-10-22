// Fault-injection checks with disposable local data; never connects to real mailboxes.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => { for (let n = 0; n < 8; n++) await tick(); };
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const location = fs.mkdtempSync(path.join(root, 'tmp/startup-prefetch-'));

function load(file, overrides = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(source(file), { module, exports: module.exports, Buffer, console, setTimeout, clearTimeout,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name), ...globals }, { filename: file });
  return module.exports;
}

async function checkStore() {
  const electron = { app: { getPath: () => location }, safeStorage: {
    decryptString: () => { throw new Error('credential unavailable'); },
  } };
  const file = path.join(location, 'accounts.json');
  const original = JSON.stringify([{ id: 'a', email: 'a@example.com', pass: 'enc:placeholder' }]);
  fs.writeFileSync(file, original);
  let blocked = true;
  const disk = { ...fs, readFileSync: (...args) => {
    if (blocked && args[0] === file) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    return fs.readFileSync(...args);
  } };
  let store = load('src/main/store.js', { electron, fs: disk });
  assert.throws(() => store.listAccounts(), { code: 'EBUSY' });
  assert.throws(() => store.saveAccount({ id: 'b', email: 'b@example.com', pass: 'x' }), { code: 'EBUSY' });
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'failed read must never overwrite account file');
  blocked = false;
  assert.equal(store.listAccounts().length, 1, 'account metadata must not depend on password decryption');
  assert.throws(() => store.getAccount('a'), /credential unavailable/);
  assert(!Object.hasOwn(store.listAccounts()[0], 'pass'));
  fs.writeFileSync(file, '{broken');
  store = load('src/main/store.js', { electron, fs: disk }); // A new process must validate its initial disk contents.
  assert.throws(() => store.listAccounts(), { code: 'INVALID_JSON' });
  fs.writeFileSync(file, original);
  fs.mkdirSync(path.join(location, 'mail-cache'), { recursive: true });
  fs.unlinkSync(file);
  store = load('src/main/store.js', { electron, fs: disk });
  assert.throws(() => store.listAccounts(), { code: 'ACCOUNTS_MISSING' });
  fs.writeFileSync(file, original);
}

async function checkRenderer() {
  const dom = new JSDOM(source('src/renderer/index.html'), { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const retries = [];
  const nativeTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, delay, ...args) => fn.name === 'loadAccounts' ? (retries.push(fn), retries.length) : nativeTimeout(fn, delay, ...args);
  let attempts = 0;
  let fail = true;
  const account = { id: 'a', email: 'a@example.com', name: 'Example' };
  const item = { accId: 'a', accEmail: account.email, path: 'INBOX', uid: 1, subject: 'Cached example',
    from: { name: 'Example', address: 'sender@example.com' }, to: [], date: new Date().toISOString(), seen: false, preview: 'offline' };
  w.api = { on() {}, saveDraft() {}, async call(name, ...args) {
    if (name === 'accounts:list') { attempts++; if (fail) throw new Error('temporarily unavailable'); return [account]; }
    if (name === 'settings:get') { assert.equal(args[0], true); throw new Error('optional settings unavailable'); }
    if (name === 'draft:get') throw new Error('optional draft unavailable');
    if (name === 'folders:list') return [{ path: 'INBOX', label: '收件箱', specialUse: '\\Inbox', unseen: 1 }];
    if (name === 'messages:cached' || name === 'messages:list') return { messages: [item], total: 1 };
    return true;
  } };
  w.eval(source('src/renderer/mail-actions.js') + '\n' + source('src/renderer/app.js') + '\nwindow.startupTestState = S;');
  await settle();
  assert(w.document.querySelector('#list').textContent.includes('加载失败'));
  assert(!w.document.querySelector('#list').textContent.includes('还没有邮箱账户'));
  assert.equal(retries.length, 1, 'startup failure must schedule recovery');
  fail = false;
  await retries.shift()();
  await settle();
  assert.equal(attempts, 2);
  assert.equal(w.startupTestState.accounts.length, 1, 'account recovery must not require restart');
  assert.equal(w.document.querySelectorAll('#list .row').length, 1, 'optional failures must not hide cached mail');
  assert(w.document.querySelector('#acct-head').textContent.includes(account.email));
  dom.window.close();
}

async function checkPrefetch() {
  const cache = load('src/main/cache.js', { electron: { app: { getPath: () => location } } });
  let failWrite = true;
  const retry = [];
  let cachedAtNotification = false;
  let bodyWritten = false;
  let listWritten = false;
  let checkpoint = 1;
  let client;
  class FakeImap extends EventEmitter {
    constructor() { super(); client = this; this.usable = true; this.mailbox = { uidNext: 3, uidValidity: 7, exists: 2 }; }
    async connect() {}
    async getMailboxLock(folder, options) { assert.equal(options.readOnly, true); return { release() {} }; }
    async search() { return [2]; }
    async *fetch(ids, query) {
      assert.equal(query.size, true, 'new mail must inspect size before deciding to prefetch');
      yield { uid: 2, flags: new Set(), envelope: { subject: 'New example', from: [{ address: 'sender@example.com' }], to: [] },
        size: 150 };
    }
    async fetchOne() { return { source: Buffer.from('From: sender@example.com\r\nTo: a@example.com\r\nSubject: New example\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBackground cached body') }; }
    messageFlagsAdd() { throw new Error('prefetch must never change read flags'); }
    close() { this.usable = false; this.emit('close'); }
  }
  const mail = load('src/main/mail.js', { electron: { app: { getVersion: () => 'fixture' } }, './oauth': {}, imapflow: { ImapFlow: FakeImap }, './cache': {
    ...cache,
    writeBody: async (...args) => {
      if (failWrite) throw Object.assign(new Error('disk busy'), { code: 'EBUSY' });
      await cache.writeBody(...args); bodyWritten = true;
    },
    writeList: async (...args) => { await cache.writeList(...args); listWritten = true; },
  } }, { setTimeout: (fn) => (retry.push(fn), retry.length), clearTimeout() {} });
  const notifications = [];
  const watcher = mail.startWatcher({ id: 'a', email: 'a@example.com', user: 'a', pass: 'example', imap: {} }, {
    status() {}, changed() {}, saveUid(id, uid) { checkpoint = uid; }, prefetchError() {},
    newMail(acc, items) { assert(bodyWritten && listWritten, 'notification must follow completed body and list writes'); notifications.push(...items); cachedAtNotification = true; },
  }, 1);
  try {
    await settle();
    assert.equal(checkpoint, 1, 'failed cache writes must not advance checkpoint');
    assert.equal(notifications.length, 0, 'never notify before cache succeeds');
    assert.equal(retry.length, 1);
    failWrite = false;
    await retry.shift()();
    const body = await cache.readBody('a', 'INBOX', 2);
    const list = await cache.readList('a', 'INBOX');
    assert(body.text.includes('Background cached body'));
    assert.equal(list.messages[0].seen, false);
    assert.equal(checkpoint, 2);
    assert.equal(notifications.length, 1);
    assert(cachedAtNotification);
    assert(client.usable);
  } finally { watcher.stop(); }
}

(async () => {
  await checkStore();
  await checkRenderer();
  await checkPrefetch();
  console.log('PASS: account read failures preserve data; credential-independent metadata; startup auto recovery; optional failure isolation; new-mail body/list caching, retry, and no read-flag changes.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
