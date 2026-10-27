// 不连接真实邮箱：验证多选、跨邮箱分组、永久删除确认和文件夹保护。
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const actions = fs.readFileSync(path.join(root, 'src/renderer/mail-actions.js'), 'utf8');
const mail = fs.readFileSync(path.join(root, 'src/main/mail.js'), 'utf8');
async function main() {
  const messages = [1, 2, 3].map((uid) => ({ accId: uid === 3 ? 'b' : 'a', uid, path: 'INBOX', seen: false }));
  const calls = [];
  let permanent = false;
  const c = {
    S: { accounts: [{ id: 'a' }, { id: 'b' }], messages, selectedKeys: new Set(), anchorKey: null, cur: null },
    visibleMessages: () => c.S.messages, keyOf: (m) => `${m.accId}|${m.path}|${m.uid}`,
    renderList() {}, renderReader() {}, updateMessageSelection() {}, closeMessage() {}, toast() {}, refreshFolders: async () => {}, loadList: async () => {},
    accById: (id) => ({ email: `${id}@example.com` }),
    folderMeta: () => ({ specialUse: permanent ? '\\Trash' : '\\Inbox' }),
    confirm: () => false,
    call: async (...args) => { calls.push(args); return true; },
  };
  vm.createContext(c); vm.runInContext(actions, c);
  c.selectMessage(messages[0]);
  c.selectMessage(messages[2], false, true);
  assert.equal(c.selectedMessages().length, 3);
  c.selectMessage(messages[1], true);
  assert.equal(c.selectedMessages().length, 2);
  await c.runMessageAction('read');
  assert.equal(calls.length, 2, '跨邮箱操作须按邮箱分组');
  assert.equal(calls[0][0], 'message:flag');
  assert.equal(messages[0].seen, true);
  permanent = true; calls.length = 0;
  await c.runMessageAction('trash', [messages[0]]);
  assert.equal(calls.length, 0, '取消永久删除不得调用服务端');
  c.confirm = () => true;
  await c.runMessageAction('trash', [messages[0]]);
  assert.equal(calls[0][5], true, '确认后显式允许永久删除');

  const events = [];
  const folders = [
    { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox', delimiter: '/' },
    { path: 'Trash', name: 'Trash', specialUse: '\\Trash', delimiter: '/' },
    { path: 'Projects', name: 'Projects', delimiter: '/' },
    { path: 'Projects/Child', name: 'Child', delimiter: '/' },
    { path: 'Other', name: 'Other', delimiter: '/' },
  ];
  const client = {
    list: async () => folders, mailbox: { exists: 3 },
    mailboxCreate: async (...args) => events.push(['create', ...args]),
    mailboxRename: async (...args) => events.push(['rename', ...args]),
    messageDelete: async (...args) => events.push(['delete', ...args]),
    messageMove: async (...args) => events.push(['move', ...args]),
    messageFlagsAdd: async (...args) => events.push(['flags', ...args]),
  };
  const backend = {
    getClient: async () => client, listFolders: async () => folders, knownFolders: async () => folders, folderCache: new Map(),
    findFolder: async (_acc, special) => folders.find((f) => special.includes(f.specialUse))?.path || null,
    withMailbox: async (_acc, _folder, fn) => fn(client),
    cache: { updateMessages: async () => {}, readList: async () => null },
  };
  vm.createContext(backend);
  vm.runInContext(mail.slice(mail.indexOf('async function moveTo('), mail.indexOf('// ---------- 发信 ----------')), backend);
  await assert.rejects(backend.editFolder({ id: 'a' }, 'rename', 'INBOX', 'Renamed'), /只能/);
  await assert.rejects(backend.editFolder({ id: 'a' }, 'move', 'Projects', 'Projects/Child'), /自身/);
  await assert.rejects(backend.editFolder({ id: 'a' }, 'rename', 'Projects', 'Other'), /同名/);
  assert.equal(await backend.editFolder({ id: 'a' }, 'rename', 'Projects/Child', 'Renamed'), 'Projects/Renamed');
  assert.equal(await backend.editFolder({ id: 'a' }, 'move', 'Projects/Child', 'Other'), 'Other/Child');
  await assert.rejects(backend.moveTo({ id: 'a' }, 'Trash', [1], 'trash'), /确认/);
  assert.ok(!events.some((e) => e[0] === 'delete'));
  await backend.moveTo({ id: 'a' }, 'INBOX', [1], 'trash');
  assert.ok(events.some((e) => e[0] === 'move' && e[2] === 'Trash'));
  const trashIndex = folders.findIndex((f) => f.path === 'Trash'); folders.splice(trashIndex, 1);
  await assert.rejects(backend.moveTo({ id: 'a' }, 'INBOX', [1], 'trash'), /未删除/);
  console.log('ok multi-selection, account grouping, permanent-delete confirmation, Trash fallback, system-folder protection, rename/move validation');
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
