// IMAP / SMTP 逻辑：收信、读信、操作、发信，以及 IDLE 即时监听。
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const cache = require('./cache');

const DOMPurify = createDOMPurify(new JSDOM('').window);

const SPECIAL_LABEL = {
  '\\Inbox': '收件箱',
  '\\Flagged': '已加星标',
  '\\Drafts': '草稿',
  '\\Sent': '已发送',
  '\\All': '所有邮件',
  '\\Archive': '归档',
  '\\Junk': '垃圾邮件',
  '\\Trash': '废纸篓',
  '\\Important': '重要',
};
const SPECIAL_ORDER = ['\\Inbox', '\\Flagged', '\\Drafts', '\\Sent', '\\All', '\\Archive', '\\Important', '\\Junk', '\\Trash'];

function newClient(acc) {
  const client = new ImapFlow({
    host: acc.imap.host,
    port: acc.imap.port,
    secure: acc.imap.secure,
    auth: { user: acc.user, pass: acc.pass },
    logger: false,
    clientInfo: { name: 'Light Mail', version: '0.1.2', vendor: 'personal' },
  });
  client.on('error', () => {});
  return client;
}

// ---------- 操作用的共享连接（每账户一条，断了自动重连） ----------
const ops = new Map();

async function getClient(acc) {
  const e = ops.get(acc.id);
  if (e && (e.client.usable || e.connecting)) return e.connecting || e.client;
  const client = newClient(acc);
  const connecting = client
    .connect()
    .then(() => {
      client.on('close', () => {
        if (ops.get(acc.id)?.client === client) ops.delete(acc.id);
      });
      return client;
    })
    .catch((err) => {
      ops.delete(acc.id);
      throw err;
    });
  ops.set(acc.id, { client, connecting });
  return connecting;
}

async function withMailbox(acc, path, fn, readOnly = false) {
  const client = await getClient(acc);
  const lock = await client.getMailboxLock(path, { readOnly });
  try {
    return await fn(client);
  } finally {
    lock.release();
  }
}

function dropClient(accId) {
  const e = ops.get(accId);
  ops.delete(accId);
  if (e) e.client.close();
}

async function testAccount(acc) {
  const client = newClient(acc);
  try {
    await client.connect();
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
  let smtpOk = true;
  let smtpError = '';
  try {
    await smtpTransport(acc).verify();
  } catch (e) {
    smtpOk = false;
    smtpError = e.message;
  }
  return { smtpOk, smtpError };
}

// ---------- 文件夹 ----------
async function listFolders(acc) {
  const client = await getClient(acc);
  const list = await client.list({ statusQuery: { unseen: true } });
  const folders = list
    .filter((f) => !f.flags.has('\\Noselect') && !f.flags.has('\\NonExistent'))
    .map((f) => ({
      path: f.path,
      name: f.name,
      depth: f.path.split(f.delimiter || '/').length - 1,
      delimiter: f.delimiter || '/',
      specialUse: f.path === 'INBOX' ? '\\Inbox' : f.specialUse || null,
      label: SPECIAL_LABEL[f.path === 'INBOX' ? '\\Inbox' : f.specialUse] || f.name,
      unseen: f.status?.unseen || 0,
    }));
  folders.sort((a, b) => {
    const ia = a.specialUse ? SPECIAL_ORDER.indexOf(a.specialUse) : 99;
    const ib = b.specialUse ? SPECIAL_ORDER.indexOf(b.specialUse) : 99;
    return ia - ib || a.path.localeCompare(b.path);
  });
  return folders;
}

async function findFolder(acc, specialUses) {
  const folders = await listFolders(acc);
  for (const su of specialUses) {
    const f = folders.find((x) => x.specialUse === su);
    if (f) return f.path;
  }
  return null;
}

// ---------- 邮件列表 ----------
const iso = (d) => {
  const t = d ? new Date(d) : null;
  return t && !isNaN(t) ? t.toISOString() : null;
};
const addr = (a) => (a ? { name: a.name || '', address: a.address || '' } : null);

function toItem(acc, path, m, preview = '') {
  const env = m.envelope || {};
  return {
    accId: acc.id,
    accEmail: acc.email,
    path,
    uid: m.uid,
    subject: env.subject || '(无主题)',
    from: addr(env.from?.[0]),
    to: (env.to || []).map(addr),
    date: iso(env.date) || iso(m.internalDate),
    seen: m.flags?.has('\\Seen') ?? true,
    flagged: m.flags?.has('\\Flagged') ?? false,
    preview,
  };
}

function htmlToText(html) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#?\w+;/g, ' ');
}

