/* 渲染进程：三栏界面。所有邮件数据都经 window.api 从主进程取。 */
const call = (...a) => window.api.call(...a);
const $ = (id) => document.getElementById(id);
const IS_COMPOSE_WINDOW = new URLSearchParams(window.location.search).get('compose') === '1';

// ---------- 小工具 ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  inboxStack: '<path d="M6 3h12M4 7h16"/><path d="m5 11-3 6v4h20v-4l-3-6Z"/><path d="M2 17h6l2 3h4l2-3h6"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  draft: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  up: '<path d="M12 20V4m-7 7 7-7 7 7"/>',
  down: '<path d="M12 4v16m-7-7 7 7 7-7"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  replyAll: '<polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>',
  forward: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  unread: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="10"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
};
const ic = (name, size = 18, fill = false) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

const SPECIAL_ICON = {
  '\\Inbox': 'inbox', '\\Flagged': 'star', '\\Drafts': 'draft', '\\Sent': 'send', '\\All': 'mail',
  '\\Archive': 'archive', '\\Junk': 'alert', '\\Trash': 'trash', '\\Important': 'star',
};

const COLORS = ['#3b7ddd', '#d9534f', '#2f9e6e', '#8b5cf6', '#e08a1e', '#0ea5b7', '#c2417c'];
const colorOf = (s) => {
  let h = 0;
  for (const c of s || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};
const avatar = (name, seed) =>
  `<div class="avatar" style="background:${colorOf(seed || name)}">${esc((name || '?').trim().charAt(0).toUpperCase() || '?')}</div>`;
const mailboxColorOf = (email) => ({ 'xynu.edu.cn': '#184d85', 'gmail.com': '#d93025', '163.com': '#b51c28', 'qq.com': '#0078d7' }[email.split('@')[1]?.toLowerCase()] || colorOf(email));
const mailboxIcon = (email) => `<div class="avatar mailbox-icon" style="--mailbox-color:${email ? mailboxColorOf(email) : '#3b7ddd'}" aria-hidden="true">${ic(email ? 'mail' : 'inboxStack', 22)}</div>`;

const personName = (p) => (p ? p.name || p.address : '未知发件人');

function fmtDate(iso, full = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (!full && d.toDateString() === now.toDateString()) return hm;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const ymd = d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
  return full ? `${ymd}, ${hm}` : ymd;
}

const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = isErr ? 'err' : '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isErr ? 6000 : 2500);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e.message || String(e), true);
    return undefined;
  }
}

// ---------- 状态 ----------
const S = {
  accounts: [],
  folders: {}, // accId -> folders[]
  status: {}, // accId -> online/offline/error/auth
  sel: { accId: null, path: 'INBOX' }, // accId=null 表示所有账户的收件箱
  messages: [],
  limit: 50,
  total: 0,
  unreadOnly: false,
  search: '',
  curKey: null,
  cur: null, // 当前打开的邮件详情
  loadingMsg: false,
  errors: [],
  loading: false,
  hasListCache: false,
  localDraft: null,
  selectedKeys: new Set(),
  anchorKey: null,
};
let listToken = 0;
let msgToken = 0;

const keyOf = (m) => `${m.accId}|${m.path}|${m.uid}`;
const accById = (id) => S.accounts.find((a) => a.id === id);
const accountAlias = (a) => a.alias || ({ 'xynu.edu.cn': 'XYNU 邮箱', 'gmail.com': 'Gmail 邮箱', '163.com': '163 邮箱', 'qq.com': 'QQ 邮箱' }[a.email.split('@')[1]?.toLowerCase()] || a.email);
const folderMeta = (accId, path) => (S.folders[accId] || []).find((f) => f.path === path);
const isUnified = () => S.sel.accId === null;

function trustedSenders() {
  try {
    return new Set(JSON.parse(localStorage.getItem('trustedSenders') || '[]'));
  } catch {
    return new Set();
  }
}
function trustSender(addr) {
  const s = trustedSenders();
  s.add(addr.toLowerCase());
  try {
    localStorage.setItem('trustedSenders', JSON.stringify([...s]));
  } catch {}
}

// ---------- 侧栏 ----------
function totalUnread() {
  return S.accounts.reduce((n, a) => n + (S.folders[a.id]?.find((f) => f.specialUse === '\\Inbox')?.unseen || 0), 0);
}

function renderNav() {
  const multi = S.accounts.length > 1;
  const cnt = (n) => (n ? `<span class="count">${n}</span>` : '');
  const item = (accId, path, label, icon, count, depth = 0, localDraft = false) => {
    const active = S.sel.accId === accId && S.sel.path === path;
    return `<div class="nav-item ${active ? 'active' : ''}" data-acc="${esc(accId ?? '')}" data-path="${esc(path)}" style="padding-left:${10 + depth * 16}px">
      ${ic(icon, 17)}<span class="label">${esc(label)}</span>${localDraft ? '<span class="local-draft-badge">本地 1</span>' : ''}${cnt(count)}</div>`;
  };
  let h = '<div class="nav-group">邮件</div>';
  if (multi) h += item(null, 'INBOX', '所有收件箱', 'inbox', totalUnread());
  for (const a of S.accounts) {
    const folders = S.folders[a.id] || [];
    if (multi) {
      h += `<div class="nav-group nav-account" data-account="${esc(a.id)}" title="${esc(a.email)}"><span class="sdot ${S.status[a.id] || ''}"></span><div class="account-label account-alias">${esc(accountAlias(a))}</div></div>`;
    }
    const specials = folders.filter((f) => f.specialUse);
    const others = folders.filter((f) => !f.specialUse);
    if (!folders.length) {
      h += item(a.id, 'INBOX', '收件箱', 'inbox', 0);
    }
    for (const f of specials) h += item(a.id, f.path, f.label, SPECIAL_ICON[f.specialUse] || 'folder', f.unseen, 0, f.specialUse === '\\Drafts' && S.localDraft?.accId === a.id);
    if (S.localDraft?.accId === a.id && !specials.some((f) => f.specialUse === '\\Drafts')) {
      h += item(a.id, '@local-drafts', '草稿', 'draft', 0, 0, true);
    }
    if (others.length) {
      if (!multi) h += '<div class="nav-group">文件夹</div>';
      for (const f of others) h += item(a.id, f.path, f.label, 'folder', f.unseen, f.depth);
    }
  }
  $('nav').innerHTML = h;
}

