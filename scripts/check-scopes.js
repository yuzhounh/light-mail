// Synthetic multi-account/folder integration checks. No user data or network.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 12; i++) await tick(); }

async function main() {
  const accounts = [{ id: 'a', email: 'example@163.com' }, { id: 'b', email: 'example@gmail.com' }];
  const roles = ['Inbox', 'Drafts', 'Sent', 'Junk', 'Trash'];
  const labels = ['收件箱', '草稿', '已发送', '垃圾邮件', '废纸篓'];
  const folders = Object.fromEntries(accounts.map((a) => [a.id, roles.map((role, i) => ({
    path: i === 0 ? 'INBOX' : a.id === 'a' ? labels[i] : `[Gmail]/${role}`,
    specialUse: '\\' + role, label: labels[i], unseen: i + 1,
  })).concat([{ path: 'Custom', label: 'Custom', unseen: 0 }, ...(a.id === 'b'
    ? [{ path: '[Gmail]/All Mail', specialUse: '\\All', label: '所有邮件', unseen: 0 }] : [])])]));
  const item = (id, folder, uid, extra = {}) => ({ accId: id, accEmail: accounts.find((a) => a.id === id).email,
    path: folder, uid, emailId: `${folder}-${uid}`, subject: 'Update example', seen: true,
    from: { name: 'Example', address: 'sender@example.com' }, to: [{ address: 'recipient@example.com' }],
    date: '2026-10-27T00:00:00Z', preview: 'Fixture', ...extra });
  const requests = [];
  let failPath = null;
  const dom = new JSDOM(source('src/renderer/index.html'), { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const draft = { id: 'local', accId: 'a', to: '', subject: 'Local draft', body: '', attachments: [] };
  w.api = { on() {}, saveDraft() {}, async call(name, id, folder, options) {
    if (name === 'accounts:list') return accounts;
    if (name === 'folders:list') return folders[id];
    if (name === 'settings:get') return {};
    if (name === 'draft:get') return null;
    if (name === 'messages:cached') return null;
    if (name === 'messages:list') {
      requests.push({ id, folder, search: options.search, limit: options.limit });
      if (folder === failPath) throw Error('Fixture folder unavailable');
      const duplicate = id === 'b' && folder === '[Gmail]/All Mail';
      return { messages: [item(id, folder, 1, duplicate ? { emailId: 'INBOX-1' } : {})], total: 1 };
    }
    return true;
  } };
  try {
    w.eval(source('src/renderer/mail-actions.js') + '\n' + source('src/renderer/app.js')
      + '\nwindow.harness={S,scopeTargets,mergeScopeMessages,loadList,renderList,renderNav,renderHead,select};');
    await settle();
    const h = w.harness;
    const query = (selector) => w.document.querySelector(selector);
    assert.equal(query('#nav .nav-scope').textContent.trim(), '全部邮箱');
    assert.equal(w.document.querySelectorAll('#nav > .nav-item[data-acc=""]').length, 5);
    for (let i = 0; i < roles.length; i++) {
      const virtualPath = i === 0 ? 'INBOX' : '@role:' + roles[i].toLowerCase();
      requests.length = 0;
      query(`#nav .nav-item[data-acc=""][data-path="${virtualPath}"]`).click();
      await settle();
      assert.deepEqual(requests.map((r) => r.folder).sort(), accounts.map((a) => folders[a.id][i].path).sort(),
        'Unified category must resolve each provider-specific folder by special-use role');
      assert.equal(h.S.messages.length, 2);
    }
    requests.length = 0;
    query('#nav .nav-account[data-account="a"]').click();
    await settle();
    assert.equal(h.S.sel.path, '@all');
    assert.equal(h.S.messages.length, 6, 'Same-account folders must not overwrite each other');
    assert(requests.every((r) => r.id === 'a'));
    assert.equal(query('#search-input').placeholder, '搜索当前邮箱');
    query('#search-input').value = 'update';
    query('#search-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    assert(requests.slice(-6).every((r) => r.id === 'a' && r.search === 'update'));
    query('#nav .nav-scope[data-acc=""]').click();
    await settle();
    assert.equal(query('#search-input').placeholder, '搜索全部邮箱');
    assert.equal(h.S.messages.length, 12, 'Gmail All Mail duplicate must merge within Gmail, never across accounts');
    assert(!h.S.messages.some((m) => m.path === '[Gmail]/All Mail'));
    assert(h.S.messages.every((m) => m.accId && m.path && m.uid), 'Source coordinates must survive aggregation');
    h.S.localDraft = draft;
    h.renderList();
    assert(query('.local-draft'), 'Local draft must appear in all-mail scope');
    h.select(null, '@role:drafts');
    await settle();
    assert(query('.local-draft'), 'Local draft must appear in unified drafts');
    failPath = '[Gmail]/Sent';
    h.select(null, '@role:sent');
    await settle();
    assert.equal(h.S.messages.length, 1, 'One failed folder must not hide successful accounts');
    assert(h.S.errors[0].includes('已发送'));
    assert.equal(query('#sync-status').textContent, '同步未完成');
    failPath = null;
    h.select('a', 'INBOX');
    await settle();
    assert.equal(h.S.messages.length, 1);
    assert.equal(query('#search-input').placeholder, '搜索当前文件夹');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    assert.equal(w.document.activeElement, query('#search-input'));
    const similar = [item('a', 'INBOX', 7, { emailId: null }), item('a', 'Custom', 7, { emailId: null })];
    assert.equal(h.mergeScopeMessages(similar, true).length, 2, 'Similar subjects/UIDs alone cannot cause deduplication');
    console.log('PASS: clickable global/account scopes, five role mappings, source-aware aggregation, account-wide search, Gmail deduplication, local drafts, partial errors, and Ctrl+F.');
  } finally { w.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