async function makePreview(source) {
  try {
    const p = await simpleParser(source);
    const text = p.text || (p.html ? htmlToText(p.html) : '');
    return text.replace(/\s+/g, ' ').trim().slice(0, 140);
  } catch {
    return '';
  }
}

async function collect(acc, path, client, range, opts) {
  const raw = [];
  for await (const m of client.fetch(
    range,
    { uid: true, envelope: true, flags: true, internalDate: true, source: { maxLength: 16384 } },
    opts
  )) {
    raw.push(m);
  }
  return Promise.all(raw.map(async (m) => toItem(acc, path, m, m.source ? await makePreview(m.source) : '')));
}

async function listMessages(acc, path, { limit = 50, search = '' } = {}) {
  return withMailbox(
    acc,
    path,
    async (client) => {
      const exists = client.mailbox.exists;
      if (!exists) {
        const result = { messages: [], total: 0 };
        await cache.writeList(acc.id, path, result, client.mailbox.uidValidity, { search }).catch(() => {});
        return result;
      }
      let items;
      if (search) {
        const found = await client.search(
          { or: [{ subject: search }, { from: search }, { to: search }] },
          { uid: true }
        );
        const uids = (found || []).slice(-limit);
        items = uids.length ? await collect(acc, path, client, uids, { uid: true }) : [];
      } else {
        const start = Math.max(1, exists - limit + 1);
        items = await collect(acc, path, client, `${start}:${exists}`, {});
      }
      items.sort((a, b) => new Date(b.date) - new Date(a.date));
      const result = { messages: items, total: exists };
      await cache.writeList(acc.id, path, result, client.mailbox.uidValidity, { search }).catch(() => {});
      return result;
    },
    true
  );
}

// ---------- 读信 ----------
const recent = new Map(); // 最近解析过的邮件（用于保存附件）

function sanitize(html, atts) {
  let out = html;
  for (const a of atts) {
    if (a.cid && a.content) {
      const uri = `data:${a.contentType};base64,${a.content.toString('base64')}`;
      out = out.split(`cid:${a.cid}`).join(uri);
    }
  }
  return DOMPurify.sanitize(out, { ADD_TAGS: ['style'], FORCE_BODY: true, ADD_ATTR: ['target'] });
}

function unsubscribeUrl(parsed) {
  const h = parsed.headers.get('list-unsubscribe');
  const s = typeof h === 'string' ? h : h?.text || '';
  return /<(https?:\/\/[^>]+)>/i.exec(s)?.[1] || null;
}

async function getMessage(acc, path, uid) {
  const { source, flags, uidValidity } = await withMailbox(acc, path, async (client) => {
    const m = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
    if (!m) throw new Error('邮件不存在，可能已被移动或删除');
    if (!m.flags.has('\\Seen')) {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    }
    return { ...m, uidValidity: String(client.mailbox.uidValidity) };
  });
  const message = await cacheFetchedMessage(acc, path, uid, source, flags, uidValidity);
  await cache.updateMessages(acc.id, path, uid, { seen: true }).catch(() => {});
  return message;
}

// 批量预取复用解析和缓存，不执行已读标记或其他服务器写入。
async function cacheFetchedMessage(acc, path, uid, source, flags, uidValidity) {
  const parsed = await simpleParser(source);
  const html = sanitize(parsed.html || parsed.textAsHtml || '', parsed.attachments);
  const attachments = parsed.attachments
    .map((a, i) => ({ id: i, a }))
    .filter(({ a }) => !(a.related && a.cid))
    .map(({ id, a }) => ({ id, filename: a.filename || '未命名', size: a.size, contentType: a.contentType }));
  const key = `${acc.id}|${path}|${uid}`;
  recent.set(key, parsed.attachments);
  if (recent.size > 5) recent.delete(recent.keys().next().value);
  const list = (v) => (v?.value || []).map(addr);
  const message = {
    accId: acc.id,
    path,
    uid,
    subject: parsed.subject || '(无主题)',
    from: addr(parsed.from?.value?.[0]),
    to: list(parsed.to),
    cc: list(parsed.cc),
    replyTo: addr(parsed.replyTo?.value?.[0]),
    date: iso(parsed.date),
    flagged: flags.has('\\Flagged'),
    messageId: parsed.messageId || null,
    references: [].concat(parsed.references || []),
    html,
    text: parsed.text || '',
    hasRemote: /(src|background|srcset)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i.test(html),
    unsubscribe: unsubscribeUrl(parsed),
    attachments,
  };
  await cache.writeBody(acc.id, path, uid, message, uidValidity).catch(() => {});
  return message;
}