function renderHead() {
  const a = isUnified() ? null : accById(S.sel.accId);
  const first = S.accounts[0];
  if (!S.accounts.length) {
    $('acct-head').innerHTML = `${mailboxIcon()}<div class="meta"><div class="name">Light Mail</div><div class="mail">尚未添加账户</div></div>`;
  } else if (a || S.accounts.length === 1) {
    const x = a || first;
    $('acct-head').innerHTML = `${mailboxIcon(x.email)}<div class="meta"><div class="name" title="${esc(accountAlias(x))}">${esc(accountAlias(x))}</div><div class="mail" title="${esc(x.email)}">${esc(x.email)}</div></div>`;
  } else {
    $('acct-head').innerHTML = `${mailboxIcon()}<div class="meta"><div class="name">所有收件箱</div><div class="mail">${S.accounts.length} 个邮箱</div></div>`;
  }
  $('btn-compose').innerHTML = `${ic('pen')}写邮件${S.localDraft ? '<span class="local-draft-badge compose-draft-badge">草稿 1</span>' : ''}`;
  $('btn-search').innerHTML = `${ic('search')}搜索`;
  $('btn-settings').innerHTML = `${ic('settings')}设置`;
  $('btn-unread').innerHTML = ic('filter');
  $('btn-refresh').innerHTML = ic('refresh');
}

function renderFoot() {
  const vals = S.accounts.map((a) => S.status[a.id]);
  let t = '已同步';
  if (!S.accounts.length) t = '';
  else if (S.loading) t = '同步中…';
  else if (vals.includes('auth')) t = '登录失败，请检查密码';
  else if (vals.includes('error')) t = '连接出错，重试中…';
  else if (vals.includes('offline') || vals.includes(undefined)) t = '连接中…';
  $('side-foot').textContent = t;
}

// ---------- 列表 ----------
function listTitle() {
  if (isUnified()) return '所有收件箱';
  if (S.sel.path === '@local-drafts') return '草稿';
  return folderMeta(S.sel.accId, S.sel.path)?.label || (S.sel.path === 'INBOX' ? '收件箱' : S.sel.path);
}

function visibleMessages() {
  return S.unreadOnly ? S.messages.filter((m) => !m.seen) : S.messages;
}

function renderList() {
  $('list-title').textContent = S.search ? `搜索：${S.search}` : listTitle();
  $('btn-unread').classList.toggle('on', S.unreadOnly);
  const list = $('list');
  const keepScroll = list.scrollTop;
  let h = '';
  const selectedCount = selectedMessages().length;
  if (selectedCount > 1) h += `<div class="selection-bar"><span>已选 ${selectedCount} 封</span><button class="btn" data-act="bulk-read">已读</button><button class="btn" data-act="bulk-move">移动</button><button class="btn" data-act="bulk-trash">删除</button><button class="icon-btn" data-act="clear-selection" title="取消选择">${ic('x')}</button></div>`;
  for (const e of S.errors) h += `<div class="banner">${esc(e)}</div>`;
  const msgs = visibleMessages();
  const draft = S.localDraft?.accId === S.sel.accId
    && (S.sel.path === '@local-drafts' || folderMeta(S.sel.accId, S.sel.path)?.specialUse === '\\Drafts')
    && (!S.search || [S.localDraft.subject, S.localDraft.to, S.localDraft.cc, S.localDraft.body].some((text) => (text || '').toLowerCase().includes(S.search.toLowerCase())))
    ? S.localDraft : null;
  if (draft) {
    const preview = (draft.body || '').replace(/\s+/g, ' ').trim() || (draft.attachments?.length ? `${draft.attachments.length} 个附件` : '点击继续编辑');
    h += `<div class="row local-draft" data-act="edit-draft" role="button" tabindex="0" title="继续编辑本地草稿">
      <div class="r1"><span class="from">收件人：${esc(draft.to || '（未填写）')}</span><span class="date">${fmtDate(draft.updatedAt)}</span></div>
      <div class="r2"><span class="subj">${esc(draft.subject || '（无主题）')}</span></div>
      <div class="r3"><span class="txt">${esc(preview)}</span><span class="local-draft-badge">本地草稿</span></div></div>`;
  }
  if (!S.accounts.length) {
    h += `<div class="empty">还没有邮箱账户<br><br><button class="btn primary" data-act="add-account">添加邮箱</button></div>`;
  } else if (!msgs.length && !draft) {
    h += `<div class="empty">${S.loading && !S.hasListCache ? '加载中…' : S.unreadOnly ? '没有未读邮件' : '这里没有邮件'}</div>`;
  } else {
    const sentView = ['\\Sent', '\\Drafts'].includes(folderMeta(S.sel.accId, S.sel.path)?.specialUse);
    for (const m of msgs) {
      const who = sentView ? (m.to[0] ? '收件人：' + personName(m.to[0]) : '（无收件人）') : personName(m.from);
      const domain = m.accEmail.split('@')[1]?.toLowerCase();
      const mailboxName = { 'xynu.edu.cn': 'XYNU', 'gmail.com': 'Gmail', '163.com': '163', 'qq.com': 'QQ' }[domain] || m.accEmail;
      const mailboxColor = mailboxColorOf(m.accEmail);
      const tag = isUnified() && S.accounts.length > 1 ? `<span class="tag" style="--mailbox-color:${mailboxColor}" title="${esc(m.accEmail)}">${esc(mailboxName)}</span>` : '';
      h += `<div class="row ${m.seen ? '' : 'unread'} ${S.selectedKeys.has(keyOf(m)) ? 'sel' : ''}" data-key="${esc(keyOf(m))}">
        <span class="dot"></span>
        <input type="checkbox" class="row-check" aria-label="选择 ${esc(m.subject)}" ${S.selectedKeys.has(keyOf(m)) ? 'checked' : ''}/>
        <div class="r1"><span class="from">${esc(who)}</span><span class="date">${fmtDate(m.date)}</span></div>
        <div class="r2"><span class="subj">${esc(m.subject)}</span>${m.flagged ? `<span class="star">${ic('star', 13, true)}</span>` : ''}</div>
        <div class="r3"><span class="txt">${esc(m.preview)}</span>${tag}</div>
      </div>`;
    }
    if (!S.loading && !S.search && S.messages.length >= S.limit) h += `<button class="more" data-act="more">加载更多</button>`;
  }
  list.innerHTML = h;
  list.scrollTop = keepScroll;
  renderNavButtons();
}

