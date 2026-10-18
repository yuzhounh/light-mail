// 独立隐藏窗口中的分栏调宽与恢复验证，不加载账户或真实邮件。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const resize = source.slice(source.indexOf('function initPaneResizing()'), source.lastIndexOf('\ninitPaneResizing();'));
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>${css}</style>`).replace('<script src="app.js"></script>', '');
const tmp = path.join(root, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
const directory = fs.mkdtempSync(path.join(tmp, 'layout-check-'));
const page = path.join(directory, 'index.html');
fs.writeFileSync(page, html);
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1320, height: 840, show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#f4f6f8', symbolColor: '#1c1f24', height: 32 },
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  const init = async () => {
    await win.loadFile(page);
    await win.webContents.executeJavaScript(`(() => { const $ = (id) => document.getElementById(id); ${resize}; initPaneResizing(); })()`);
  };
  const geometry = () => win.webContents.executeJavaScript(`(() => {
    const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { sidebar: box('sidebar'), list: box('list-pane'), reader: box('read-pane'), handle: box('sidebar-divider'), listHandle: box('list-divider'),
      titleColor: getComputedStyle(document.getElementById('titlebar')).backgroundColor,
      sideColor: getComputedStyle(document.getElementById('sidebar')).backgroundColor,
      corner: getComputedStyle(document.getElementById('list-pane')).borderTopLeftRadius,
      saved: localStorage.getItem('paneWidths') };
  })()`);
  // 隐藏窗口不接收原生鼠标拖动；使用分界线的键盘入口检查同一宽度约束和持久化逻辑。
  const widen = (id, steps) => win.webContents.executeJavaScript(`(() => {
    const handle = document.getElementById(${JSON.stringify(id)});
    for (let i = 0; i < ${steps}; i++) handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  })()`);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
  try {
    await init();
    const initial = await geometry();
    assert.equal(initial.titleColor, initial.sideColor);
    assert.equal(initial.corner, '16px');
    await widen('sidebar-divider', 5);
    await settle();
    let moved = await geometry();
    assert.ok(moved.sidebar.width >= initial.sidebar.width + 40, 'Sidebar width did not change');
    await widen('list-divider', 3);
    await settle();
    moved = await geometry();
    assert.ok(moved.list.width >= initial.list.width + 25, 'List width did not change');
    assert.ok(moved.saved);
    await init();
    const restored = await geometry();
    assert.equal(restored.sidebar.width, moved.sidebar.width);
    assert.equal(restored.list.width, moved.list.width);
    win.setSize(900, 700);
    await settle();
    const small = await geometry();
    assert.ok(small.sidebar.width >= 200 && small.list.width >= 280 && small.reader.width >= 319);
    console.log(JSON.stringify({ sidebarWidth: true, listWidth: true, widthsRestored: true, minimumWidths: true, matchingTitlebar: true, roundedCorner: true, nativeDragTested: false }));
    win.destroy(); app.exit(0);
  } catch (err) { console.error(err.message); win.destroy(); app.exit(1); }
});
