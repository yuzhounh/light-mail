/* 渲染进程：三栏界面。所有邮件数据都经 window.api 从主进程取。 */
const call = (...a) => window.api.call(...a);
const $ = (id) => document.getElementById(id);
const IS_COMPOSE_WINDOW = new URLSearchParams(window.location.search).get('compose') === '1';
const IS_READER_WINDOW = new URLSearchParams(window.location.search).get('reader') === '1';
if (IS_READER_WINDOW) document.body.classList.add('reader-window');

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
  popout: '<path d="M14 3h7v7M21 3l-9 9"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
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
const MAILBOX_BRANDS = {
  '163.com': { color: '#C8161D', box: [1.6, 5.5, 22.5, 18.5], paths: '<path transform="translate(-2 0)" d="M3.6 7.4 6 5.5v13"/><path d="M13.2 5.6c-3 0-5.6 2.3-5.6 8.9"/><path d="M10.8 12.1a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z"/><path transform="translate(2 0)" d="M15.2 5.9h4.9l-2.9 4.2c2 0 3.3 1.5 3.3 3.6 0 2.7-1.8 4.8-4.2 4.8-1.1 0-2-.4-2.6-1.1"/>' },
  'qq.com': { color: '#EF8A00', box: [3.5, 5.5, 20.5, 18.5], paths: '<path d="M6 5.5h12a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 16V8A2.5 2.5 0 0 1 6 5.5z"/><path d="M4.6 7.4 12 13.2l7.4-5.8"/>' },
  'gmail.com': { color: '#EA4335', box: [3.5, 6.2, 20.5, 18.5], paths: '<path d="M3.5 18.5V7.7c0-1.2 1.4-1.9 2.4-1.2L12 11.1l6.1-4.6c1-.7 2.4 0 2.4 1.2v10.8"/><path d="M3.5 18.5h3v-7.7"/><path d="M20.5 18.5h-3v-7.7"/>' },
  'xynu.edu.cn': { color: '#2B7FE8', box: [4.5, 6.5, 19.5, 17.5], paths: '<path d="M10.2 9.6 7.4 6.5H5.6a1.1 1.1 0 0 0-1.1 1.1v8.8a1.1 1.1 0 0 0 1.1 1.1h1.8l2.8-3.1"/><path d="M13.8 9.6l2.8-3.1h1.8a1.1 1.1 0 0 1 1.1 1.1v8.8a1.1 1.1 0 0 1-1.1 1.1h-1.8L10.6 11"/>' },
};
const mailboxBrand = (email) => MAILBOX_BRANDS[email?.split('@')[1]?.toLowerCase()];
// 品牌图形按外框缩放到与文件夹图标相同的 20 单位宽（高不超过 15）并居中，线宽反向补偿，保持 1.8 的视觉粗细
const brandSvg = (brand, size) => {
  const [x0, y0, x1, y1] = brand.box;
  const s = Math.min(20 / (x1 - x0), 15 / (y1 - y0));
  const fit = `translate(12 12) scale(${+s.toFixed(4)}) translate(${-(x0 + x1) / 2} ${-(y0 + y1) / 2})`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${+(1.8 / s).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"><g transform="${fit}">${brand.paths}</g></svg>`;
};
const mailboxIcon = (email) => {
  const brand = mailboxBrand(email);
  if (brand) return `<div class="avatar mailbox-icon mailbox-brand" style="--mailbox-color:${brand.color}" aria-hidden="true">${brandSvg(brand, 22)}</div>`;
  return `<div class="avatar mailbox-icon" style="--mailbox-color:${email ? mailboxColorOf(email) : '#3b7ddd'}" aria-hidden="true">${ic(email ? 'mail' : 'inboxStack', 22)}</div>`;
};

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
  accountsState: 'loading',
  accountsError: false,
  folders: {}, // accId -> folders[]
  status: {}, // accId -> online/offline/error/auth
  hidden: {}, // accId -> folder paths hidden from the sidebar
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
  refreshing: false,
  hasListCache: false,
  localDraft: null,
  selectedKeys: new Set(),
  anchorKey: null,
};
let listToken = 0;
let msgToken = 0;
const folderRefreshTokens = new Map();

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
  if (multi) h += item(null, 'INBOX', '所有收件箱', 'inboxStack', totalUnread());
  for (const a of S.accounts) {
    const folders = S.folders[a.id] || [];
    if (multi) {
      const failed = ['error', 'auth'].includes(S.status[a.id]) ? `<span class="sdot ${S.status[a.id]}" title="${S.status[a.id] === 'auth' ? '登录失败' : '连接出错'}"></span>` : '';
      const brand = mailboxBrand(a.email);
      const logo = brand ? `<span style="color:${brand.color};display:grid">${brandSvg(brand, 17)}</span>` : ic('mail', 15);
      h += `<div class="nav-group nav-account" data-account="${esc(a.id)}" title="${esc(a.email)}"><span class="nav-logo">${logo}${failed}</span><div class="account-label"><div class="account-alias">${esc(accountAlias(a))}</div><div class="account-address">${esc(a.email)}</div></div>${gearButton(a)}</div>`;
    }
    const specials = folders.filter((f) => f.specialUse && !isHidden(a.id, f.path));
    const others = folders.filter((f) => !f.specialUse && !isHidden(a.id, f.path));
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
    const label = S.accountsState === 'ready' ? '尚未添加账户' : S.accountsError ? '账户加载失败，正在重试' : '正在读取本地账户…';
    $('acct-head').innerHTML = `${mailboxIcon()}<div class="meta"><div class="name">Light Mail</div><div class="mail">${label}</div></div>`;
  } else if (a || S.accounts.length === 1) {
    const x = a || first;
    $('acct-head').innerHTML = `${mailboxIcon(x.email)}${gearButton(x)}<div class="meta"><div class="name" title="${esc(accountAlias(x))}">${esc(accountAlias(x))}</div><div class="mail" title="${esc(x.email)}">${esc(x.email)}</div></div>`;
  } else {
    $('acct-head').innerHTML = `${mailboxIcon()}<div class="meta"><div class="name">所有收件箱</div><div class="mail">${S.accounts.length} 个邮箱</div></div>`;
  }
  $('btn-compose').innerHTML = `${ic('pen')}写邮件${S.localDraft ? '<span class="local-draft-badge compose-draft-badge">草稿 1</span>' : ''}`;
  $('btn-search').innerHTML = `${ic('search')}搜索`;
  $('btn-settings').innerHTML = `${ic('settings')}设置`;
  $('btn-unread').innerHTML = ic('filter');
  $('btn-refresh').innerHTML = ic('refresh');
}

