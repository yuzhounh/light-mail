// Native Electron checks using only in-memory mail and an isolated profile.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createReaderWindows } = require('../src/main/reader-windows');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(root, 'tmp', 'reader-check-'));
app.setPath('userData', path.join(scratch, 'profile'));
app.disableHardwareAcceleration();
const calls = [];
const errors = [];
const mail = [1, 2, 3].map((uid) => ({ accId: 'fixture', accEmail: 'fixture@example.test', path: 'INBOX', uid,
  subject: 'Fixture ' + uid, seen: uid === 1, flagged: false, preview: 'Preview', date: '2026-10-23T00:00:00Z',
  from: { name: 'Sender', address: 'sender@example.test' }, to: [{ address: 'fixture@example.test' }], cc: [],
  html: '<p>Fixture body</p>'.repeat(100), text: 'Fixture body', attachments: [], references: [], messageId: 'fixture-' + uid }));
const folders = [{ path: 'INBOX', label: '收件箱', specialUse: '\\Inbox', unseen: 2, depth: 0 },
  { path: 'Trash', label: '废纸篓', specialUse: '\\Trash', unseen: 0, depth: 0 }];
function hiddenWindow(options) {
  const w = new BrowserWindow({ ...options, show: false });
  w.show = () => {};
  w.focus = () => {};
  w.webContents.setBackgroundThrottling(false);
  w.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  return w;
}
const readers = createReaderWindows({ BrowserWindow: hiddenWindow, icon: undefined, setupZoom() {}, openExternal() {} });
let main;
let menuChoice = null;
let failNextMove = false;
const clone = (value) => JSON.parse(JSON.stringify(value));
function update(payload) { main.webContents.send('message:updated', payload); readers.notify(payload); }
ipcMain.handle('api', async (event, name, ...args) => {
  calls.push({ sender: event.sender.id, name, args });
  try {
    let data;
    switch (name) {
      case 'accounts:list': data = [{ id: 'fixture', email: 'fixture@example.test' }]; break;
      case 'settings:get': data = {}; break;
      case 'draft:get': data = null; break;
      case 'folders:list': data = folders.map((folder) => ({ ...folder,
        unseen: mail.filter((m) => !m.removed && m.path === folder.path && !m.seen).length })); break;
      case 'messages:list': case 'messages:cached': data = { messages: mail.filter((m) => !m.removed), total: mail.length }; break;
      case 'message:cached': case 'message:get': data = mail.find((m) => m.uid === args[2]); break;
      case 'message:flag': {
        const patch = args[3] === '\\Seen' ? { seen: args[4] } : { flagged: args[4] };
        mail.filter((m) => args[2].includes(m.uid)).forEach((m) => Object.assign(m, patch));
        update({ accId: args[0], path: args[1], uids: args[2], ...patch }); data = true; break;
      }
      case 'message:move': case 'messages:move-to':
        if (failNextMove) { failNextMove = false; return { ok: false, error: 'Fixture move failure' }; }
        mail.filter((m) => args[2].includes(m.uid)).forEach((m) => { m.removed = true; });
        update({ accId: args[0], path: args[1], uids: args[2], removed: true }); data = true; break;
      case 'reader:open': data = readers.open(args[0]); break;
      case 'reader:init': data = readers.init(event.sender); break;
      case 'menu:show': data = menuChoice; break;
      case 'app:unread': assert.equal(event.sender, main.webContents, 'reader must not publish global unread count'); data = true; break;
      case 'compose:open': data = true; break;
      default: data = true;
    }
    return { ok: true, data: clone(data ?? null) };
  } catch (error) { errors.push(error.message); return { ok: false, error: error.message }; }
});
const evaluate = (w, expression) => w.webContents.executeJavaScript(expression);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  const end = Date.now() + 8000;
  while (!(await check())) { if (Date.now() > end) throw new Error('Timed out: ' + label); await sleep(30); }
}
const row = (uid, suffix = '') => `.row[data-key="fixture|INBOX|${uid}"]${suffix}`;
async function click(w, selector, { count = 1, modifiers = [] } = {}) {
  const p = await evaluate(w, `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  w.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: count, modifiers });
  w.webContents.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: count, modifiers });
  await sleep(30);
}
async function key(w, keyCode) {
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  w.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await sleep(30);
}
const state = (w) => evaluate(w, `({current:S.curKey,selected:[...S.selectedKeys],body:S.cur?.uid,barHidden:document.getElementById('selection-bar').hidden})`);
const readerFor = (uid) => BrowserWindow.getAllWindows().find((w) => w !== main && !w.isDestroyed() && (() => { try { return readers.init(w.webContents).uid === uid; } catch { return false; } })());
const timeout = setTimeout(() => { console.error('Reader checks timed out'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  main = hiddenWindow({ width: 1500, height: 900, webPreferences: { preload: path.join(root, 'src/main/preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await main.loadFile(path.join(root, 'src/renderer/index.html'));
  await until(() => evaluate(main, `S.accountsState==='ready' && S.messages.length===3 && !S.loading`), 'main list');
  await click(main, row(1, ' .subj'));
  await until(async () => (await state(main)).body === 1, 'preview 1');
  await evaluate(main, `window.originalFrame=document.getElementById('body-frame');window.originalRow=document.querySelector(${JSON.stringify(row(1))});document.querySelector('.read-scroll').scrollTop=100;`);
  const loads = calls.filter((c) => c.name === 'message:cached').length;
  await click(main, row(1, ' .subj'));
  assert.equal(calls.filter((c) => c.name === 'message:cached').length, loads, 'repeat click must not reload');
  assert.equal(await evaluate(main, `originalFrame===document.getElementById('body-frame') && originalRow===document.querySelector(${JSON.stringify(row(1))})`), true);
  await click(main, row(1, ' .subj'), { count: 2 });
  await until(() => !!readerFor(1), 'native double click opens reader');
  const first = readerFor(1);
  await until(async () => (await state(first)).body === 1, 'reader body');
  await click(main, '#read-pane [data-act="popout"]');
  assert.equal(readerFor(1), first, 'same message reuses reader');
  await click(main, row(2, ' .subj'));
  await until(async () => (await state(main)).body === 2, 'main switches to 2');
  assert.equal((await state(first)).body, 1, 'reader remains pinned to message 1');
  const writes = calls.filter((c) => c.name === 'message:flag').length;
  await click(main, row(3, ' .row-check'));
  assert.deepEqual((await state(main)).selected, ['fixture|INBOX|3']);
  assert.equal((await state(main)).body, 2);
  assert.equal((await state(main)).barHidden, false);
  assert.equal(calls.filter((c) => c.name === 'message:flag').length, writes, 'checkbox does not mark read');
  await click(main, row(3, ' .row-check'));
  assert.deepEqual((await state(main)).selected, []);
  await click(main, row(3, ' .subj'), { modifiers: ['control'] });
  assert.deepEqual((await state(main)).selected.sort(), ['fixture|INBOX|2', 'fixture|INBOX|3']);
  await click(main, row(1, ' .subj'));
  await click(main, row(3, ' .subj'), { modifiers: ['shift'] });
  assert.equal((await state(main)).selected.length, 3);
  await key(main, 'Escape');
  assert.equal((await state(main)).current, null);
  assert.deepEqual((await state(main)).selected, []);
  await click(main, row(1, ' .subj'));
  await click(main, row(3, ' .row-check'));
  await key(main, 'S');
  await until(() => mail[2].flagged, 'single checked message shortcut target');
  assert.equal(mail[0].flagged, false);
  menuChoice = 'open-window';
  await evaluate(main, `showMessageMenu({preventDefault(){},target:document.querySelector(${JSON.stringify(row(2))})})`);
  await until(() => !!readerFor(2), 'context menu opens second reader');
  const second = readerFor(2);
  await until(async () => (await state(second)).body === 2, 'second reader ready');
  await click(first, '[data-act="star"]');
  await until(() => mail[0].flagged, 'reader star correct target');
  assert.equal(await evaluate(main, `S.messages.find(m=>m.uid===1).flagged`), true);
  await click(second, '[data-act="reply"]');
  await until(() => calls.some((c) => c.name === 'compose:open'), 'reply request');
  const compose = calls.filter((c) => c.name === 'compose:open').at(-1);
  assert.equal(compose.args[0].accId, 'fixture');
  assert.match(compose.args[0].subject, /Fixture 2/);
  assert.equal(calls.filter((c) => c.sender === first.webContents.id && ['messages:list', 'folders:list', 'draft:get', 'app:unread'].includes(c.name)).length, 0);
  await click(second, '[data-act="unread"]');
  assert.equal((await state(second)).body, 2, 'mark unread keeps reader content');
  second.close();
  await evaluate(main, `openReaderWindow(S.messages.find(m=>m.uid===2))`);
  await until(() => !!readerFor(2) && readerFor(2) !== second, 'closed reader can reopen');
  await evaluate(main, `S.selectedKeys.clear();S.unreadOnly=true;renderList()`);
  await click(main, row(3, ' .subj'));
  await until(async () => (await state(main)).body === 3, 'unread preview');
  assert.equal(await evaluate(main, `!!document.querySelector(${JSON.stringify(row(3))})`), true, 'just-read row remains available');
  await click(main, row(3, ' .row-check'));
  assert.equal(await evaluate(main, `selectedMessages().length`), 1, 'visible checked row remains actionable');
  failNextMove = true;
  await key(main, 'Delete');
  await until(() => !failNextMove, 'move failure');
  assert.equal((await state(main)).body, 3, 'failed move preserves preview');
  assert.equal(mail[2].removed, undefined);
  await evaluate(main, `S.curKey=null;S.cur=null;S.messages.find(m=>m.uid===3).seen=true;S.selectedKeys=new Set(['fixture|INBOX|3']);renderList();window.checkedRow=document.querySelector(${JSON.stringify(row(3))})`);
  await click(main, row(3, ' .subj'));
  assert.equal(await evaluate(main, `checkedRow===document.querySelector(${JSON.stringify(row(3))})`), true, 'clicking a retained checked row keeps its node');
  await click(main, row(3, ' .subj'), { count: 2 });
  await until(() => !!readerFor(3), 'double click on retained checked row');
  const trash = { ...mail[1], uid: 4, path: 'Trash', subject: 'Trash fixture', seen: true };
  mail.push(trash);
  readers.open(trash);
  await until(() => !!readerFor(4), 'trash reader');
  const trashReader = readerFor(4);
  await until(async () => (await state(trashReader)).body === 4, 'trash reader body');
  await evaluate(trashReader, `window.confirm=()=>true;true`);
  await click(trashReader, '[data-act="trash"]');
  await until(() => !readerFor(4), 'successful deletion closes matching reader');
  assert.equal(calls.filter((c) => c.name === 'message:move' && c.args[2].includes(4)).at(-1).args[4], true, 'trash deletion has explicit confirmation');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(scratch, 'result.json'), JSON.stringify({ passed: true, checks: ['native double click', 'repeat click preserves renderer nodes', 'checkbox/Ctrl/Shift/Esc', 'single checked shortcut target', 'reader reuse and isolation', 'cross-window star', 'reply identity', 'reader close/reopen'], profile: scratch }, null, 2));
  console.log('PASS: reader interactions, native windows and selection targets');
  clearTimeout(timeout);
  app.exit(0);
}).catch((error) => { fs.writeFileSync(path.join(scratch, 'result.json'), JSON.stringify({ passed: false, error: error.stack, errors }, null, 2)); console.error(error.stack); clearTimeout(timeout); app.exit(1); });
