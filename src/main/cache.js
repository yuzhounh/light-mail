// 邮件缓存独立于账号凭据；文件夹和 UIDVALIDITY 共同限定邮件 UID。
const { app } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const directory = (id, folder) => path.join(app.getPath('userData'), 'mail-cache', hash(id), hash(folder));
const pending = new Map();

async function read(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

function write(file, value) {
  const task = (pending.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(value));
    await fs.rename(file + '.tmp', file);
  });
  pending.set(file, task);
  task.finally(() => { if (pending.get(file) === task) pending.delete(file); }).catch(() => {});
  return task;
}

const listFile = (id, folder) => path.join(directory(id, folder), 'list.json');
const bodyFile = (id, folder, uid) => path.join(directory(id, folder), `body-${hash(uid)}.json`);

async function readList(id, folder, { limit = 50, search = '' } = {}) {
  if (search) return null;
  const saved = await read(listFile(id, folder));
  return saved && Array.isArray(saved.messages) ? { ...saved, messages: saved.messages.slice(0, limit) } : null;
}

async function writeList(id, folder, result, uidValidity, { search = '' } = {}) {
  if (search) return;
  await write(listFile(id, folder), { ...result, uidValidity: String(uidValidity) });
}

async function readBody(id, folder, uid) {
  const [saved, list] = await Promise.all([read(bodyFile(id, folder, uid)), read(listFile(id, folder))]);
  if (!saved || (list && saved.uidValidity !== list.uidValidity)) return null;
  return saved.message || null;
}

async function writeBody(id, folder, uid, message, uidValidity) {
  const file = listFile(id, folder);
  const list = await read(file);
  const validity = String(uidValidity);
  if (!list || list.uidValidity !== validity) {
    // 保留当前服务器的世代标识，旧列表和旧正文不再作为缓存使用。
    await write(file, { uidValidity: validity });
  }
  await write(bodyFile(id, folder, uid), { uidValidity: validity, message });
}

async function updateMessages(id, folder, uids, changes) {
  const ids = new Set([].concat(uids).map(String));
  const file = listFile(id, folder);
  const list = await read(file);
  if (list?.messages) {
    const removed = list.messages.filter((m) => ids.has(String(m.uid))).length;
    list.messages = changes === null ? list.messages.filter((m) => !ids.has(String(m.uid)))
      : list.messages.map((m) => ids.has(String(m.uid)) ? { ...m, ...changes } : m);
    if (changes === null) list.total = Math.max(0, list.total - removed);
    await write(file, list);
  }
  for (const uid of ids) {
    const file = bodyFile(id, folder, uid);
    const body = await read(file);
    if (!body) continue;
    await write(file, changes === null ? null : { ...body, message: { ...body.message, ...changes } });
  }
}

module.exports = { readList, writeList, readBody, writeBody, updateMessages };