async function loadList() {
  const token = ++listToken;
  if (S.sel.path === '@local-drafts') {
    S.loading = false;
    S.errors = [];
    S.messages = [];
    renderList();
    renderFoot();
    return;
  }
  S.loading = true;
  S.errors = [];
  renderFoot();
  const unified = isUnified();
  const limit = S.limit;
  const search = S.search;
  const targets = unified
    ? S.accounts.map((a) => ({ accId: a.id, path: 'INBOX' }))
    : S.accounts.length
      ? [{ ...S.sel }]
      : [];
  const per = unified ? Math.min(limit, 40 + (limit - 50)) : limit;
  const groups = new Map();
  const publish = () => {
    const all = [...groups.values()].flatMap((r) => r.messages);
    all.sort((a, b) => new Date(b.date) - new Date(a.date));
    S.messages = unified ? all.slice(0, limit) : all;
    S.hasListCache = all.length > 0 || groups.size === targets.length;
    if (!unified && targets.length && groups.has(targets[0].accId)) S.total = groups.get(targets[0].accId).total;
    renderList();
  };
  // 缓存读取只访问本机磁盘，不等待 IMAP 连接和远程请求。
  await Promise.all(targets.map(async (t) => {
    const cached = await call('messages:cached', t.accId, t.path, { limit: per, search }).catch(() => null);
    if (token === listToken && cached) groups.set(t.accId, cached);
  }));
  if (token !== listToken) return;
  publish();
  await Promise.allSettled(
    targets.map(async (t) => {
      try {
        const result = await call('messages:list', t.accId, t.path, { limit: per, search });
        if (token !== listToken) return;
        groups.set(t.accId, result);
      } catch (err) {
        if (token !== listToken) return;
        const acc = accById(t.accId);
        S.errors.push(`${acc?.email || ''}：${err.message}`);
      }
      if (token === listToken) publish();
    })
  );
  if (token !== listToken) return;
  S.loading = false;
  S.selectedKeys = new Set([...(S.selectedKeys || [])].filter((key) => S.messages.some((m) => keyOf(m) === key)));
  // 当前邮件已不在列表里（被移走/删除）
  if (S.curKey && !S.search && !S.messages.some((m) => keyOf(m) === S.curKey)) closeMessage(false);
  renderList();
  renderFoot();
}

async function refreshFolders(accIds) {
  await Promise.all(
    (accIds || S.accounts.map((a) => a.id)).map(async (id) => {
      try {
        S.folders[id] = await call('folders:list', id);
      } catch (e) {
        S.errors.push(`${accById(id)?.email || ''}：${e.message}`);
      }
    })
  );
  renderNav();
  call('app:unread', totalUnread());
}

function select(accId, path) {
  S.sel = { accId, path };
  S.search = '';
  $('search-input').value = '';
  S.limit = 50;
  S.messages = [];
  S.selectedKeys.clear();
  S.anchorKey = null;
  closeMessage(false);
  renderNav();
  renderHead();
  loadList();
}

// ---------- 阅读 ----------
function closeMessage(rerender = true) {
  S.curKey = null;
  S.cur = null;
  S.loadingMsg = false;
  msgToken++;
  renderReader();
  if (rerender) renderList();
}

function renderNavButtons() {
  const idx = visibleMessages().findIndex((m) => keyOf(m) === S.curKey);
  const prev = $('read-pane').querySelector('[data-act="prev"]');
  const next = $('read-pane').querySelector('[data-act="next"]');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx < 0 || idx >= visibleMessages().length - 1;
}

async function openMessage(item) {
  const token = ++msgToken;
  if (!S.selectedKeys?.has(keyOf(item))) S.selectedKeys = new Set([keyOf(item)]);
  S.anchorKey = keyOf(item);
  S.curKey = keyOf(item);
  S.cur = null;
  S.loadingMsg = true;
  renderList();
  const cached = await call('message:cached', item.accId, item.path, item.uid).catch(() => null);
  if (token !== msgToken) return;
  if (cached) {
    S.cur = cached;
    S.loadingMsg = false;
  }
  renderReader();
  const m = await guard(() => call('message:get', item.accId, item.path, item.uid));
  if (token !== msgToken) return;
  S.loadingMsg = false;
  if (!m) {
    if (!cached) closeMessage();
    return;
  }
  S.cur = m;
  const row = S.messages.find((x) => keyOf(x) === S.curKey);
  if (row && !row.seen) {
    row.seen = true;
    const f = folderMeta(item.accId, item.path);
    if (f && f.unseen > 0) f.unseen--;
    renderNav();
    call('app:unread', totalUnread());
  }
  renderReader();
  renderList();
}

let disposeReaderFrame = () => {};
function renderReader() {
  const pane = $('read-pane');
  const existing = $('body-frame');
  if (S.cur && existing?.dataset.messageKey === S.curKey && existing.mailHtml === S.cur.html) {
    const star = pane.querySelector('.star-btn');
    if (star) {
      star.classList.toggle('on', S.cur.flagged);
      star.innerHTML = ic('star', 20, S.cur.flagged);
    }
    renderNavButtons();
    return;
  }
  disposeReaderFrame();
  if (!S.curKey) {
    pane.innerHTML = `<div class="read-empty">${ic('mail', 44)}<div style="margin-top:10px">选择一封邮件阅读</div></div>`;
    return;
  }
  const item = S.messages.find((m) => keyOf(m) === S.curKey);
  const m = S.cur;
  const bar = `<div class="read-bar">
    <div class="grp">
      <button class="icon-btn" data-act="close" title="关闭 (Esc)">${ic('x')}</button>
      <button class="icon-btn" data-act="prev" title="上一封 (K)">${ic('left')}</button>
      <button class="icon-btn" data-act="next" title="下一封 (J)">${ic('right')}</button>
    </div>
    <div class="grp">
      <button class="icon-btn" data-act="reply" title="回复 (R)" ${m ? '' : 'disabled'}>${ic('reply')}</button>
      <button class="icon-btn" data-act="replyAll" title="回复全部" ${m ? '' : 'disabled'}>${ic('replyAll')}</button>
      <button class="icon-btn" data-act="forward" title="转发" ${m ? '' : 'disabled'}>${ic('forward')}</button>
      <button class="icon-btn" data-act="unread" title="标为未读 (U)" ${m ? '' : 'disabled'}>${ic('unread')}</button>
      <button class="icon-btn" data-act="junk" title="垃圾邮件 (!)" ${m ? '' : 'disabled'}>${ic('alert')}</button>
      <button class="icon-btn" data-act="archive" title="归档 (E)" ${m ? '' : 'disabled'}>${ic('archive')}</button>
      <button class="icon-btn" data-act="trash" title="删除 (Delete)" ${m ? '' : 'disabled'}>${ic('trash')}</button>
    </div>
  </div>`;
  if (!m) {
    pane.innerHTML = `${bar}<div class="read-scroll"><div class="subject-row"><h1>${esc(item?.subject || '')}</h1></div><div class="empty">加载中…</div></div>`;
    renderNavButtons();
    return;
  }
  const to = [...m.to].map(personName).join('、') || '（无）';
  const acc = accById(m.accId);
  const toLabel = m.to.length === 1 && m.to[0].address.toLowerCase() === acc?.email.toLowerCase() ? '我' : to;
  pane.innerHTML = `${bar}
  <div class="read-scroll">
    <div class="subject-row">
      <h1>${esc(m.subject)}</h1>
      <button class="icon-btn star-btn ${m.flagged ? 'on' : ''}" data-act="star" title="加星标 (S)">${ic('star', 20, m.flagged)}</button>
    </div>
    <div class="card">
      <div class="card-head">
        ${avatar(personName(m.from), m.from?.address)}
        <div class="who">
          <div class="sender"><b>${esc(personName(m.from))}</b><span>${esc(m.from?.name ? m.from.address : '')}</span>${m.unsubscribe ? `<a data-act="unsub">退订</a>` : ''}</div>
          <div class="to">收件人：${esc(toLabel)}${m.cc.length ? '　抄送：' + esc(m.cc.map(personName).join('、')) : ''}</div>
        </div>
        <div class="when">${fmtDate(m.date, true)}</div>
      </div>
      <div class="body-wrap"><iframe id="body-frame" scrolling="no" sandbox="allow-same-origin"></iframe></div>
      ${m.attachments.length ? `<div class="atts">${m.attachments.map((a) => `<div class="att" data-att="${a.id}" style="cursor:pointer">${ic('clip', 15)}<span>${esc(a.filename)}</span><small>${fmtSize(a.size)}</small></div>`).join('')}</div>` : ''}
    </div>
  </div>`;
  fillFrame(m, true);
  renderNavButtons();
}