function renderSyncStatus() {
  const status = $('sync-status');
  if (S.accountsError || S.accountsState !== 'ready') {
    status.textContent = status.title = S.accountsError ? '账户加载失败，正在自动重试…' : '正在读取本地账户…';
    return;
  }
  const vals = S.accounts.map((a) => S.status[a.id]);
  let t = '已同步';
  if (!S.accounts.length) t = '';
  else if (S.loading || S.refreshing) t = '同步中…';
  else if (vals.includes('auth')) t = '登录失败，请检查密码';
  else if (vals.includes('error')) t = '连接出错，重试中…';
  else if (vals.includes('offline') || vals.includes(undefined)) t = '连接中…';
  else if (S.errors.length) t = '同步未完成';
  status.textContent = status.title = t;
}

// ---------- 列表 ----------
function listTitle() {
  if (isUnified()) return '所有收件箱';
  if (S.sel.path === '@local-drafts') return '草稿';
  return folderMeta(S.sel.accId, S.sel.path)?.label || (S.sel.path === 'INBOX' ? '收件箱' : S.sel.path);
}

function visibleMessages() {
  // Keep a just-read preview or checked row present until the user leaves it.
  return S.unreadOnly ? S.messages.filter((m) => !m.seen || keyOf(m) === S.curKey || S.selectedKeys.has(keyOf(m))) : S.messages;
}

function updateMessageSelection() {
  if (IS_READER_WINDOW) return;
  const selectedCount = selectedMessages().length;
  const bar = $('selection-bar');
  bar.hidden = selectedCount === 0;
  bar.innerHTML = selectedCount ? `<span>已选 ${selectedCount} 封</span><button class="btn" data-act="bulk-read">已读</button><button class="btn" data-act="bulk-move">移动</button><button class="btn" data-act="bulk-trash">删除</button><button class="icon-btn" data-act="clear-selection" title="取消选择">${ic('x')}</button>` : '';
  const messages = new Map(S.messages.map((m) => [keyOf(m), m]));
  const visible = new Set(visibleMessages().map(keyOf));
  for (const row of $('list').querySelectorAll('.row[data-key]')) {
    const key = row.dataset.key;
    if (!visible.has(key)) { row.remove(); continue; }
    row.classList.toggle('current', key === S.curKey);
    row.classList.toggle('sel', S.selectedKeys.has(key));
    row.querySelector('.row-check').checked = S.selectedKeys.has(key);
    const item = messages.get(key);
    if (item) {
      row.classList.toggle('unread', !item.seen);
      const star = row.querySelector('.star');
      if (!item.flagged) star?.remove();
      else if (!star) row.querySelector('.r2').insertAdjacentHTML('beforeend', `<span class="star">${ic('star', 13, true)}</span>`);
    }
  }
}

function renderList() {
  if (IS_READER_WINDOW) return;
  $('list-title').textContent = S.search ? `搜索：${S.search}` : listTitle();
  $('btn-unread').classList.toggle('on', S.unreadOnly);
  const list = $('list');
  if (S.accountsState !== 'ready') {
    list.innerHTML = `<div class="empty">${S.accountsError ? '本地账户加载失败，正在自动重试。<br><br><button class="btn" data-act="retry-accounts">立即重试</button>' : '正在读取本地账户…'}</div>`;
    return;
  }
  const keepScroll = list.scrollTop;
  let h = '';
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
  updateMessageSelection();
  renderNavButtons();
}