async function getAttachment(acc, path, uid, attId) {
  const key = `${acc.id}|${path}|${uid}`;
  let atts = recent.get(key);
  if (!atts) {
    await getMessage(acc, path, uid);
    atts = recent.get(key);
  }
  const att = atts?.[Number(attId)];
  if (!att) throw new Error('找不到附件');
  return { filename: att.filename || '附件', content: att.content };
}

// ---------- 邮件操作 ----------
async function setFlag(acc, path, uids, flag, add) {
  return withMailbox(acc, path, async (client) => {
    const range = [].concat(uids).join(',');
    if (add) await client.messageFlagsAdd(range, [flag], { uid: true });
    else await client.messageFlagsRemove(range, [flag], { uid: true });
    const field = flag === '\\Seen' ? 'seen' : flag === '\\Flagged' ? 'flagged' : null;
    if (field) await cache.updateMessages(acc.id, path, uids, { [field]: add }).catch(() => {});
    return true;
  });
}

async function moveTo(acc, path, uids, kind, allowPermanent = false) {
  const dest = await findFolder(acc, kind === 'archive' ? ['\\Archive', '\\All'] : kind === 'junk' ? ['\\Junk'] : ['\\Trash']);
  const range = [].concat(uids).join(',');
  const folders = await listFolders(acc);
  const cur = folders.find((f) => f.path === path);
  return withMailbox(acc, path, async (client) => {
    if (kind === 'trash' && cur?.specialUse === '\\Trash') {
      if (!allowPermanent) throw new Error('永久删除需要明确确认');
      await client.messageDelete(range, { uid: true });
    } else if (!dest) {
      throw new Error(kind === 'archive' ? '这个账户没有归档文件夹' : kind === 'trash' ? '这个账户没有废纸篓，未删除邮件' : '这个账户没有垃圾邮件文件夹');
    } else {
      await client.messageMove(range, dest, { uid: true });
    }
    await cache.updateMessages(acc.id, path, uids, null).catch(() => {});
    return true;
  });
}

async function moveMessages(acc, folder, uids, destination) {
  if (folder === destination) throw new Error('目标文件夹与原文件夹相同');
  const folders = await listFolders(acc);
  if (!folders.some((f) => f.path === destination)) throw new Error('目标文件夹不存在');
  return withMailbox(acc, folder, async (client) => {
    await client.messageMove([].concat(uids).join(','), destination, { uid: true });
    await cache.updateMessages(acc.id, folder, uids, null).catch(() => {});
    return true;
  });
}

async function markFolderRead(acc, folder) {
  return withMailbox(acc, folder, async (client) => {
    if (client.mailbox.exists) await client.messageFlagsAdd('1:*', ['\\Seen']);
    const saved = await cache.readList(acc.id, folder, { limit: Number.MAX_SAFE_INTEGER });
    if (saved) await cache.updateMessages(acc.id, folder, saved.messages.map((m) => m.uid), { seen: true }).catch(() => {});
    return true;
  });
}

async function editFolder(acc, operation, folder, value) {
  const client = await getClient(acc);
  const folders = await client.list();
  const current = folders.find((f) => f.path === folder);
  if (operation !== 'create' && (!current || current.specialUse || folder.toUpperCase() === 'INBOX')) {
    throw new Error('只能重命名或移动自建文件夹');
  }
  const delimiter = current?.delimiter || folders.find((f) => f.delimiter)?.delimiter || '/';
  const name = String(value || '').trim();
  let destination;
  if (operation === 'move') {
    if (value && !folders.some((f) => f.path === value)) throw new Error('目标文件夹不存在');
    if (value === folder || value.startsWith(folder + delimiter)) throw new Error('不能移动到自身或子文件夹');
    destination = value ? value + delimiter + current.name : current.name;
  } else {
    if (!name || name.includes(delimiter) || /[\r\n\0]/.test(name)) throw new Error('请输入有效的单级文件夹名称');
    if (operation === 'create') {
      if (folder && !current) throw new Error('父文件夹不存在');
      destination = folder ? folder + delimiter + name : name;
    } else if (operation === 'rename') {
      const parent = folder.includes(delimiter) ? folder.slice(0, folder.lastIndexOf(delimiter)) : '';
      destination = parent ? parent + delimiter + name : name;
    } else throw new Error('不支持的文件夹操作');
  }
  if (destination === folder) return destination;
  if (folders.some((f) => f.path === destination)) throw new Error('目标位置已有同名文件夹');
  if (operation === 'create') await client.mailboxCreate(destination);
  else await client.mailboxRename(folder, destination);
  return destination;
}

