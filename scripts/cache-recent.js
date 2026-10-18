// 使用本机已保存的账号，按起始日期统计/预取收件箱正文，不改变邮件已读状态。
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { ImapFlow } = require('imapflow');
app.setPath('userData', path.join(app.getPath('appData'), 'my-mail'));
const store = require('../src/main/store');
const cache = require('../src/main/cache');
const mail = require('../src/main/mail');
const run = process.argv.includes('--run');
const reportPath = path.join(__dirname, '../tmp', run ? 'cache-recent-result.json' : 'cache-recent-count.json');
const sinceText = process.argv.find((arg) => arg.startsWith('--since='))?.slice(8) || '2026-10-04';
if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceText)) throw new Error('Invalid start date');
const [year, month, day] = sinceText.split('-').map(Number);
const since = new Date(year, month - 1, day);
const report = { since: sinceText, scope: 'INBOX', started: new Date().toISOString(), mode: run ? 'download' : 'count', accounts: [] };
function save() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
app.whenReady().then(async () => {
  try {
    for (const acc of store.getAccounts()) {
      const row = { email: acc.email, count: 0, cached: 0, downloaded: 0, failures: 0, status: 'connecting' };
      report.accounts.push(row); save();
      const client = new ImapFlow({ host: acc.imap.host, port: acc.imap.port, secure: acc.imap.secure,
        auth: { user: acc.user, pass: acc.pass }, logger: false, socketTimeout: 60000,
        clientInfo: { name: 'Light Mail', version: '0.1.2', vendor: 'personal' } });
      client.on('error', () => {});
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const uids = await client.search({ since }, { uid: true }) || [];
          row.count = uids.length;
          const needed = [];
          for (const uid of uids) {
            const cached = await cache.readBody(acc.id, 'INBOX', uid);
            if (cached) row.cached++; else needed.push(uid);
          }
          row.status = run ? 'downloading' : 'counted'; save();
          if (run && needed.length) {
            for await (const m of client.fetch(needed, { uid: true, source: true, flags: true }, { uid: true })) {
              try {
                await mail.cacheFetchedMessage(acc, 'INBOX', m.uid, m.source, m.flags, String(client.mailbox.uidValidity));
                if (!await cache.readBody(acc.id, 'INBOX', m.uid)) throw new Error('Cache verification failed');
                row.downloaded++;
              } catch { row.failures++; }
              save();
            }
          }
          row.status = row.cached + row.downloaded === row.count && !row.failures ? 'complete' : run ? 'incomplete' : 'counted';
        } finally { lock.release(); }
        await client.logout();
      } catch (err) {
        row.status = 'failed'; row.error = err.code || 'connection-or-download-error';
      } finally { client.close(); save(); }
      console.log(JSON.stringify(row));
    }
    report.finished = new Date().toISOString();
    report.status = report.accounts.every((r) => r.status === (run ? 'complete' : 'counted') || r.status === 'complete') ? 'complete' : 'incomplete';
    save(); app.exit(report.status === 'complete' ? 0 : 1);
  } catch {
    report.status = 'failed'; save(); app.exit(1);
  }
});