function fillFrame(m, allowImages) {
  const f = $('body-frame');
  disposeReaderFrame();
  f.dataset.messageKey = S.curKey;
  f.mailHtml = m.html;
  f.style.visibility = 'hidden';
  const img = allowImages ? 'https: http: data:' : 'data:';
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src ${allowImages ? 'https:' : "'none'"}">
<base target="_blank">
<style>html,body{margin:0;overflow:hidden}body{font:14px/1.65 "Segoe UI","Microsoft YaHei UI",sans-serif;color:#222;background:#fff;word-break:break-word;overflow-wrap:anywhere}#mail-content{display:flow-root;box-sizing:border-box;padding:18px 22px}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#2563c9}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #ddd;color:#555}</style>
</head><body><div id="mail-content">${m.html}</div></body></html>`;
  let observer;
  let frame;
  let disposed = false;
  let prepared = false;
  const prepare = () => {
    if (disposed || !f.isConnected || prepared) return;
    const d = f.contentDocument;
    const content = d?.getElementById('mail-content');
    if (!content) {
      frame = requestAnimationFrame(prepare);
      return;
    }
    prepared = true;
    d.addEventListener('click', (e) => {
      const a = e.target.closest?.('a');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) call('external:open', a.href || href);
    });
    const fit = () => {
      if (disposed || !f.isConnected) return;
      // 先以当前阅读宽度排版，再缩放带固定最小宽度的邮件，避免右侧被裁切。
      content.style.zoom = '1';
      content.style.width = 'auto';
      const available = d.documentElement.clientWidth;
      if (!available) return;
      const naturalWidth = Math.max(available, content.scrollWidth + (content.scrollWidth > available ? 22 : 0));
      const scale = Math.min(1, available / naturalWidth);
      content.style.width = scale < 1 ? naturalWidth + 'px' : 'auto';
      content.style.zoom = String(scale);
      const height = Math.max(80, Math.ceil(content.getBoundingClientRect().height), Math.ceil(content.scrollHeight * scale));
      if (f.style.height !== height + 'px') f.style.height = height + 'px';
      f.style.visibility = 'visible';
    };
    fit();
    observer = new ResizeObserver(fit);
    observer.observe(content);
    observer.observe(f.parentElement);
  };
  disposeReaderFrame = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    f.removeEventListener('load', prepare);
  };
  f.addEventListener('load', prepare, { once: true });
  f.srcdoc = doc;
  frame = requestAnimationFrame(prepare);
}

// ---------- 对邮件的操作 ----------
function neighbour(key) {
  const v = visibleMessages();
  const i = v.findIndex((m) => keyOf(m) === key);
  return v[i + 1] || v[i - 1] || null;
}

function move(delta) {
  const v = visibleMessages();
  const i = v.findIndex((m) => keyOf(m) === S.curKey);
  const t = v[i + delta];
  if (t) openMessage(t);
}

async function moveAway(kind) {
  const m = S.cur;
  if (!m) return;
  const key = S.curKey;
  const next = neighbour(key);
  const f = folderMeta(m.accId, m.path);
  S.messages = S.messages.filter((x) => keyOf(x) !== key);
  if (next) openMessage(next);
  else closeMessage();
  renderList();
  const ok = await guard(() => call('message:move', m.accId, m.path, [m.uid], kind));
  if (ok === undefined) loadList();
  else {
    toast(kind === 'trash' ? (f?.specialUse === '\\Trash' ? '已永久删除' : '已移到废纸篓') : kind === 'archive' ? '已归档' : '已标为垃圾邮件');
    refreshFolders([m.accId]);
  }
}

async function toggleStar() {
  const m = S.cur;
  if (!m) return;
  m.flagged = !m.flagged;
  const row = S.messages.find((x) => keyOf(x) === S.curKey);
  if (row) row.flagged = m.flagged;
  renderReader();
  renderList();
  const ok = await guard(() => call('message:flag', m.accId, m.path, [m.uid], '\\Flagged', m.flagged));
  if (ok === undefined) {
    m.flagged = !m.flagged;
    renderReader();
  }
}

async function markUnread() {
  const m = S.cur;
  if (!m) return;
  const row = S.messages.find((x) => keyOf(x) === S.curKey);
  if (row) row.seen = false;
  const f = folderMeta(m.accId, m.path);
  if (f) f.unseen++;
  closeMessage();
  renderNav();
  await guard(() => call('message:flag', m.accId, m.path, [m.uid], '\\Seen', false));
  call('app:unread', totalUnread());
}

// ---------- 写信 ----------
function quoteOf(m) {
  const who = m.from ? `${m.from.name || ''} <${m.from.address}>`.trim() : '';
  const body = (m.text || '').split(/\r?\n/).map((l) => '> ' + l).join('\n');
  return `\n\n${fmtDate(m.date, true)}，${who} 写道：\n${body}`;
}

let composeOpening = false;
function updateLocalDraft(draft) {
  const previousAccount = S.localDraft?.accId;
  S.localDraft = draft;
  if (previousAccount !== draft?.accId) {
    renderHead();
    renderNav();
  }
}
async function openCompose(init = {}, resume = false) {
  if (!IS_COMPOSE_WINDOW) {
    const accId = init.accId || (isUnified() ? S.accounts[0]?.id : S.sel.accId) || S.accounts[0]?.id;
    if (!accId) return openAccountDialog();
    return guard(() => call('compose:open', { ...init, accId }, Object.keys(init).length === 0));
  }
  if (composeOpening || $('c-body')) return;
  composeOpening = true;
  let saved;
  try {
    saved = await call('draft:get');
    updateLocalDraft(saved);
  } catch (err) {
    toast('无法读取本地草稿：' + err.message, true);
    return;
  } finally {
    composeOpening = false;
  }
  if (saved) {
    if (!resume && Object.keys(init).length && !confirm('已有未完成的本地草稿，是否继续编辑？取消将保留原草稿。')) { window.close(); return; }
    init = saved;
  }
  const accId = init.accId || (isUnified() ? S.accounts[0]?.id : S.sel.accId) || S.accounts[0]?.id;
  if (saved && !accById(accId)) {
    toast('草稿所属邮箱已移除，请先重新添加该邮箱；草稿仍保留在本机。', true);
    return;
  }
  if (!accId) {
    toast('请先添加邮箱账户', true);
    return openAccountDialog();
  }
  let attachments = [...(init.attachments || [])];
  const draftId = saved?.id || crypto.randomUUID();
  let hasSaved = Boolean(saved);
  let sending = false;
  let finished = false;
  const root = $('modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal wide compose-modal">
    <div class="modal-head"><span>${esc(init.title || '写邮件')}</span><button class="icon-btn" data-c="cancel">${ic('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>发件人</label><select id="c-from">${S.accounts.map((a) => `<option value="${a.id}" ${a.id === accId ? 'selected' : ''}>${esc(a.name ? `${a.name} <${a.email}>` : a.email)}</option>`).join('')}</select></div>
      <div class="field"><label>收件人（多个用逗号分隔）</label><input id="c-to" value="${esc(init.to || '')}" /></div>
      <div class="field"><label>抄送</label><input id="c-cc" value="${esc(init.cc || '')}" /></div>
      <div class="field"><label>主题</label><input id="c-subject" value="${esc(init.subject || '')}" /></div>
      <div class="field compose-editor"><textarea id="c-body" class="compose-body">${esc(init.body || '')}</textarea></div>
      <div class="chips" id="c-atts"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-c="attach">${ic('clip', 15)} 添加附件</button>
      <span class="grow" id="c-msg"></span>
      <button class="btn danger" data-c="discard">放弃草稿</button>
      <button class="btn" data-c="cancel">关闭</button>
      <button class="btn primary" data-c="send">发送</button>
    </div></div></div>`;
  const q = (id) => $(id);
  const persist = () => {
    if (finished || !$('c-body')) return true;
    const draft = { id: draftId, accId: q('c-from').value, title: init.title || '写邮件',
      to: q('c-to').value, cc: q('c-cc').value, subject: q('c-subject').value, body: q('c-body').value,
      inReplyTo: init.inReplyTo, references: init.references, attachments, updatedAt: new Date().toISOString() };
    if (!hasSaved && !draft.to && !draft.cc && !draft.subject && !draft.body && !attachments.length) return true;
    try {
      window.api.saveDraft(draft);
      updateLocalDraft(draft);
      hasSaved = true;
      q('c-msg').textContent = '草稿已保存';
      return true;
    } catch (err) {
      q('c-msg').textContent = '草稿保存失败：' + err.message;
      return false;
    }
  };
  const beforeUnload = (event) => {
    if (sending || !persist()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  const close = () => {
    window.removeEventListener('beforeunload', beforeUnload);
    root.innerHTML = '';
    if (IS_COMPOSE_WINDOW) window.close();
    else renderList();
  };
  const overlay = root.querySelector('.overlay');
  overlay.addEventListener('input', persist);
  overlay.addEventListener('change', persist);
  window.addEventListener('beforeunload', beforeUnload);
  const drawAtts = () => {
    q('c-atts').innerHTML = attachments
      .map((a, i) => `<span class="chip">${esc(a.name)} <small>${fmtSize(a.size)}</small><button data-rm="${i}">×</button></span>`)
      .join('');
  };
  drawAtts();
  persist();
  (init.to ? q('c-body') : q('c-to')).focus();
  if (init.to) q('c-body').setSelectionRange(0, 0);
  root.querySelector('.overlay').addEventListener('click', async (e) => {
    if (sending) return;
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      attachments.splice(Number(rm.dataset.rm), 1);
      drawAtts();
      persist();
      return;
    }
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'cancel') {
      if (persist()) close();
      return;
    }
    if (act === 'discard') {
      if (!confirm('放弃这封邮件并删除本地草稿？此操作无法恢复。')) return;
      try {
        await call('draft:discard', draftId);
        updateLocalDraft(null);
        finished = true;
        close();
      } catch (err) { toast('无法删除草稿：' + err.message, true); }
      return;
    }
    if (act === 'attach') {
      const files = await guard(() => call('files:pick'));
      if (files) {
        attachments.push(...files);
        drawAtts();
        persist();
      }
    }
    if (act === 'send') {
      const to = q('c-to').value.trim();
      if (!to) {
        q('c-msg').textContent = '请填写收件人';
        return;
      }
      if (!persist()) return;
      sending = true;
      overlay.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = true; });
      q('c-msg').textContent = '发送中…';
      try {
        const result = await call('message:send', q('c-from').value, {
          to,
          cc: q('c-cc').value.trim(),
          subject: q('c-subject').value,
          text: q('c-body').value,
          inReplyTo: init.inReplyTo,
          references: init.references,
          attachments: attachments.map((a) => a.path),
        }, draftId);
        if (result?.draftCleared !== false) updateLocalDraft(null);
        finished = true;
        close();
        toast(result?.draftCleared === false ? '已发送，但本地草稿清理失败，请勿重复发送' : '已发送', result?.draftCleared === false);
        if (S.sel.path !== 'INBOX') loadList();
      } catch (err) {
        sending = false;
        overlay.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = false; });
        q('c-msg').textContent = '发送失败：' + err.message;
      }
    }
  });
}

