// 有界验证：真实磁盘缓存、离线回退和异步列表/正文切换；不连接邮箱。
const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const tmp = path.join(root, 'tmp');
  await fs.mkdir(tmp, { recursive: true });
  const location = await fs.mkdtemp(path.join(tmp, 'cache-check-'));
  try {
    const cacheSource = await fs.readFile(path.join(root, 'src/main/cache.js'), 'utf8');
    const loadCache = () => {
      const module = { exports: {} };
      vm.runInNewContext(cacheSource, {
        module, require: (name) => name === 'electron' ? { app: { getPath: () => location } } : require(name),
      });
      return module.exports;
    };
    let cache = loadCache();
    const old = { uid: 1, accId: 'a', path: 'INBOX', date: '2026-10-17', seen: false };
    assert.equal(await cache.readList('a', 'INBOX'), null);
    await cache.writeList('a', 'INBOX', { messages: [old], total: 1 }, 10);
    await cache.writeBody('a', 'INBOX', 1, { ...old, html: '<p>cached</p>' }, 10);
    cache = loadCache(); // 模拟重启：新模块仍能读取之前写入的缓存。
    assert.equal((await cache.readList('a', 'INBOX')).messages[0].uid, 1);
    assert.equal((await cache.readBody('a', 'INBOX', 1)).html, '<p>cached</p>');
    assert.equal(await cache.readList('b', 'INBOX'), null);
    assert.equal(await cache.readList('a', 'Trash'), null);
    await cache.updateMessages('a', 'INBOX', [1], { seen: true, flagged: true });
    assert.equal((await cache.readList('a', 'INBOX')).messages[0].seen, true);
    assert.equal((await cache.readBody('a', 'INBOX', 1)).flagged, true);
    await cache.writeList('a', 'INBOX', { messages: [old], total: 1 }, 11);
    assert.equal(await cache.readBody('a', 'INBOX', 1), null);
    await cache.writeBody('a', 'INBOX', 1, { ...old, html: '<p>new</p>' }, 11);
    await cache.updateMessages('a', 'INBOX', [1], null);
    assert.equal((await cache.readList('a', 'INBOX')).messages.length, 0);
    assert.equal(await cache.readBody('a', 'INBOX', 1), null);

    const source = await fs.readFile(path.join(root, 'src/renderer/app.js'), 'utf8');
    const listFunction = source.slice(source.indexOf('async function loadList()'), source.indexOf('async function refreshFolders('));
    const bodyFunction = source.slice(source.indexOf('async function openMessage('), source.indexOf('function renderReader()'));
    const requests = [];
    const context = {
      S: { accountsState: 'ready', accounts: [{ id: 'a' }, { id: 'b' }], sel: { accId: null, path: 'INBOX' }, limit: 50, search: '', messages: [], folders: {}, errors: [] },
      listToken: 0, msgToken: 0,
      isUnified: () => context.S.sel.accId === null,
      accById: (id) => ({ email: id }), keyOf: (m) => `${m.accId}|${m.path}|${m.uid}`,
      renderList() {}, renderFoot() {}, renderReader() {}, renderNav() {}, totalUnread: () => 0,
      closeMessage() { context.S.cur = null; },
      guard: async (fn) => { try { return await fn(); } catch { return undefined; } },
      call: async (name, id) => {
        if (name === 'messages:cached') return id === 'a' ? { messages: [old], total: 1 } : null;
        if (name === 'message:cached') return { ...old, html: 'saved body' };
        if (name === 'app:unread') return true;
        const task = deferred(); requests.push({ name, id, ...task }); return task.promise;
      },
    };
    vm.createContext(context);
    vm.runInContext(listFunction + '\n' + bodyFunction, context);
    const loading = context.loadList();
    await tick();
    assert.equal(context.S.messages[0].uid, 1, '缓存必须在网络请求完成之前显示');
    assert.equal(context.S.loading, true);
    requests.find((r) => r.id === 'b').resolve({ messages: [{ ...old, uid: 2, accId: 'b', date: '2026-10-18' }], total: 1 });
    await tick();
    assert.equal(context.S.messages[0].uid, 2, '先返回的邮箱应即时合并');
    requests.find((r) => r.id === 'a').reject(new Error('offline'));
    await loading;
    assert.equal(context.S.messages.length, 2, '同步失败必须保留缓存');
    assert.equal(context.S.loading, false);
    requests.length = 0;
    const opening = context.openMessage(old);
    await tick();
    assert.equal(context.S.cur.html, 'saved body', '正文必须在网络返回前可读');
    requests[0].reject(new Error('offline'));
    await opening;
    assert.equal(context.S.cur.html, 'saved body');
    requests.length = 0;
    const stale = context.loadList();
    await tick();
    context.listToken++;
    context.S.messages = [{ uid: 999 }];
    requests.forEach((r) => r.resolve({ messages: [], total: 0 }));
    await stale;
    assert.equal(context.S.messages[0].uid, 999, '旧请求不能覆盖新视图');
    console.log('ok cache persistence, isolation, UIDVALIDITY, flags/removal, cache-first list/body, offline fallback, progressive loading, stale request protection');
  } finally {
    const resolved = path.resolve(location);
    if (!resolved.startsWith(path.resolve(tmp) + path.sep)) throw new Error('Invalid test cleanup path');
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
