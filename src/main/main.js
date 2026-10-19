const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, shell, powerMonitor, nativeImage, nativeTheme, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const cache = require('./cache');
const mail = require('./mail');
const { recordStartup } = require('./diagnostics');

app.setAppUserModelId('com.personal.mymail');
app.setName('Light Mail');
const smokeOutput = process.argv.find((arg) => arg.startsWith('--smoke-test='))?.slice(13);
// 打包前后保持相同数据目录；发布验证使用独立空目录，避免访问真实邮箱。
app.setPath('userData', smokeOutput ? path.join(path.dirname(path.resolve(smokeOutput)), 'smoke-profile') : path.join(app.getPath('appData'), 'my-mail'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let composeWin = null;
let composeRequest = null;
let draftChangedTimer;
let tray = null;
let quitting = false;
const watchers = new Map();
const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon.png'));

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const saved = store.getSettings().windowState || {};
  const validBounds = ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved[key]))
    && saved.width >= 900 && saved.height >= 560;
  const previous = validBounds ? Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, Math.round(saved[key])])) : null;
  const area = (previous ? screen.getDisplayMatching(previous) : screen.getPrimaryDisplay()).workArea;
  const width = Math.min(previous?.width || 1500, area.width);
  const height = Math.min(previous?.height || 940, area.height);
  const bounds = {
    width, height,
    x: Math.max(area.x, Math.min(previous?.x ?? area.x + Math.round((area.width - width) / 2), area.x + area.width - width)),
    y: Math.max(area.y, Math.min(previous?.y ?? area.y + Math.round((area.height - height) / 2), area.y + area.height - height)),
  };
  const titleBarColors = () => ({ color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#e8eaed' : '#1c1f24', height: 32 });
  win = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(900, area.width),
    minHeight: Math.min(560, area.height),
    title: 'Light Mail',
    show: !smokeOutput,
    icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202837' : '#eff4fc',
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (saved.maximized && !smokeOutput) win.maximize();
  let saveWindowTimer;
  const saveWindowState = () => {
    clearTimeout(saveWindowTimer);
    if (smokeOutput || win.isDestroyed() || win.isMinimized()) return;
    store.setSettings({ windowState: { ...win.getNormalBounds(), maximized: win.isMaximized() } });
  };
  // Save after native drag/resize completion, with a fallback for programmatic changes.
  for (const event of ['moved', 'resized', 'maximize', 'unmaximize']) win.on(event, saveWindowState);
  for (const event of ['move', 'resize']) win.on(event, () => {
    clearTimeout(saveWindowTimer);
    saveWindowTimer = setTimeout(saveWindowState, 150);
  });
  win.on('closed', () => clearTimeout(saveWindowTimer));
  win.setMenuBarVisibility(false);
  nativeTheme.on('updated', () => { if (win && !win.isDestroyed()) win.setTitleBarOverlay(titleBarColors()); });
  const loaded = win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 邮件正文里的链接一律交给系统浏览器，应用内不跳转
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('close', (e) => {
    saveWindowState();
    if (!quitting && store.getSettings().closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  return loaded;
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
}

function notifyDraftChanged() {
  clearTimeout(draftChangedTimer);
  draftChangedTimer = setTimeout(() => send('draft:changed', {}), 150);
}

function openComposeWindow(init = {}, resume = false) {
  if (composeWin && !composeWin.isDestroyed()) {
    if (composeWin.isMinimized()) composeWin.restore();
    composeWin.show();
    composeWin.focus();
    return true;
  }
  composeRequest = { init, resume };
  composeWin = new BrowserWindow({
    title: '写邮件', width: 820, height: 780, minWidth: 600, minHeight: 520,
    show: false, icon, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  composeWin.setMenuBarVisibility(false);
  composeWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  composeWin.webContents.on('will-navigate', (event) => event.preventDefault());
  composeWin.once('ready-to-show', () => composeWin?.show());
  composeWin.on('closed', () => { composeWin = null; composeRequest = null; notifyDraftChanged(); });
  composeWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: { compose: '1' } });
  return true;
}

function createTray() {
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.setToolTip('Light Mail');
  tray.on('click', showWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Light Mail', click: showWindow },
      {
        label: '写邮件',
        click: () => {
          showWindow();
          send('app:compose');
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

// ---------- 新邮件通知 ----------
function notifyNew(acc, items) {
  const clickOpen = (item) => () => {
    showWindow();
    send('mail:open', item ? { accId: item.accId, path: item.path, uid: item.uid } : { accId: acc.id, path: 'INBOX' });
  };
  if (items.length <= 3) {
    for (const m of items) {
      const from = m.from?.name || m.from?.address || '未知发件人';
      const n = new Notification({ title: from, body: m.subject, icon, silent: false });
      n.on('click', clickOpen(m));
      n.show();
    }
  } else {
    const n = new Notification({ title: `${acc.email}`, body: `收到 ${items.length} 封新邮件`, icon });
    n.on('click', clickOpen(null));
    n.show();
  }
  if (win && !win.isFocused()) win.flashFrame(true);
}

// ---------- 监听 ----------
function startWatching(acc) {
  watchers.get(acc.id)?.stop();
  const lastUid = store.getState().lastUid?.[acc.id] ?? null;
  watchers.set(
    acc.id,
    mail.startWatcher(
      acc,
      {
        status: (id, status, message) => send('acct:status', { accId: id, status, message }),
        changed: (id) => send('mail:changed', { accId: id }),
        saveUid: (id, uid) => store.setLastUid(id, uid),
        newMail: notifyNew,
        prefetchError: (error) => recordStartup('new-mail-prefetch', error),
      },
      lastUid
    )
  );
}

function stopWatching(id) {
  watchers.get(id)?.stop();
  watchers.delete(id);
}

let watcherStartupTimer;
function startSavedWatchers() {
  let retry = false;
  try {
    for (const account of store.listAccounts()) {
      if (watchers.has(account.id)) continue;
      try { startWatching(store.getAccount(account.id)); }
      catch (error) {
        retry = true;
        recordStartup('watcher-account', error);
        send('acct:status', { accId: account.id, status: 'auth', message: '本地凭据读取失败，正在重试' });
      }
    }
  } catch (error) {
    retry = true;
    recordStartup('watcher-startup', error);
  }
  if (retry && !quitting) watcherStartupTimer = setTimeout(startSavedWatchers, 5000);
}

// ---------- IPC ----------
const accOf = (id) => {
  return store.getAccount(id);
};

const api = {
  'compose:open': (init, resume) => openComposeWindow(init, resume),
  'compose:init': () => composeRequest || { init: {}, resume: true },
  'menu:show': (items) => new Promise((resolve) => {
    const menu = Menu.buildFromTemplate(items.map((item) => item.type === 'separator' ? { type: 'separator' }
      : { label: String(item.label), enabled: item.enabled !== false, click: () => resolve(item.id) }));
    menu.popup({ window: BrowserWindow.getFocusedWindow() || win, callback: () => resolve(null) });
  }),
  'draft:get': () => store.getDraft(),
  'draft:discard': (id) => { const removed = store.clearDraft(id); notifyDraftChanged(); return removed; },
  'accounts:list': () => {
    const accounts = store.listAccounts();
    recordStartup('accounts-loaded', null, accounts.length);
    return accounts;
  },
  'startup:diagnostic': (stage) => {
    if (['accounts', 'settings', 'draft'].includes(stage)) recordStartup('renderer-' + stage, { code: 'LOAD_FAILED' });
    return true;
  },
  'accounts:alias': (id, alias) => store.setAccountAlias(id, alias),
  'accounts:add': async (draft) => {
    const result = await mail.testAccount(draft); // IMAP 登录失败会直接抛错
    const id = store.saveAccount(draft);
    startWatching({ ...draft, id });
    return { id, ...result };
  },
  'accounts:remove': (id) => {
    stopWatching(id);
    mail.dropClient(id);
    store.removeAccount(id);
    return true;
  },
  'folders:list': (accId) => mail.listFolders(accOf(accId)),
  'folder:read': (accId, folder) => mail.markFolderRead(accOf(accId), folder),
  'folder:edit': (accId, operation, folder, value) => mail.editFolder(accOf(accId), operation, folder, value),
  'messages:list': (accId, folder, opts) => mail.listMessages(accOf(accId), folder, opts),
  'messages:cached': (accId, folder, opts) => { accOf(accId); return cache.readList(accId, folder, opts); },
  'message:get': (accId, folder, uid) => mail.getMessage(accOf(accId), folder, uid),
  'message:cached': (accId, folder, uid) => { accOf(accId); return cache.readBody(accId, folder, uid); },
  'message:flag': (accId, folder, uids, flag, add) => mail.setFlag(accOf(accId), folder, uids, flag, add),
  'message:move': (accId, folder, uids, kind, allowPermanent) => mail.moveTo(accOf(accId), folder, uids, kind, allowPermanent),
  'messages:move-to': (accId, folder, uids, destination) => mail.moveMessages(accOf(accId), folder, uids, destination),
  'message:send': async (accId, payload, draftId) => {
    await mail.sendMessage(accOf(accId), payload);
    try {
      store.clearDraft(draftId);
      notifyDraftChanged();
      return { draftCleared: true };
    } catch {
      return { draftCleared: false };
    }
  },
  'attachment:save': async (accId, folder, uid, attId) => {
    const att = await mail.getAttachment(accOf(accId), folder, uid, attId);
    const r = await dialog.showSaveDialog(win, { defaultPath: att.filename });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, att.content);
    return true;
  },
  'files:pick': async () => {
    const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || composeWin || win, { properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths.map((p) => ({ path: p, name: path.basename(p), size: fs.statSync(p).size }));
  },
  'external:open': (url) => openExternal(url),
  'app:unread': (n) => {
    tray?.setToolTip(n > 0 ? `Light Mail · ${n} 封未读` : 'Light Mail');
    if (win && !win.isDestroyed()) win.setTitle('Light Mail');
    return true;
  },
  'settings:get': (localOnly = false) => {
    const settings = store.getSettings();
    if (localOnly) return settings;
    try { return { ...settings, autoStart: app.getLoginItemSettings().openAtLogin }; }
    catch (error) { recordStartup('login-item-settings', error); return settings; }
  },
  'settings:set': (patch) => {
    if ('autoStart' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.autoStart });
    const { autoStart, ...rest } = patch;
    store.setSettings(rest);
    return true;
  },
};

ipcMain.on('draft:save', (event, draft) => {
  try {
    store.saveDraft(draft);
    notifyDraftChanged();
    event.returnValue = { ok: true };
  } catch (err) {
    event.returnValue = { ok: false, error: err.message };
  }
});

ipcMain.handle('api', async (_e, name, ...args) => {
  try {
    if (!api[name]) throw new Error('未知接口：' + name);
    return { ok: true, data: await api[name](...args) };
  } catch (err) {
    if (['accounts:list', 'settings:get', 'draft:get'].includes(name)) recordStartup(name, err);
    return { ok: false, error: err.responseText || err.message || String(err) };
  }
});

app.on('second-instance', showWindow);

app.whenReady().then(async () => {
  recordStartup('main-ready');
  await createWindow();
  if (smokeOutput) {
    const result = await win.webContents.executeJavaScript("(async () => ({ title: document.title, bridge: typeof window.api.call === 'function', accounts: (await window.api.call('accounts:list')).length, list: Boolean(document.getElementById('list')) }))()");
    if (!result.bridge || !result.list || result.accounts !== 0) throw new Error('Packaged startup validation failed');
    fs.writeFileSync(path.resolve(smokeOutput), JSON.stringify({ ...result, version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron }, null, 2));
    app.exit(0);
    return;
  }
  createTray();
  startSavedWatchers();

  powerMonitor.on('resume', () => {
    for (const id of watchers.keys()) mail.dropClient(id);
    for (const w of watchers.values()) w.reconnect();
    send('mail:changed', {});
  });
  setInterval(() => {
    for (const w of watchers.values()) w.reconnect();
  }, 60000);
}).catch((err) => {
  if (smokeOutput) fs.writeFileSync(path.resolve(smokeOutput), JSON.stringify({ error: err.message }));
  else console.error(err);
  app.exit(1);
});

app.on('before-quit', () => {
  quitting = true;
  clearTimeout(watcherStartupTimer);
  for (const w of watchers.values()) w.stop();
});

app.on('window-all-closed', () => {
  // 托盘常驻，不随窗口退出
});