async function loadList() {
  if (IS_READER_WINDOW) return;
  if (S.accountsState !== 'ready') { renderList(); return; }
  const token = ++listToken;
  if (S.sel.path === '@local-drafts') {
    S.loading = false;
    S.errors = [];
    S.messages = [];
    renderList();
    renderSyncStatus();
    return;
  }
  S.loading = true;
  S.errors = [];
  renderSyncStatus();
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
  renderSyncStatus();
}

async function refreshFolders(accIds) {
  if (IS_READER_WINDOW) return;
  await Promise.all(
    (accIds || S.accounts.map((a) => a.id)).map(async (id) => {
      const token = (folderRefreshTokens.get(id) || 0) + 1;
      folderRefreshTokens.set(id, token);
      try {
        const folders = await call('folders:list', id);
        if (folderRefreshTokens.get(id) === token) S.folders[id] = folders;
      } catch (e) {
        if (folderRefreshTokens.get(id) === token) S.errors.push(`${accById(id)?.email || ''}：${e.message}`);
      }
    })
  );
  renderNav();
  updateUnreadCount();
}

function updateUnreadCount() {
  if (!IS_READER_WINDOW) call('app:unread', totalUnread());
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
  if (rerender) updateMessageSelection();
}

function openReaderWindow(item = S.cur || S.messages.find((m) => keyOf(m) === S.curKey)) {
  if (item) return guard(() => call('reader:open', { ...item, specialUse: folderMeta(item.accId, item.path)?.specialUse }));
}

async function loadReaderWindow() {
  try {
    const [accounts, item] = await Promise.all([call('accounts:list'), call('reader:init')]);
    S.accounts = accounts;
    S.accountsState = 'ready';
    S.sel = { accId: item.accId, path: item.path };
    if (item.specialUse) S.folders[item.accId] = [{ path: item.path, specialUse: item.specialUse }];
    S.messages = [{ ...item, accEmail: accById(item.accId)?.email || '' }];
    document.title = item.subject + ' — Light Mail';
    await openMessage(S.messages[0]);
  } catch (error) {
    $('read-pane').innerHTML = `<div class="read-empty">无法打开邮件：${esc(error.message)}</div>`;
  }
}

function renderNavButtons() {
  const idx = visibleMessages().findIndex((m) => keyOf(m) === S.curKey);
  const prev = $('read-pane').querySelector('[data-act="prev"]');
  const next = $('read-pane').querySelector('[data-act="next"]');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx < 0 || idx >= visibleMessages().length - 1;
}