function replyTo(all, m = S.cur) {
  if (!m) return;
  const acc = accById(m.accId);
  const me = acc?.email.toLowerCase();
  const target = m.replyTo || m.from;
  let to = target ? target.address : '';
  let cc = '';
  if (all) {
    const others = [...m.to, ...m.cc].map((p) => p.address).filter((a) => a && a.toLowerCase() !== me && a !== target?.address);
    cc = others.join(', ');
  }
  openCompose({
    accId: m.accId,
    title: all ? '回复全部' : '回复',
    to,
    cc,
    subject: /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject,
    body: quoteOf(m),
    inReplyTo: m.messageId,
    references: [...m.references, m.messageId].filter(Boolean),
  });
}

function forwardMsg(m = S.cur) {
  if (!m) return;
  const head = `\n\n---------- 转发的邮件 ----------\n发件人：${personName(m.from)} <${m.from?.address || ''}>\n日期：${fmtDate(m.date, true)}\n主题：${m.subject}\n\n${m.text}`;
  openCompose({ accId: m.accId, title: '转发', subject: /^fwd?:/i.test(m.subject) ? m.subject : 'Fwd: ' + m.subject, body: head });
}

// ---------- 账户与设置 ----------
const PRESETS = {
  gmail: { label: 'Gmail', imap: ['imap.gmail.com', 993, true], smtp: ['smtp.gmail.com', 465, true], saveSent: false,
    hint: 'Gmail 需要先开启两步验证，再在 Google 账号 → 安全性 → 应用专用密码 中生成一个 16 位密码填在这里。' },
  outlook: { label: 'Outlook / Hotmail', imap: ['outlook.office365.com', 993, true], smtp: ['smtp.office365.com', 587, false], saveSent: false,
    hint: '注意：微软已对多数个人 Outlook/Hotmail 账户关闭密码登录（只允许 OAuth），可能无法连接；工作/学校账户取决于管理员设置。' },
  qq: { label: 'QQ 邮箱', imap: ['imap.qq.com', 993, true], smtp: ['smtp.qq.com', 465, true], saveSent: true,
    hint: '在 QQ 邮箱网页版 设置 → 账号 中开启 IMAP/SMTP，并生成“授权码”填在密码处。' },
  163: { label: '163 邮箱', imap: ['imap.163.com', 993, true], smtp: ['smtp.163.com', 465, true], saveSent: true,
    hint: '在网页版 设置 → POP3/SMTP/IMAP 中开启服务并获取“授权码”填在密码处。' },
  126: { label: '126 邮箱', imap: ['imap.126.com', 993, true], smtp: ['smtp.126.com', 465, true], saveSent: true,
    hint: '在网页版 设置 → POP3/SMTP/IMAP 中开启服务并获取“授权码”填在密码处。' },
  icloud: { label: 'iCloud 邮箱', imap: ['imap.mail.me.com', 993, true], smtp: ['smtp.mail.me.com', 587, false], saveSent: false,
    hint: '需要在 appleid.apple.com 生成“App 专用密码”。' },
  yahoo: { label: 'Yahoo 邮箱', imap: ['imap.mail.yahoo.com', 993, true], smtp: ['smtp.mail.yahoo.com', 465, true], saveSent: false,
    hint: '需要在账户安全设置中生成“应用密码”。' },
  custom: { label: '其他（手动填写）', imap: ['', 993, true], smtp: ['', 465, true], saveSent: true, hint: '填写你的邮件服务商提供的 IMAP / SMTP 服务器信息。' },
};
const DOMAIN_PRESET = {
  'gmail.com': 'gmail', 'googlemail.com': 'gmail', 'outlook.com': 'outlook', 'hotmail.com': 'outlook', 'live.com': 'outlook',
  'qq.com': 'qq', 'foxmail.com': 'qq', '163.com': '163', '126.com': '126', 'icloud.com': 'icloud', 'me.com': 'icloud', 'yahoo.com': 'yahoo',
};

