// 独立隐藏窗口验证：不读取真实账号、不联网、不发送邮件。
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
const factory = source.slice(source.indexOf('function openComposeWindow('), source.indexOf('function createTray('));
const tmp = path.join(root, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(tmp, 'compose-window-check-')));
app.whenReady().then(async () => {
  let draft = null;
  let saved = 0;
  const create = new Function('BrowserWindow', 'path', 'icon', 'notifyDraftChanged', '__dirname', `let composeWin = null; let composeRequest = null; ${factory}; return { open: openComposeWindow, current: () => composeWin, request: () => composeRequest };`);
  function HiddenWindow(options) {
    const result = new BrowserWindow({ ...options, show: false, skipTaskbar: true });
    result.show = () => {};
    result.focus = () => {};
    return result;
  }
  const controller = create(HiddenWindow, path, nativeImage.createFromPath(path.join(root, 'assets/icon.png')), () => {}, path.join(root, 'src/main'));
  ipcMain.on('draft:save', (event, value) => { draft = value; saved++; event.returnValue = { ok: true }; });
  ipcMain.handle('api', async (_event, name, ...args) => {
    let data;
    switch (name) {
      case 'accounts:list': data = [{ id: 'test', email: 'test@example.com', name: 'Test' }]; break;
      case 'settings:get': data = {}; break;
      case 'draft:get': data = draft; break;
      case 'compose:init': data = controller.request(); break;
      case 'draft:discard': draft = null; data = true; break;
      case 'message:send': draft = null; data = { draftCleared: true }; break;
      default: throw new Error('Unexpected network or API call: ' + name);
    }
    return { ok: true, data };
  });
  const ready = async () => {
    const win = controller.current();
    const deadline = Date.now() + 6000;
    while (!await win.webContents.executeJavaScript("Boolean(document.getElementById('c-body'))").catch(() => false)) {
      if (Date.now() > deadline) throw new Error('Compose readiness timeout');
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return win;
  };
  const main = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await main.loadURL('data:text/html,<input id="main-input" value="Main is usable">');
    controller.open({ accId: 'test', to: 'recipient@example.com', subject: 'Independent draft' }, true);
    let compose = await ready();
    assert.equal(compose.isModal(), false);
    assert.equal(compose.getParentWindow(), null);
    assert.equal(main.isEnabled(), true);
    assert.equal(await compose.webContents.executeJavaScript("getComputedStyle(document.getElementById('app')).display"), 'none');
    await compose.webContents.executeJavaScript("const input = document.getElementById('c-body'); input.value = 'Saved from independent window'; input.dispatchEvent(new Event('input', { bubbles: true }));");
    assert.equal(draft.body, 'Saved from independent window');
    assert.ok(saved);
    controller.open({ accId: 'test' }, true);
    assert.equal(controller.current(), compose, 'Existing composer must be reused');
    const closed = new Promise((resolve) => compose.once('closed', resolve));
    compose.close(); await closed;
    assert.ok(draft);
    controller.open({}, true);
    compose = await ready();
    assert.equal(await compose.webContents.executeJavaScript("document.getElementById('c-body').value"), 'Saved from independent window');
    const sent = new Promise((resolve) => compose.once('closed', resolve));
    await compose.webContents.executeJavaScript("document.querySelector('[data-c=send]').click()");
    await sent;
    assert.equal(draft, null);
    console.log(JSON.stringify({ independentWindow: true, mainUsable: true, draftSaved: true, nativeCloseRetainsDraft: true, restored: true, sendClearsDraft: true }));
    main.destroy(); app.exit(0);
  } catch (err) {
    console.error(err.message);
    controller.current()?.destroy(); main.destroy(); app.exit(1);
  }
});