async function openMessage(item) {
  if (S.curKey === keyOf(item) && (S.cur || S.loadingMsg)) return;
  const token = ++msgToken;
  S.selectedKeys.clear();
  S.anchorKey = keyOf(item);
  S.curKey = keyOf(item);
  S.cur = null;
  S.loadingMsg = true;
  updateMessageSelection();
  const cached = await call('message:cached', item.accId, item.path, item.uid).catch(() => null);
  if (token !== msgToken) return;
  if (cached) {
    S.cur = cached;
    S.loadingMsg = false;
  }
  renderReader();
  // A cached body never changes; only unread mail needs a server write (mark as read).
  let m = cached;
  if (cached) {
    if (item.seen) return;
    await guard(() => call('message:flag', item.accId, item.path, [item.uid], '\\Seen', true));
  } else m = await guard(() => call('message:get', item.accId, item.path, item.uid));
  if (token !== msgToken) return;
  S.loadingMsg = false;
  if (!m) {
    closeMessage();
    return;
  }
  S.cur = m;
  const row = S.messages.find((x) => keyOf(x) === S.curKey);
  if (row && !row.seen) {
    row.seen = true;
    const f = folderMeta(item.accId, item.path);
    if (f && f.unseen > 0) f.unseen--;
    renderNav();
    updateUnreadCount();
  }
  renderReader();
  updateMessageSelection();
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
      ${IS_READER_WINDOW ? '' : `<button class="icon-btn" data-act="prev" title="上一封 (K)">${ic('left')}</button>
      <button class="icon-btn" data-act="next" title="下一封 (J)">${ic('right')}</button>
      <button class="icon-btn" data-act="popout" title="在独立窗口打开">${ic('popout')}</button>`}
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
  if (S.cur) return runMessageAction(kind, [S.cur]);
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
  if (S.cur) return runMessageAction('unread', [S.cur]);
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

const OAUTH_PROVIDER = { gmail: 'google', outlook: 'microsoft' };
const OAUTH_INFO = {
  google: { label: 'Google', secret: true,
    hint: '需要自己在 Google Cloud 创建“桌面应用”类型的 OAuth 客户端并启用 Gmail API，把客户端 ID 和密钥填在这里。应用要发布为“正式版”，否则授权每 7 天失效。步骤见 docs/oauth.md。' },
  microsoft: { label: 'Microsoft', secret: false,
    hint: '需要自己在 Azure 门户注册应用（支持个人账户，平台选“移动和桌面应用程序”，重定向 URI 填 http://localhost），把应用程序（客户端）ID 填在这里，无需密钥。步骤见 docs/oauth.md。' },
};

function openAccountDialog(existing = null) {
  const root = $('modal-root');
  const opt = (k) => `<option value="${k}">${esc(PRESETS[k].label)}</option>`;
  root.innerHTML = `<div class="overlay"><div class="modal">
    <div class="modal-head"><span>${existing ? '编辑配置 / 授权码' : '添加邮箱'}</span><button class="icon-btn" data-c="cancel">${ic('x')}</button></div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label>邮箱地址</label><input id="a-email" placeholder="you@example.com" autofocus /></div>
        <div class="field"><label>显示名称（发信时的署名）</label><input id="a-name" /></div>
      </div>
      <div class="field"><label>服务商</label><select id="a-preset">${Object.keys(PRESETS).map(opt).join('')}</select></div>
      <div class="field" id="a-method-row" hidden><label>登录方式</label>
        <label class="check"><input type="radio" name="a-method" value="oauth" checked /> 用 <span id="a-oname"></span> 账号登录（推荐）</label>
        <label class="check"><input type="radio" name="a-method" value="pass" /> 用密码 / 授权码</label>
      </div>
      <div class="field" id="a-oauth" hidden>
        <label>OAuth 客户端 ID</label><input id="a-cid" autocomplete="off" />
        <div id="a-csec-row"><label style="margin-top:6px;display:block">客户端密钥</label><input id="a-csec" type="password" autocomplete="off" /></div>
        <div class="hint" id="a-ohint"></div>
      </div>
      <div class="field" id="a-reauth" hidden><div class="hint" id="a-reauth-hint"></div><div><button class="btn" data-c="reauth">重新登录</button></div></div>
      <div class="field" id="a-passrow"><label>密码 / 授权码</label><input id="a-pass" type="password" /><div class="hint" id="a-hint"></div></div>
      <div id="a-adv" class="field">
        <label>IMAP 服务器（地址 / 端口 / SSL）</label>
        <div class="grid3"><input id="a-ih" /><input id="a-ip" type="number" /><select id="a-is"><option value="1">SSL</option><option value="0">STARTTLS</option></select></div>
        <label style="margin-top:6px">SMTP 服务器（地址 / 端口 / SSL）</label>
        <div class="grid3"><input id="a-sh" /><input id="a-sp" type="number" /><select id="a-ss"><option value="1">SSL</option><option value="0">STARTTLS</option></select></div>
        <label style="margin-top:6px">登录用户名（留空则用邮箱地址）</label><input id="a-user" />
      </div>
    </div>
    <div class="modal-foot"><span class="grow" id="a-msg"></span>
      <button class="btn" data-c="cancel">取消</button><button class="btn primary" data-c="save">${existing ? '测试并保存' : '连接并添加'}</button></div>
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
  if (existing) {
    applyPreset(DOMAIN_PRESET[existing.email.split('@')[1]?.toLowerCase()] || 'custom');
    q('a-email').value = existing.email;
    q('a-email').disabled = true;
    q('a-name').value = existing.name || '';
    q('a-user').value = existing.user && existing.user !== existing.email ? existing.user : '';
    q('a-pass').placeholder = '留空则保留原授权码';
    [q('a-ih').value, q('a-ip').value, q('a-is').value] = [existing.imap.host, existing.imap.port, existing.imap.secure ? '1' : '0'];
    [q('a-sh').value, q('a-sp').value, q('a-ss').value] = [existing.smtp.host, existing.smtp.port, existing.smtp.secure ? '1' : '0'];
  }
  // OAuth：Gmail / Outlook 可选；已有的 OAuth 账户只能重新登录。
  let oauthCfg = {};
  const providerOf = () => OAUTH_PROVIDER[preset];
  const isOauth = () => (existing ? existing.authType === 'oauth' : !!providerOf() && root.querySelector('[name="a-method"]:checked').value === 'oauth');
  const refreshMode = () => {
    const prov = providerOf();
    const oauth = isOauth();
    q('a-method-row').hidden = !!existing || !prov;
    if (prov) q('a-oname').textContent = OAUTH_INFO[prov].label;
    q('a-oauth').hidden = !oauth || !!existing;
    q('a-reauth').hidden = !(existing && oauth);
    q('a-passrow').hidden = oauth;
    q('a-adv').hidden = oauth;
    if (existing && oauth) q('a-reauth-hint').textContent = `此账户通过 ${OAUTH_INFO[existing.provider]?.label || ''} 登录，无需密码。登录失效时可在这里重新登录。`;
    if (oauth && !existing) {
      const info = OAUTH_INFO[prov];
      q('a-csec-row').hidden = !info.secret;
      q('a-ohint').textContent = info.hint;
      q('a-cid').value = oauthCfg[prov]?.clientId || '';
      q('a-csec').value = oauthCfg[prov]?.clientSecret || '';
    }
    const save = root.querySelector('[data-c="save"]');
    save.textContent = existing ? '测试并保存' : oauth ? '在浏览器中登录' : '连接并添加';
  };
  call('settings:get', true).then((s) => { oauthCfg = s.oauth || {}; refreshMode(); }).catch(() => {});
  root.querySelectorAll('[name="a-method"]').forEach((r) => r.addEventListener('change', refreshMode));
  q('a-preset').onchange = (e) => { applyPreset(e.target.value); refreshMode(); };
  q('a-email').oninput = (e) => {
    const k = DOMAIN_PRESET[e.target.value.split('@')[1]?.toLowerCase()];
    if (k && k !== preset) { applyPreset(k); refreshMode(); }
  };
  refreshMode();
  root.querySelector('.overlay').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'cancel') {
      call('oauth:cancel').catch(() => {});
      root.innerHTML = '';
    }
    if (act === 'reauth') {
      q('a-msg').textContent = '请在浏览器中完成登录…';
      try {
        await call('accounts:reauth', existing.id);
        root.innerHTML = '';
        await loadAccounts();
        toast('已重新登录 ' + existing.email);
      } catch (err) {
        q('a-msg').textContent = '登录失败：' + err.message;
      }
      return;
    }
    if (act !== 'save') return;
    if (!existing && isOauth()) {
      const prov = providerOf();
      const clientId = q('a-cid').value.trim();
      if (!clientId) {
        q('a-msg').textContent = '请先填写 OAuth 客户端 ID';
        return;
      }
      const btn = e.target.closest('[data-c]');
      btn.disabled = true;
      q('a-msg').textContent = '请在浏览器中完成登录（可点取消放弃）…';
      try {
        await call('settings:set', { oauth: { ...oauthCfg, [prov]: { clientId, clientSecret: q('a-csec').value.trim() } } });
        const r = await call('accounts:add-oauth', prov, { name: q('a-name').value.trim(), hint: q('a-email').value.trim() });
        root.innerHTML = '';
        await loadAccounts();
        if (!r.smtpOk) toast('已添加，但发信服务器验证失败：' + r.smtpError, true);
        else toast('已添加 ' + r.email);
      } catch (err) {
        if (!root.innerHTML) return; // 已取消
        btn.disabled = false;
        q('a-msg').textContent = '登录失败：' + err.message;
      }
      return;
    }
    const email = q('a-email').value.trim();
    const pass = q('a-pass').value;
    if (!email || (!pass && !existing) || !q('a-ih').value || !q('a-sh').value) {
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
      saveSent: existing && 'saveSent' in existing ? existing.saveSent : PRESETS[preset].saveSent,
    };
    try {
      if (existing) {
        const r = await call('accounts:update', existing.id, draft);
        root.innerHTML = '';
        await loadAccounts();
        if (!r.smtpOk) toast('已保存，但发信服务器验证失败：' + r.smtpError, true);
        else toast('已保存 ' + email);
        return;
      }
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

const isHidden = (accId, path) => path.toUpperCase() !== 'INBOX' && (S.hidden[accId] || []).includes(path);
const gearButton = (a) => `<button class="acct-gear" data-gear="${esc(a.id)}" title="邮箱设置" aria-label="${esc(accountAlias(a))} 的设置">${ic('settings', 15)}</button>`;

async function saveHidden(accId, paths) {
  const next = { ...S.hidden, [accId]: [...new Set(paths)] };
  await call('settings:set', { hiddenFolders: next });
  S.hidden = next;
  renderNav();
}

async function showAccountMenu(accId) {
  const a = accById(accId);
  if (!a) return;
  const index = S.accounts.indexOf(a);
  const action = await call('menu:show', [
    { id: 'edit', label: '编辑配置 / 授权码…' },
    { id: 'folders', label: '管理文件夹…' },
    { id: 'rename', label: '重命名…' },
    { type: 'separator' },
    { id: 'up', label: '上移', enabled: index > 0 },
    { id: 'down', label: '下移', enabled: index < S.accounts.length - 1 },
    { type: 'separator' },
    { id: 'remove', label: '移除本机账户…' },
  ]);
  if (action === 'edit') return openAccountDialog(a);
  if (action === 'folders') return openFolderManager(accId);
  if (action === 'rename') {
    const name = await inputDialog('重命名邮箱', '邮箱名称', accountAlias(a));
    if (name === null) return;
    a.alias = await call('accounts:alias', accId, name.trim());
    renderHead(); renderNav();
    return;
  }
  if (action === 'up' || action === 'down') {
    const next = index + (action === 'up' ? -1 : 1);
    const ordered = [...S.accounts];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    await call('settings:set', { accountOrder: ordered.map((x) => x.id) });
    S.accounts = ordered;
    renderHead(); renderNav();
    return;
  }
  if (action === 'remove' && confirm(`移除 ${a.email}？只会删除本机保存的登录信息，不影响邮箱里的邮件。`)) {
    await call('accounts:remove', accId);
    if (S.sel.accId === accId) S.sel = { accId: null, path: 'INBOX' };
    await loadAccounts();
  }
}

async function openFolderManager(accId) {
  const a = accById(accId);
  if (!a) return;
  if (!(S.folders[accId] || []).length) await refreshFolders([accId]);
  const root = $('modal-root');
  const folders = S.folders[accId] || [];
  const custom = (f) => !f.specialUse && f.path.toUpperCase() !== 'INBOX';
  const rows = folders.map((f) => {
    const inbox = f.path.toUpperCase() === 'INBOX';
    const toggle = inbox ? '<span class="folder-fixed">固定显示</span>'
      : `<label class="switch" title="在侧栏显示"><input type="checkbox" data-show="${esc(f.path)}" ${isHidden(accId, f.path) ? '' : 'checked'}/><span></span></label>`;
    const tools = custom(f) ? `<button class="btn small" data-fa="rename" data-path="${esc(f.path)}">重命名</button><button class="btn small" data-fa="move" data-path="${esc(f.path)}">移动</button><button class="btn small danger" data-fa="remove" data-path="${esc(f.path)}">删除</button>` : '';
    return `<div class="folder-row" style="padding-left:${f.depth ? f.depth * 16 : 0}px">${ic(inbox ? 'inbox' : SPECIAL_ICON[f.specialUse] || 'folder', 16)}<span class="grow" title="${esc(f.path)}">${esc(f.label)}</span>${tools}${toggle}</div>`;
  }).join('') || '<div class="empty">暂无文件夹</div>';
  root.innerHTML = `<div class="overlay"><div class="modal folder-modal">
    <div class="modal-head"><span>${esc(accountAlias(a))} · 文件夹</span><button class="icon-btn" data-fc="close">${ic('x')}</button></div>
    <div class="modal-body"><div class="hint">关闭开关后，该文件夹不在侧栏显示；服务器上的邮件不受影响。</div><div class="folder-list">${rows}</div></div>
    <div class="modal-foot"><button class="btn" data-fc="create">${ic('plus', 15)} 新建文件夹</button><span class="grow"></span><button class="btn primary" data-fc="close">完成</button></div>
  </div></div>`;
  const overlay = root.querySelector('.overlay');
  overlay.addEventListener('change', (e) => {
    const box = e.target.closest('[data-show]');
    if (!box) return;
    const path = box.dataset.show;
    const hidden = (S.hidden[accId] || []).filter((p) => p !== path);
    if (!box.checked) hidden.push(path);
    guard(() => saveHidden(accId, hidden));
  });
  overlay.addEventListener('click', async (e) => {
    const close = e.target.closest('[data-fc]')?.dataset.fc;
    if (close === 'close') { root.innerHTML = ''; return; }
    const action = close === 'create' ? 'create' : e.target.closest('[data-fa]')?.dataset.fa;
    if (!action) return;
    const path = e.target.closest('[data-path]')?.dataset.path || '';
    const meta = folders.find((f) => f.path === path);
    try {
      if (action === 'remove') {
        if (!confirm(`删除空文件夹“${meta.label}”？只能删除没有邮件的文件夹。`)) return;
        await call('folder:edit', accId, 'remove', path, '');
        if (isHidden(accId, path)) await saveHidden(accId, S.hidden[accId].filter((p) => p !== path));
        if (S.sel.accId === accId && S.sel.path === path) S.sel.path = 'INBOX';
      } else if (action === 'move') {
        const delimiter = meta.delimiter || '/';
        const options = [{ value: '', label: '邮箱根目录' }, ...folders.filter((f) => f.path !== path && !f.path.startsWith(path + delimiter)).map((f) => ({ value: f.path, label: f.path }))];
        const parent = await inputDialog('移动文件夹', '选择父文件夹', '', options);
        if (parent === null) return openFolderManager(accId);
        const destination = await call('folder:edit', accId, 'move', path, parent);
        await renameHidden(accId, path, destination);
      } else {
        const name = await inputDialog(action === 'rename' ? '重命名文件夹' : '新建文件夹', '文件夹名称', action === 'rename' ? meta.name : '');
        if (name === null) return openFolderManager(accId);
        const destination = await call('folder:edit', accId, action, action === 'rename' ? path : '', name);
        if (action === 'rename') await renameHidden(accId, path, destination);
      }
      await refreshFolders([accId]);
      await loadList();
    } catch (err) { toast(err.message, true); }
    openFolderManager(accId);
  });
}

async function renameHidden(accId, from, to) {
  if (S.sel.accId === accId && S.sel.path === from) S.sel.path = to;
  if (!isHidden(accId, from)) return;
  await saveHidden(accId, S.hidden[accId].map((p) => (p === from ? to : p)));
}

async function openSettings() {
  const st = await guard(() => call('settings:get'));
  if (!st) return;
  const root = $('modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal settings-modal">
    <div class="modal-head"><span>设置</span><button class="icon-btn" data-c="cancel">${ic('x')}</button></div>
    <div class="modal-body">
      <button class="btn" data-c="add">${ic('plus', 15)} 添加邮箱</button>
      <label class="check"><input type="checkbox" id="s-auto" ${st.autoStart ? 'checked' : ''}/> 开机自启动</label>
      <label class="check"><input type="checkbox" id="s-tray" ${st.closeToTray ? 'checked' : ''}/> 关闭窗口时最小化到托盘</label>
      <img class="settings-icon" src="../../assets/icon.png" width="48" height="48" alt="Light Mail" />
      <div class="settings-version" id="s-version">Light Mail</div>
    </div>
  </div></div>`;
  call('app:version').then((v) => { if ($('s-version')) $('s-version').textContent = 'Light Mail ' + v; }).catch(() => {});
  root.querySelector('.overlay').addEventListener('click', (e) => {
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'add') openAccountDialog();
    if (act === 'cancel') root.innerHTML = '';
  });
  $('s-auto').onchange = (e) => guard(() => call('settings:set', { autoStart: e.target.checked }));
  $('s-tray').onchange = (e) => guard(() => call('settings:set', { closeToTray: e.target.checked }));
}