function openAccountDialog() {
  const root = $('modal-root');
  const opt = (k) => `<option value="${k}">${esc(PRESETS[k].label)}</option>`;
  root.innerHTML = `<div class="overlay"><div class="modal">
    <div class="modal-head"><span>添加邮箱</span><button class="icon-btn" data-c="cancel">${ic('x')}</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label>邮箱地址</label><input id="a-email" placeholder="you@example.com" autofocus /></div>
        <div class="field"><label>显示名称（发信时的署名）</label><input id="a-name" /></div>
      </div>
      <div class="field"><label>服务商</label><select id="a-preset">${Object.keys(PRESETS).map(opt).join('')}</select></div>
      <div class="field"><label>密码 / 授权码</label><input id="a-pass" type="password" /><div class="hint" id="a-hint"></div></div>
      <div id="a-adv" class="field">
        <label>IMAP 服务器（地址 / 端口 / SSL）</label>
        <div class="grid3"><input id="a-ih" /><input id="a-ip" type="number" /><select id="a-is"><option value="1">SSL</option><option value="0">STARTTLS</option></select></div>
        <label style="margin-top:6px">SMTP 服务器（地址 / 端口 / SSL）</label>
        <div class="grid3"><input id="a-sh" /><input id="a-sp" type="number" /><select id="a-ss"><option value="1">SSL</option><option value="0">STARTTLS</option></select></div>
        <label style="margin-top:6px">登录用户名（留空则用邮箱地址）</label><input id="a-user" />
      </div>
    </div>
    <div class="modal-foot"><span class="grow" id="a-msg"></span>
      <button class="btn" data-c="cancel">取消</button><button class="btn primary" data-c="save">连接并添加</button></div>
  </div></div>`;
  const q = $;
  let preset = 'gmail';
  const applyPreset = (k) => {
    preset = k;
    const p = PRESETS[k];
    q('a-preset').value = k;
    q('a-hint').textContent = p.hint;
    [q('a-ih').value, q('a-ip').value, q('a-is').value] = [p.imap[0], p.imap[1], p.imap[2] ? '1' : '0'];
    [q('a-sh').value, q('a-sp').value, q('a-ss').value] = [p.smtp[0], p.smtp[1], p.smtp[2] ? '1' : '0'];
  };
  applyPreset('gmail');
  q('a-preset').onchange = (e) => applyPreset(e.target.value);
  q('a-email').oninput = (e) => {
    const k = DOMAIN_PRESET[e.target.value.split('@')[1]?.toLowerCase()];
    if (k && k !== preset) applyPreset(k);
  };
  root.querySelector('.overlay').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'cancel') root.innerHTML = '';
    if (act !== 'save') return;
    const email = q('a-email').value.trim();
    const pass = q('a-pass').value;
    if (!email || !pass || !q('a-ih').value || !q('a-sh').value) {
      q('a-msg').textContent = '请填写邮箱、密码和服务器地址';
      return;
    }
    const btn = e.target.closest('[data-c]');
    btn.disabled = true;
    q('a-msg').textContent = '正在连接…';
    const draft = {
      name: q('a-name').value.trim(),
      email,
      user: q('a-user').value.trim() || email,
      pass,
      imap: { host: q('a-ih').value.trim(), port: Number(q('a-ip').value), secure: q('a-is').value === '1' },
      smtp: { host: q('a-sh').value.trim(), port: Number(q('a-sp').value), secure: q('a-ss').value === '1' },
      saveSent: PRESETS[preset].saveSent,
    };
    try {
      const r = await call('accounts:add', draft);
      root.innerHTML = '';
      await loadAccounts();
      if (!r.smtpOk) toast('已添加，但发信服务器验证失败：' + r.smtpError, true);
      else toast('已添加 ' + email);
    } catch (err) {
      btn.disabled = false;
      q('a-msg').textContent = '连接失败：' + err.message;
    }
  });
}