// ---------- 发信 ----------
function smtpTransport(acc) {
  return nodemailer.createTransport({
    host: acc.smtp.host,
    port: acc.smtp.port,
    secure: acc.smtp.secure,
    auth: { user: acc.user, pass: acc.pass },
  });
}

async function sendMessage(acc, p) {
  const domain = acc.email.split('@')[1] || 'localhost';
  const mail = {
    from: { name: acc.name || '', address: acc.email },
    to: p.to,
    cc: p.cc || undefined,
    bcc: p.bcc || undefined,
    subject: p.subject,
    text: p.text,
    inReplyTo: p.inReplyTo || undefined,
    references: p.references?.length ? p.references : undefined,
    attachments: (p.attachments || []).map((f) => ({ path: f })),
    messageId: `<${crypto.randomUUID()}@${domain}>`,
  };
  await smtpTransport(acc).sendMail(mail);
  if (acc.saveSent !== false) {
    try {
      const sent = await findFolder(acc, ['\\Sent']);
      if (sent) {
        const raw = await new MailComposer(mail).compile().build();
        const client = await getClient(acc);
        await client.append(sent, raw, ['\\Seen']);
      }
    } catch {
      // 保存到已发送失败不影响发送结果
    }
  }
  return true;
}

// ---------- IDLE 监听 ----------
// 每个账户一条独立连接，选中 INBOX 后 imapflow 会自动进入 IDLE，服务器推送新邮件即时触发回调。
function startWatcher(acc, hooks, lastUidStart) {
  const w = { stopped: false, client: null, wake: null };

  (async () => {
    let delay = 5000;
    let lastUid = lastUidStart;
    while (!w.stopped) {
      const client = newClient(acc);
      w.client = client;
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        delay = 5000;
        hooks.status(acc.id, 'online', '');
        let busy = false;
        let again = false;

        const check = async (notify) => {
          if (busy) {
            again = true;
            return;
          }
          busy = true;
          try {
            do {
              again = false;
              if (lastUid == null) {
                lastUid = client.mailbox.uidNext - 1;
                hooks.saveUid(acc.id, lastUid);
                continue;
              }
              const found = ((await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || []).filter(
                (u) => u > lastUid
              );
              if (!found.length) continue;
              const fresh = [];
              for await (const m of client.fetch(found, { uid: true, envelope: true, flags: true }, { uid: true })) {
                fresh.push(toItem(acc, 'INBOX', m));
              }
              lastUid = Math.max(lastUid, ...found);
              hooks.saveUid(acc.id, lastUid);
              hooks.changed(acc.id);
              const unseen = fresh.filter((m) => !m.seen);
              if (notify && unseen.length) hooks.newMail(acc, unseen);
            } while (again);
          } catch {
            // 下次事件再试
          } finally {
            busy = false;
          }
        };

        client.on('exists', () => check(true));
        client.on('expunge', () => hooks.changed(acc.id));
        client.on('flags', () => hooks.changed(acc.id));
        await check(true); // 应用关闭期间到达的邮件
        await new Promise((resolve) => {
          w.wake = resolve;
          client.once('close', resolve);
        });
        try {
          lock.release();
        } catch {
          // 连接已断开
        }
      } catch (e) {
        hooks.status(acc.id, e.authenticationFailed ? 'auth' : 'error', e.message);
        if (e.authenticationFailed) delay = 60000;
      }
      hooks.status(acc.id, 'offline', '');
      if (w.stopped) break;
      await new Promise((r) => {
        const t = setTimeout(r, delay);
        w.wake = () => {
          clearTimeout(t);
          r();
        };
      });
      delay = Math.min(delay * 2, 300000);
    }
  })();

  return {
    stop() {
      w.stopped = true;
      w.wake?.();
      w.client?.close();
    },
    // 唤醒后立即重连（系统从睡眠恢复、网络恢复时用）
    reconnect() {
      if (w.client && !w.client.usable) w.wake?.();
    },
  };
}

module.exports = {
  testAccount,
  listFolders,
  listMessages,
  getMessage,
  cacheFetchedMessage,
  getAttachment,
  setFlag,
  moveTo,
  moveMessages,
  markFolderRead,
  editFolder,
  sendMessage,
  startWatcher,
  dropClient,
};
