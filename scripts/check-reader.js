// 在独立隐藏的 Chromium 窗口中验证正文尺寸与缓存重绘，不读取真实邮件。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const reader = source.slice(source.indexOf('let disposeReaderFrame ='), source.indexOf('// ---------- 对邮件的操作'));
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const sampleFile = process.argv.find((arg) => arg.startsWith('--sample='))?.slice(9);
const sampleHtml = sampleFile ? JSON.parse(fs.readFileSync(sampleFile, 'utf8')).message.html : null;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  try {
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>${css}</style><div id="read-pane"></div>`));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const $ = (id) => document.getElementById(id);
      const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const ic = () => '<svg></svg>';
      const avatar = () => '<div class="avatar">A</div>';
      const personName = (p) => p?.name || p?.address || '';
      const accById = () => ({ email: 'me@example.com' });
      const keyOf = (m) => m.accId + '|' + m.path + '|' + m.uid;
      const fmtDate = () => 'today';
      const fmtSize = String;
      const call = () => {};
      const renderNavButtons = () => {};
      const message = { accId: 'test', uid: 1, path: 'INBOX', subject: 'Reader test',
        to: [{ address: 'me@example.com' }], cc: [], from: { address: 'test@example.com' }, attachments: [],
        flagged: false, html: '<div style="height:1600px">Long synthetic body</div>' };
      const S = { curKey: 'test|INBOX|1', cur: message, messages: [message] };
      ${reader}
      const assert = (condition, text) => { if (!condition) throw new Error(text); };
      const until = async (fn) => {
        const deadline = Date.now() + 4000;
        while (!fn()) {
          if (Date.now() > deadline) throw new Error('Reader readiness timeout');
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      };
      renderReader();
      const frame = $('body-frame');
      assert(frame.style.visibility === 'hidden', 'Initial short frame must not display');
      await until(() => frame.style.visibility === 'visible');
      const initialHeight = frame.getBoundingClientRect().height;
      assert(initialHeight >= 1636, 'Long body should be expanded before display');
      assert(frame.getAttribute('scrolling') === 'no', 'Iframe must not show a nested scrollbar');
      S.cur = { ...message, flagged: true };
      renderReader();
      assert($('body-frame') === frame, 'Identical background response must reuse the iframe');
      assert(frame.style.visibility === 'visible', 'Background update must not hide the body');
      const extra = frame.contentDocument.createElement('div');
      extra.style.height = '240px';
      frame.contentDocument.getElementById('mail-content').append(extra);
      await until(() => frame.getBoundingClientRect().height >= initialHeight + 240);
      S.curKey = 'test|INBOX|2';
      S.cur = { ...message, uid: 2, html: '<p>Short body</p>' };
      renderReader();
      const next = $('body-frame');
      assert(next !== frame, 'Different message needs its own document');
      await until(() => next.style.visibility === 'visible');
      assert(next.getBoundingClientRect().height < initialHeight, 'Short message should shrink normally');
      const shortHeight = next.getBoundingClientRect().height;
      $('read-pane').style.width = '600px';
      S.curKey = 'test|INBOX|3';
      S.cur = { ...message, uid: 3, html: '<table style="min-width:720px;width:720px"><tr><td style="width:360px">Left</td><td style="width:360px;text-align:right"><span id="right-edge">Right edge</span></td></tr></table>' };
      renderReader();
      const wide = $('body-frame');
      await until(() => wide.style.visibility === 'visible');
      const content = wide.contentDocument.getElementById('mail-content');
      assert(Number(content.style.zoom) < 1, 'Fixed-width body should scale down');
      const right = () => wide.contentDocument.getElementById('right-edge').getBoundingClientRect().right;
      assert(right() <= wide.clientWidth + 1, 'Right edge must remain visible');
      const oldScale = Number(content.style.zoom);
      $('read-pane').style.width = '500px';
      await until(() => Number(content.style.zoom) < oldScale);
      assert(right() <= wide.clientWidth + 1, 'Resizing must keep the right edge visible');
      const actualMail = ${JSON.stringify(sampleHtml)};
      if (actualMail) {
        S.curKey = 'test|INBOX|4';
        S.cur = { ...message, uid: 4, html: actualMail };
        renderReader();
        const real = $('body-frame');
        await until(() => real.style.visibility === 'visible');
        const body = real.contentDocument.getElementById('mail-content');
        assert(body.scrollWidth * Number(body.style.zoom) <= real.clientWidth + 1, 'Actual cached mail must fit horizontally');
      }
      return { initialHeight, nextHeight: shortHeight, frameReused: true, resizeObserved: true, fixedWidthFits: true, actualMailChecked: Boolean(actualMail) };
    })()`);
    console.log(JSON.stringify(result));
    app.exit(0);
  } catch (err) {
    console.error(err.message);
    app.exit(1);
  }
});