async function openSettings() {
  const st = await guard(() => call('settings:get'));
  if (!st) return;
  const root = $('modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal settings-modal">
    <div class="modal-head"><span>设置</span><button class="icon-btn" data-c="cancel">${ic('x')}</button></div>
    <div class="modal-body">
      <div id="settings-accounts"></div>
      <button class="btn" data-c="add">${ic('plus', 15)} 添加邮箱</button>
      <label class="check"><input type="checkbox" id="s-auto" ${st.autoStart ? 'checked' : ''}/> 开机自启动</label>
      <label class="check"><input type="checkbox" id="s-tray" ${st.closeToTray ? 'checked' : ''}/> 关闭窗口时最小化到托盘</label>
    </div>
  </div></div>`;
  let savingOrder = false;
  const drawAccounts = () => {
    const container = $('settings-accounts');
    if (!container) return;
    container.innerHTML = S.accounts.map((a, i) => `<div class="acct-row">${mailboxIcon(a.email)}<div class="grow"><div title="${esc(a.email)}">${esc(a.email)}</div></div><input class="acct-alias" data-alias="${a.id}" value="${esc(accountAlias(a))}" maxlength="80" aria-label="${esc(a.email)} 的别名" title="邮箱别名，修改后自动保存" ${savingOrder ? 'disabled' : ''}/><div class="acct-actions"><button class="icon-btn" data-move="${a.id}" data-step="-1" title="上移" aria-label="上移 ${esc(a.email)}" ${savingOrder || i === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="icon-btn" data-move="${a.id}" data-step="1" title="下移" aria-label="下移 ${esc(a.email)}" ${savingOrder || i === S.accounts.length - 1 ? 'disabled' : ''}>${ic('down')}</button><button class="icon-btn danger" data-rm="${a.id}" title="移除邮箱" aria-label="移除 ${esc(a.email)}" ${savingOrder ? 'disabled' : ''}>${ic('trash')}</button></div></div>`).join('') || '<div class="empty">尚未添加账户</div>';
  };
  drawAccounts();
  root.querySelector('.overlay').addEventListener('change', async (e) => {
    const input = e.target.closest('[data-alias]');
    if (!input) return;
    const account = accById(input.dataset.alias);
    if (!account) return;
    input.disabled = true;
    try {
      account.alias = await call('accounts:alias', account.id, input.value.trim());
      input.value = accountAlias(account);
      renderHead();
      renderNav();
    } catch (err) {
      input.value = accountAlias(account);
      toast('别名保存失败：' + err.message, true);
    } finally {
      input.disabled = false;
    }
  });
  root.querySelector('.overlay').addEventListener('click', async (e) => {
    if (savingOrder) return;
    const move = e.target.closest('[data-move]');
    if (move) {
      const index = S.accounts.findIndex((a) => a.id === move.dataset.move);
      const next = index + Number(move.dataset.step);
      if (index < 0 || next < 0 || next >= S.accounts.length) return;
      const ordered = [...S.accounts];
      [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
      savingOrder = true;
      drawAccounts();
      try {
        await call('settings:set', { accountOrder: ordered.map((a) => a.id) });
        S.accounts = ordered;
        renderHead();
        renderNav();
      } catch (err) {
        toast('排序保存失败：' + err.message, true);
      } finally {
        savingOrder = false;
        drawAccounts();
      }
      return;
    }
    const rm = e.target.closest('[data-rm]')?.dataset.rm;
    if (rm) {
      const a = accById(rm);
      if (confirm(`移除 ${a.email}？只会删除本机保存的登录信息，不影响邮箱里的邮件。`)) {
        await guard(() => call('accounts:remove', rm));
        root.innerHTML = '';
        if (S.sel.accId === rm) S.sel = { accId: null, path: 'INBOX' };
        await loadAccounts();
      }
      return;
    }
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'add') openAccountDialog();
    if (act === 'cancel') root.innerHTML = '';
  });
  $('s-auto').onchange = (e) => guard(() => call('settings:set', { autoStart: e.target.checked }));
  $('s-tray').onchange = (e) => guard(() => call('settings:set', { closeToTray: e.target.checked }));
}

async function loadAccounts() {
  const [accounts, settings, draft] = await Promise.all([call('accounts:list'), call('settings:get'), call('draft:get')]);
  S.accounts = accounts;
  S.localDraft = draft;
  const savedOrder = Array.isArray(settings.accountOrder) ? settings.accountOrder : [];
  const accountOrder = ['xynu.edu.cn', 'gmail.com', '163.com', 'qq.com'];
  const accountRank = (a) => {
    const savedRank = savedOrder.indexOf(a.id);
    if (savedRank >= 0) return savedRank;
    const rank = accountOrder.indexOf(a.email.split('@')[1]?.toLowerCase());
    return savedOrder.length + (rank < 0 ? accountOrder.length : rank);
  };
  S.accounts.sort((a, b) => accountRank(a) - accountRank(b));
  if (IS_COMPOSE_WINDOW) {
    const request = await call('compose:init');
    await openCompose(request.init, request.resume);
    return;
  }
  if (S.sel.accId && !accById(S.sel.accId)) S.sel = { accId: null, path: 'INBOX' };
  if (S.accounts.length === 1) S.sel = { accId: S.accounts[0].id, path: S.sel.path };
  renderHead();
  renderNav();
  renderReader();
  if (S.localDraft) await openCompose();
  await Promise.all([refreshFolders(), loadList()]);
}

// ---------- 事件 ----------
if (IS_COMPOSE_WINDOW) {
  document.body.classList.add('compose-window');
  guard(loadAccounts);
} else {
$('nav').addEventListener('click', (e) => {
  const it = e.target.closest('.nav-item');
  if (it) select(it.dataset.acc || null, it.dataset.path);
});
$('nav').addEventListener('contextmenu', (event) => guard(() => showFolderMenu(event)));
$('list').addEventListener('contextmenu', (event) => guard(() => showMessageMenu(event)));

$('list').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'add-account') return openAccountDialog();
  if (act === 'edit-draft') return openCompose();
  if (act?.startsWith('bulk-')) return runMessageAction(act.slice(5));
  if (act === 'clear-selection') { S.selectedKeys.clear(); renderList(); return; }
  if (act === 'more') {
    S.limit += 50;
    return loadList();
  }
  const row = e.target.closest('.row');
  if (!row) return;
  const m = S.messages.find((x) => keyOf(x) === row.dataset.key);
  if (m) {
    const toggle = e.ctrlKey || e.metaKey || e.target.matches('.row-check');
    selectMessage(m, toggle, e.shiftKey);
    if (!toggle && !e.shiftKey) openMessage(m);
  }
});
$('list').addEventListener('keydown', (e) => {
  if (e.target.closest('[data-act="edit-draft"]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault();
    openCompose();
  }
});

$('read-pane').addEventListener('click', async (e) => {
  const att = e.target.closest('[data-att]');
  if (att && S.cur) {
    const ok = await guard(() => call('attachment:save', S.cur.accId, S.cur.path, S.cur.uid, Number(att.dataset.att)));
    if (ok) toast('已保存附件');
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const m = S.cur;
  switch (act) {
    case 'close': return closeMessage();
    case 'prev': return move(-1);
    case 'next': return move(1);
    case 'reply': return replyTo(false);
    case 'replyAll': return replyTo(true);
    case 'forward': return forwardMsg();
    case 'star': return toggleStar();
    case 'unread': return markUnread();
    case 'junk': return moveAway('junk');
    case 'archive': return moveAway('archive');
    case 'trash': return m && runMessageAction('trash', [m]);
    case 'unsub': return m?.unsubscribe && call('external:open', m.unsubscribe);
    case 'show-images': return fillFrameNow(true);
    case 'trust':
      if (m?.from) trustSender(m.from.address);
      return fillFrameNow(true);
  }
});

function fillFrameNow(allow) {
  if (!S.cur) return;
  fillFrame(S.cur, allow);
  $('read-pane').querySelector('.img-bar')?.remove();
}

$('btn-compose').onclick = () => openCompose();
$('btn-settings').onclick = openSettings;
$('btn-refresh').onclick = () => {
  refreshFolders();
  loadList();
};
$('btn-unread').onclick = () => {
  S.unreadOnly = !S.unreadOnly;
  renderList();
};
$('btn-search').onclick = () => {
  const row = $('search-row');
  row.hidden = !row.hidden;
  if (!row.hidden) $('search-input').focus();
  else if (S.search) {
    S.search = '';
    $('search-input').value = '';
    loadList();
  }
};
$('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    S.search = e.target.value.trim();
    S.limit = 50;
    loadList();
  }
  if (e.key === 'Escape') {
    e.target.value = '';
    S.search = '';
    $('search-row').hidden = true;
    loadList();
  }
});

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || $('modal-root').innerHTML) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault(); S.selectedKeys = new Set(visibleMessages().map(keyOf)); renderList(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (S.selectedKeys.size > 1 && ['Delete', '#', 'e', '!', 's', 'u'].includes(e.key)) {
    e.preventDefault();
    return runMessageAction({ Delete: 'trash', '#': 'trash', e: 'archive', '!': 'junk', s: 'star', u: 'unread' }[e.key]);
  }
  switch (e.key) {
    case 'j': case 'ArrowDown': e.preventDefault(); return S.curKey ? move(1) : visibleMessages()[0] && openMessage(visibleMessages()[0]);
    case 'k': case 'ArrowUp': e.preventDefault(); return move(-1);
    case 'Escape': if (S.selectedKeys.size) { S.selectedKeys.clear(); renderList(); } return closeMessage();
    case 'Delete': case '#': return runMessageAction('trash');
    case 'e': return moveAway('archive');
    case '!': return moveAway('junk');
    case 's': return toggleStar();
    case 'u': return markUnread();
    case 'r': return replyTo(false);
    case 'c': e.preventDefault(); return openCompose();
  }
});

// ---------- 主进程事件 ----------
let changedTimer;
window.api.on('mail:changed', ({ accId }) => {
  clearTimeout(changedTimer);
  changedTimer = setTimeout(() => {
    refreshFolders(accId ? [accId] : undefined);
    if (!S.search && (!accId || isUnified() || S.sel.accId === accId)) loadList();
  }, 600);
});
window.api.on('acct:status', ({ accId, status }) => {
  S.status[accId] = status;
  renderFoot();
  renderNav();
});
window.api.on('mail:open', async ({ accId, path, uid }) => {
  if (!isUnified()) S.sel = { accId, path };
  S.search = '';
  await loadList();
  const m = S.messages.find((x) => x.accId === accId && x.path === path && x.uid === uid);
  if (m) openMessage(m);
});
window.api.on('app:compose', () => openCompose());
window.api.on('draft:changed', async () => {
  const draft = await guard(() => call('draft:get'));
  if (draft === undefined) return;
  updateLocalDraft(draft);
  if (S.sel.path === '@local-drafts' || folderMeta(S.sel.accId, S.sel.path)?.specialUse === '\\Drafts') renderList();
});

// 兜底：每 3 分钟刷新一次（IDLE 掉线时也不会落下）
setInterval(() => {
  if (document.hidden) return;
  refreshFolders();
  if (!S.search) loadList();
}, 180000);

renderHead();
renderReader();
function initPaneResizing() {
  const defaults = { sidebar: 236, list: 410 };
  let preferred = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem('paneWidths') || '{}');
    for (const key of Object.keys(defaults)) if (Number.isFinite(saved[key])) preferred[key] = saved[key];
  } catch {}
  const sidebar = $('sidebar');
  const list = $('list-pane');
  const handles = { sidebar: $('sidebar-divider'), list: $('list-divider') };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const apply = () => {
    const available = $('app').clientWidth - Object.values(handles).reduce((sum, handle) => sum + handle.offsetWidth, 0);
    const widths = { sidebar: clamp(preferred.sidebar, 200, Math.min(360, available - 280 - 320)) };
    widths.list = clamp(preferred.list, 280, Math.min(720, available - widths.sidebar - 320));
    sidebar.style.width = widths.sidebar + 'px';
    list.style.width = widths.list + 'px';
    for (const key of Object.keys(handles)) {
      handles[key].setAttribute('aria-valuenow', widths[key]);
      handles[key].setAttribute('aria-valuemin', key === 'sidebar' ? 200 : 280);
      handles[key].setAttribute('aria-valuemax', key === 'sidebar' ? Math.min(360, available - 600) : Math.min(720, available - widths.sidebar - 320));
    }
    return widths;
  };
  const save = () => { try { localStorage.setItem('paneWidths', JSON.stringify(preferred)); } catch {} };
  for (const [key, handle] of Object.entries(handles)) {
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { x: event.clientX, width: apply()[key] };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing-panes');
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag) return;
      preferred[key] = drag.width + event.clientX - drag.x;
      preferred[key] = apply()[key];
    });
    const finish = () => {
      if (!drag) return;
      drag = null;
      document.body.classList.remove('resizing-panes');
      save();
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      preferred[key] = event.key === 'Home' ? defaults[key] : apply()[key] + (event.key === 'ArrowLeft' ? -10 : 10);
      preferred[key] = apply()[key];
      save();
    });
    handle.addEventListener('dblclick', () => { preferred[key] = defaults[key]; apply(); save(); });
  }
  window.addEventListener('resize', apply);
  apply();
}

initPaneResizing();
guard(loadAccounts);
}
