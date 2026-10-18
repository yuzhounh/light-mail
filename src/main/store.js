// 账户与状态的本地存储。密码用系统凭据（Windows DPAPI）经 Electron safeStorage 加密。
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = (name) => path.join(app.getPath('userData'), name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  const f = file(name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(f + '.tmp', f);
}

function encrypt(text) {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(text).toString('base64');
  }
  return 'plain:' + Buffer.from(text, 'utf8').toString('base64');
}

function decrypt(value) {
  if (value.startsWith('enc:')) {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  }
  return Buffer.from(value.replace(/^plain:/, ''), 'base64').toString('utf8');
}

// 内部使用的完整账户（密码已解密）
function getAccounts() {
  return readJson('accounts.json', []).map((a) => ({ ...a, pass: decrypt(a.pass) }));
}

// 给界面看的账户（不含密码）
function publicAccount(a) {
  const { pass, ...rest } = a;
  return rest;
}

function saveAccount(acc) {
  const list = readJson('accounts.json', []);
  const record = { ...acc, id: acc.id || crypto.randomUUID(), pass: encrypt(acc.pass) };
  const i = list.findIndex((a) => a.id === record.id);
  if (i >= 0) list[i] = record;
  else list.push(record);
  writeJson('accounts.json', list);
  return record.id;
}

function setAccountAlias(id, alias) {
  if (typeof alias !== 'string' || alias.trim().length > 80) throw new Error('邮箱别名最多 80 个字符');
  const list = readJson('accounts.json', []);
  const record = list.find((a) => a.id === id);
  if (!record) throw new Error('账户不存在');
  record.alias = alias.trim();
  writeJson('accounts.json', list);
  return record.alias;
}

function removeAccount(id) {
  writeJson('accounts.json', readJson('accounts.json', []).filter((a) => a.id !== id));
  const st = readJson('state.json', {});
  delete st.lastUid?.[id];
  writeJson('state.json', st);
}

function getState() {
  return readJson('state.json', { lastUid: {}, settings: { closeToTray: true } });
}

function getDraft() {
  return readJson('draft.json', null);
}

function saveDraft(draft) {
  if (!draft || typeof draft.id !== 'string' || typeof draft.accId !== 'string') throw new Error('草稿格式无效');
  const saved = getDraft();
  if (saved && saved.id !== draft.id) throw new Error('已有未完成的草稿，请先继续编辑或放弃');
  const text = (key) => typeof draft[key] === 'string' ? draft[key] : '';
  const record = { id: draft.id, accId: draft.accId, title: text('title'), to: text('to'), cc: text('cc'),
    subject: text('subject'), body: text('body'), inReplyTo: text('inReplyTo'),
    references: [].concat(draft.references || []).filter((v) => typeof v === 'string'),
    attachments: (draft.attachments || []).filter((a) => typeof a.path === 'string').map((a) => ({ path: a.path, name: a.name, size: a.size })),
    updatedAt: new Date().toISOString() };
  writeJson('draft.json', record);
  return true;
}

function clearDraft(id) {
  const saved = getDraft();
  if (!saved || saved.id !== id) return false;
  writeJson('draft.json', null);
  return true;
}

function setLastUid(accId, uid) {
  const st = getState();
  st.lastUid = st.lastUid || {};
  st.lastUid[accId] = uid;
  writeJson('state.json', st);
}

function getSettings() {
  return { closeToTray: true, ...(getState().settings || {}) };
}

function setSettings(patch) {
  const st = getState();
  st.settings = { ...getSettings(), ...patch };
  writeJson('state.json', st);
  return st.settings;
}

module.exports = {
  getAccounts,
  publicAccount,
  saveAccount,
  setAccountAlias,
  removeAccount,
  getState,
  getDraft,
  saveDraft,
  clearDraft,
  setLastUid,
  getSettings,
  setSettings,
};
