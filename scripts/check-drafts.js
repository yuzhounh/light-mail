// 本地草稿保存/恢复及发送、放弃路径；不连接邮箱、不发送真实邮件。
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tmp = path.join(root, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
const location = fs.mkdtempSync(path.join(tmp, 'draft-check-'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const storeSource = fs.readFileSync(path.join(root, 'src/main/store.js'), 'utf8');
const loadStore = () => {
  const module = { exports: {} };
  vm.runInNewContext(storeSource, { module, require: (name) => name === 'electron'
    ? { app: { getPath: () => location }, safeStorage: {} } : require(name), Buffer });
  return module.exports;
};
let store = loadStore();
const source = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const composeSource = source.slice(source.indexOf('let composeOpening ='), source.indexOf('function replyTo('));
const accounts = [{ id: 'a', email: 'a@example.com' }, { id: 'b', email: 'b@example.com' }];
const windows = [];
function client() {
  const dom = new JSDOM('<div id="modal-root"></div>');
  windows.push(dom.window);
  const document = dom.window.document;
  const state = { S: { accounts, sel: { accId: null, path: 'INBOX' } },
    window: dom.window, document, crypto: require('crypto'), IS_COMPOSE_WINDOW: true,
    $: (id) => document.getElementById(id), isUnified: () => true,
    accById: (id) => accounts.find((a) => a.id === id),
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    ic: () => '', fmtSize: String, toast() {}, openAccountDialog() {}, loadList() {}, renderHead() {}, renderNav() {}, renderList() {},
    confirm: () => true, failSend: false, failSave: false,
    guard: async (fn) => fn(),
    call: async (name, ...args) => {
      if (name === 'draft:get') return store.getDraft();
      if (name === 'draft:discard') return store.clearDraft(args[0]);
      if (name === 'files:pick') return [{ path: 'D:/test/example.txt', name: 'example.txt', size: 12 }];
      if (name === 'message:send') {
        if (state.failSend) throw new Error('test offline');
        state.lastSent = args;
        store.clearDraft(args[2]);
        return { draftCleared: true };
      }
      throw new Error('Unexpected call ' + name);
    },
  };
  dom.window.api = { saveDraft: (draft) => {
    if (state.failSave) throw new Error('test disk failure');
    return store.saveDraft(draft);
  } };
  dom.window.close = () => { state.windowClosed = true; };
  vm.createContext(state);
  vm.runInContext(composeSource, state);
  state.type = (id, value) => {
    const element = document.getElementById(id);
    element.value = value;
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  state.click = async (action) => {
    document.querySelector(`[data-c="${action}"]`).click();
    await tick();
  };
  return state;
}
async function main() {
  let c = client();
  await c.openCompose();
  assert.equal(store.getDraft(), null);
  c.type('c-to', 'recipient@example.com');
  c.type('c-subject', 'Subject <&>');
  c.type('c-body', 'Draft body\n第二行');
  c.type('c-from', 'b');
  await c.click('attach');
  assert.equal(store.getDraft().body, 'Draft body\n第二行');
  assert.equal(store.getDraft().attachments.length, 1);
  await c.click('cancel');
  assert.equal(c.$('c-body'), null);
  assert.ok(store.getDraft());
  store = loadStore(); // 新建存储和界面实例，模拟程序重启。
  c = client();
  await c.openCompose();
  assert.equal(c.$('c-subject').value, 'Subject <&>');
  assert.equal(c.$('c-from').value, 'b');
  assert.equal(c.$('c-body').value, 'Draft body\n第二行');
  assert.ok(c.$('c-atts').textContent.includes('example.txt'));
  c.failSend = true;
  await c.click('send');
  assert.ok(store.getDraft());
  assert.equal(c.$('c-body').disabled, false);
  c.failSave = true;
  c.type('c-body', 'unsaved text');
  await c.click('cancel');
  assert.ok(c.$('c-body'), '保存失败不能关闭并丢弃内容');
  c.failSave = false;
  c.type('c-body', 'saved text');
  c.failSend = false;
  await c.click('send');
  assert.equal(store.getDraft(), null);
  assert.equal(c.$('c-body'), null);
  await c.openCompose({ accId: 'a', subject: 'Re: test', body: 'quoted', inReplyTo: '<original>', references: ['<ref>'] });
  assert.equal(store.getDraft().inReplyTo, '<original>');
  c.confirm = () => false;
  await c.click('discard');
  assert.ok(store.getDraft());
  c.confirm = () => true;
  await c.click('discard');
  assert.equal(store.getDraft(), null);
  await c.openCompose();
  c.type('c-body', 'content');
  c.type('c-body', '');
  await c.click('cancel');
  assert.equal(store.getDraft().body, '', '清空后关闭不能恢复旧正文');
  const id = store.getDraft().id;
  assert.equal(store.clearDraft('other-id'), false);
  assert.equal(store.getDraft().id, id);
  console.log('ok draft input persistence, restart recovery, sender/attachments/reply metadata, send failure/success, save failure protection, confirmed discard, cleared content');
}
main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => {
  windows.forEach((window) => window.close());
  const resolved = path.resolve(location);
  if (!resolved.startsWith(path.resolve(tmp) + path.sep)) throw new Error('Invalid test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
});
