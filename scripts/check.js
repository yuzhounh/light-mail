// 快速自检：语法检查 + 加载邮件模块。运行：npm run check
const { execFileSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['src/main/main.js', 'src/main/reader-windows.js', 'src/main/mail.js', 'src/main/oauth.js', 'src/main/cache.js', 'src/main/store.js', 'src/main/preload.js', 'src/renderer/mail-actions.js', 'src/renderer/app.js']) {
  execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'inherit' });
  console.log('ok  ', f);
}
const mail = require('../src/main/mail.js');
console.log('mail exports:', Object.keys(mail).join(', '));
