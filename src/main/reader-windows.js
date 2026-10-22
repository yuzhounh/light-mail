const path = require('path');

// Each reader owns one immutable message identity, independent of the main list.
function createReaderWindows({ BrowserWindow, icon, setupZoom, openExternal }) {
  const readers = new Map();
  function open(item) {
    if (!item || typeof item.accId !== 'string' || typeof item.path !== 'string'
        || !item.path || !Number.isSafeInteger(item.uid) || item.uid < 1) throw new Error('无效的邮件');
    const key = JSON.stringify([item.accId, item.path, item.uid]);
    const existing = readers.get(key);
    if (existing && !existing.window.isDestroyed()) {
      if (existing.window.isMinimized()) existing.window.restore();
      existing.window.show();
      existing.window.focus();
      return true;
    }
    const target = { accId: item.accId, path: item.path, uid: item.uid,
      subject: String(item.subject || '邮件'), seen: !!item.seen, flagged: !!item.flagged,
      specialUse: typeof item.specialUse === 'string' ? item.specialUse : null };
    const reader = new BrowserWindow({
      title: target.subject + ' — Light Mail', width: 900, height: 800, minWidth: 600, minHeight: 480,
      show: false, icon, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    readers.set(key, { window: reader, target });
    reader.setMenuBarVisibility(false);
    reader.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
    reader.webContents.on('will-navigate', (event) => event.preventDefault());
    setupZoom(reader.webContents);
    reader.once('ready-to-show', () => { if (!reader.isDestroyed()) reader.show(); });
    reader.on('closed', () => { if (readers.get(key)?.window === reader) readers.delete(key); });
    reader.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: { reader: '1' } }).catch(() => {
      if (!reader.isDestroyed()) reader.close();
    });
    return true;
  }
  function init(sender) {
    const entry = [...readers.values()].find((r) => r.window.webContents === sender);
    if (!entry) throw new Error('阅读窗口已关闭');
    return entry.target;
  }
  function notify(payload) {
    for (const { window, target } of readers.values()) {
      if (!window.isDestroyed() && target.accId === payload.accId && target.path === payload.path
          && payload.uids.includes(target.uid)) window.webContents.send('message:updated', payload);
    }
  }
  return { open, init, notify };
}

module.exports = { createReaderWindows };