let accountRetryTimer;
let accountRetryDelay = 500;
let accountLoading = false;
async function loadAccounts() {
  if (accountLoading) return;
  accountLoading = true;
  clearTimeout(accountRetryTimer);
  try {
    const accounts = await call('accounts:list');
    S.accounts = accounts;
    S.accountsState = 'ready';
    S.accountsError = false;
    accountRetryDelay = 500;
  } catch {
    S.accountsError = true;
    // Keep any previously loaded accounts. Failed reads never mean zero accounts.
    renderHead(); renderList(); renderSyncStatus();
    call('startup:diagnostic', 'accounts').catch(() => {});
    accountLoading = false;
    accountRetryTimer = setTimeout(loadAccounts, accountRetryDelay);
    accountRetryDelay = Math.min(accountRetryDelay * 2, 30000);
    return;
  }
  try {
  if (S.sel.accId && !accById(S.sel.accId)) S.sel = { accId: null, path: 'INBOX' };
  if (S.accounts.length === 1) S.sel = { accId: S.accounts[0].id, path: S.sel.path };
  S.loading = S.accounts.length > 0;
  renderHead(); renderNav(); renderList(); renderSyncStatus();
  // Account display and cached mail do not depend on optional startup settings/draft.
  const sync = IS_COMPOSE_WINDOW ? Promise.resolve() : Promise.all([refreshFolders(), loadList()]);
  const optional = (name, stage, fallback, ...args) => call(name, ...args).catch(() => {
    call('startup:diagnostic', stage).catch(() => {});
    return fallback;
  });
  const [settings, draft] = await Promise.all([
    optional('settings:get', 'settings', {}, true), optional('draft:get', 'draft', null),
  ]);
  S.localDraft = draft;
  S.hidden = settings.hiddenFolders && typeof settings.hiddenFolders === 'object' ? settings.hiddenFolders : {};
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
  await sync;
  } finally { accountLoading = false; }
}

// ---------- 事件 ----------
if (IS_COMPOSE_WINDOW) {
  document.body.classList.add('compose-window');
  guard(loadAccounts);
} else {
$('nav').addEventListener('click', (e) => {
  const gear = e.target.closest('[data-gear]');
  if (gear) return guard(() => showAccountMenu(gear.dataset.gear));
  const it = e.target.closest('.nav-item');
  if (it) select(it.dataset.acc || null, it.dataset.path);
});
$('acct-head').addEventListener('click', (e) => {
  const gear = e.target.closest('[data-gear]');
  if (gear) guard(() => showAccountMenu(gear.dataset.gear));
});
$('nav').addEventListener('contextmenu', (event) => guard(() => showFolderMenu(event)));
$('list').addEventListener('contextmenu', (event) => guard(() => showMessageMenu(event)));
$('selection-bar').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'clear-selection') { S.selectedKeys.clear(); updateMessageSelection(); }
  else if (act?.startsWith('bulk-')) runMessageAction(act.slice(5), selectedMessages());
});

$('list').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'retry-accounts') return loadAccounts();
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
    const checkbox = e.target.matches('.row-check');
    const toggle = e.ctrlKey || e.metaKey || checkbox;
    if (!toggle && !e.shiftKey) {
      S.selectedKeys.clear();
      S.anchorKey = keyOf(m);
      openMessage(m);
      updateMessageSelection();
    } else selectMessage(m, toggle, e.shiftKey, !checkbox);
  }
});
$('list').addEventListener('dblclick', (e) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.target.closest('input,button,[data-act]')) return;
  const row = e.target.closest('.row[data-key]');
  const item = row && S.messages.find((m) => keyOf(m) === row.dataset.key);
  if (item) openReaderWindow(item);
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
    case 'close': return IS_READER_WINDOW ? window.close() : closeMessage();
    case 'popout': return openReaderWindow();
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
$('btn-refresh').onclick = async () => {
  if (S.refreshing) return;
  const button = $('btn-refresh');
  S.refreshing = true;
  button.disabled = true;
  button.classList.add('refreshing');
  button.title = '正在刷新邮件…';
  button.setAttribute('aria-busy', 'true');
  renderSyncStatus();
  try {
    await Promise.all([guard(refreshFolders), guard(loadList)]);
  } finally {
    S.refreshing = false;
    button.disabled = false;
    button.classList.remove('refreshing');
    button.title = '刷新';
    button.removeAttribute('aria-busy');
    renderList();
    renderSyncStatus();
  }
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
  if (document.activeElement?.matches('input:not([type="checkbox"]),textarea,select,[contenteditable="true"]') || $('modal-root').innerHTML) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    if (IS_READER_WINDOW) return;
    e.preventDefault(); S.selectedKeys = new Set(visibleMessages().map(keyOf)); updateMessageSelection(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['Delete', '#', 'e', '!', 's', 'u'].includes(e.key)) {
    e.preventDefault();
    const items = actionMessages();
    const action = e.key === 's' ? (items.length && items.every((m) => m.flagged) ? 'unstar' : 'star')
      : { Delete: 'trash', '#': 'trash', e: 'archive', '!': 'junk', u: 'unread' }[e.key];
    return runMessageAction(action, items);
  }
  switch (e.key) {
    case 'j': case 'ArrowDown': e.preventDefault(); return S.curKey ? move(1) : visibleMessages()[0] && openMessage(visibleMessages()[0]);
    case 'k': case 'ArrowUp': e.preventDefault(); return move(-1);
    case 'Escape': if (IS_READER_WINDOW) return window.close(); S.selectedKeys.clear(); S.anchorKey = null; return closeMessage();
    case 'Enter': return openReaderWindow(actionMessages().length === 1 ? actionMessages()[0] : null);
    case 'r': return runMessageAction('reply');
    case 'c': e.preventDefault(); return openCompose();
  }
});

// ---------- 主进程事件 ----------
let changedTimer;
window.api.on('mail:changed', ({ accId }) => {
  if (IS_READER_WINDOW) return;
  clearTimeout(changedTimer);
  changedTimer = setTimeout(() => {
    refreshFolders(accId ? [accId] : undefined);
    if (!S.search && (!accId || isUnified() || S.sel.accId === accId)) loadList();
  }, 600);
});
function applyMessageUpdate(update) {
  const matches = (m) => m && m.accId === update.accId && m.path === update.path && update.uids.includes(m.uid);
  const rows = S.messages.filter(matches);
  let countsChanged = false;
  for (const row of rows) {
    const folder = folderMeta(row.accId, row.path);
    if (folder && update.removed && row.seen === false) {
      folder.unseen = Math.max(0, (folder.unseen || 0) - 1);
      countsChanged = true;
    } else if (folder && !update.removed && typeof update.seen === 'boolean' && row.seen !== update.seen) {
      folder.unseen = Math.max(0, (folder.unseen || 0) + (update.seen ? -1 : 1));
      countsChanged = true;
    }
    if (typeof update.seen === 'boolean') row.seen = update.seen;
    if (typeof update.flagged === 'boolean') row.flagged = update.flagged;
    if (update.removed) S.selectedKeys.delete(keyOf(row));
  }
  const current = S.messages.find((m) => keyOf(m) === S.curKey) || S.cur;
  if (matches(current)) {
    if (update.removed) {
      if (IS_READER_WINDOW) { window.close(); return; }
      closeMessage(false);
    } else if (S.cur && typeof update.flagged === 'boolean') S.cur.flagged = update.flagged;
  }
  if (update.removed) { S.messages = S.messages.filter((m) => !matches(m)); renderList(); }
  else if (S.unreadOnly && update.seen === false) renderList();
  else updateMessageSelection();
  renderReader();
  if (!IS_READER_WINDOW) {
    renderNav();
    updateUnreadCount();
    // Counts belong to the account, even when the changed message is not in this list.
    if (countsChanged || update.removed || (typeof update.seen === 'boolean'
        && (rows.length < new Set(update.uids).size || !folderMeta(update.accId, update.path)))) refreshFolders([update.accId]);
  }
}
window.api.on('message:updated', applyMessageUpdate);
window.api.on('mail:flags', ({ accId, path, uid, seen, flagged }) => applyMessageUpdate({ accId, path, uids: [uid], seen, flagged }));
window.api.on('acct:status', ({ accId, status }) => {
  S.status[accId] = status;
  renderSyncStatus();
  renderNav();
});
window.api.on('mail:open', async ({ accId, path, uid }) => {
  if (IS_READER_WINDOW) return;
  if (!isUnified()) S.sel = { accId, path };
  S.search = '';
  if (uid) {
    const cached = await call('message:cached', accId, path, uid).catch(() => null);
    if (cached) {
      let item = S.messages.find((m) => m.accId === accId && m.path === path && m.uid === uid);
      if (!item) {
        item = { ...cached, accEmail: accById(accId)?.email || '', seen: false, preview: (cached.text || '').slice(0, 140) };
        S.messages.unshift(item);
      }
      openMessage(item);
      loadList();
      return;
    }
  }
  await loadList();
  const m = S.messages.find((x) => x.accId === accId && x.path === path && x.uid === uid);
  if (m) openMessage(m);
});
window.api.on('app:compose', () => openCompose());
window.api.on('draft:changed', async () => {
  if (IS_READER_WINDOW) return;
  const draft = await guard(() => call('draft:get'));
  if (draft === undefined) return;
  updateLocalDraft(draft);
  if (S.sel.path === '@local-drafts' || folderMeta(S.sel.accId, S.sel.path)?.specialUse === '\\Drafts') renderList();
});

// 兜底：每 3 分钟刷新一次（IDLE 掉线时也不会落下）
setInterval(() => {
  if (IS_READER_WINDOW || document.hidden) return;
  refreshFolders();
  if (!S.search) loadList();
}, 180000);

renderHead();
renderReader();
renderList();
renderSyncStatus();
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

if (IS_READER_WINDOW) guard(loadReaderWindow);
else { initPaneResizing(); guard(loadAccounts); }
}
