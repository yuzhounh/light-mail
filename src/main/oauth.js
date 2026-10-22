// Google / Microsoft OAuth 2.0 登录（授权码 + PKCE，本机回环地址接收回调）。
// 客户端 ID 由用户在自己的 Google Cloud / Azure 里注册后填入设置；刷新令牌加密存在账户的 pass 字段里。
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store');

const PROVIDERS = {
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://mail.google.com/ openid email profile',
    authParams: { access_type: 'offline', prompt: 'consent' },
    redirectHost: '127.0.0.1',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  },
  microsoft: {
    label: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access openid email profile',
    authParams: { prompt: 'select_account' },
    redirectHost: 'localhost', // 微软要求与注册的 http://localhost 一致
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
  },
};

const LOGIN_TIMEOUT = 5 * 60 * 1000;
const b64url = (buf) => buf.toString('base64url');

function clientOf(provider) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('不支持的登录方式');
  const cfg = store.getSettings().oauth?.[provider] || {};
  if (!cfg.clientId) throw new Error(`请先填写 ${p.label} 的 OAuth 客户端 ID`);
  return { p, clientId: cfg.clientId.trim(), clientSecret: (cfg.clientSecret || '').trim() };
}

async function postToken(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error_description?.split('\r')[0] || data.error || `令牌请求失败（${res.status}）`);
    err.oauthError = data.error;
    // 刷新令牌失效/被撤销：需要重新登录
    err.authenticationFailed = ['invalid_grant', 'interaction_required', 'invalid_client', 'unauthorized_client'].includes(data.error);
    throw err;
  }
  return data;
}

function decodeIdToken(idToken) {
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

// ---------- 浏览器登录 ----------
let pending = null;

function cancelLogin() {
  pending?.cancel(new Error('已取消登录'));
}

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>Light Mail</title><body style="font:16px system-ui,'Microsoft YaHei UI';display:grid;place-items:center;height:100vh;margin:0;background:#f4f5f7;color:#1c1f24"><div style="text-align:center"><h2>${title}</h2><p style="color:#7b828c">${body}</p></div></body>`;

async function authorize(provider, loginHint) {
  const { p, clientId, clientSecret } = clientOf(provider);
  cancelLogin();
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const servers = [];
  let settle;
  const result = new Promise((resolve, reject) => (settle = { resolve, reject }));
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/') {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get('error');
    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page('登录未完成', '可以关闭此页面，回到 Light Mail 重试。'));
      settle.reject(new Error(url.searchParams.get('error_description') || error));
    } else if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
      res.writeHead(400).end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page('登录成功', '可以关闭此页面，回到 Light Mail。'));
      settle.resolve(url.searchParams.get('code'));
    }
  };

  const first = http.createServer(handler);
  await new Promise((resolve, reject) => first.once('error', reject).listen(0, '127.0.0.1', resolve));
  servers.push(first);
  const port = first.address().port;
  // localhost 可能解析到 ::1，所以同一端口再监听一次 IPv6 回环（失败则忽略）
  const second = http.createServer(handler);
  await new Promise((resolve) => second.once('error', resolve).listen(port, '::1', resolve));
  if (second.listening) servers.push(second);

  const redirectUri = `http://${p.redirectHost}:${port}`;
  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: p.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...p.authParams,
  };
  if (loginHint) params.login_hint = loginHint;

  const timer = setTimeout(() => settle.reject(new Error('登录超时，请重试')), LOGIN_TIMEOUT);
  pending = { cancel: (e) => settle.reject(e) };
  try {
    await shell.openExternal(`${p.authUrl}?${new URLSearchParams(params)}`);
    const code = await result;
    const t = await postToken(p.tokenUrl, {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    if (!t.refresh_token) throw new Error('没有拿到长期授权（refresh token），请重试');
    const claims = decodeIdToken(t.id_token || '');
    const email = (claims.email || claims.preferred_username || '').toLowerCase();
    if (!email) throw new Error('无法从登录结果中读取邮箱地址');
    return {
      email,
      name: claims.name || '',
      refreshToken: t.refresh_token,
      accessToken: t.access_token,
      expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
    };
  } finally {
    clearTimeout(timer);
    pending = null;
    for (const s of servers) s.close();
  }
}

// ---------- 访问令牌（内存缓存，到期前自动刷新） ----------
const tokens = new Map(); // accId -> { accessToken, expiresAt }
const inflight = new Map();

function seedToken(accId, login) {
  tokens.set(accId, { accessToken: login.accessToken, expiresAt: login.expiresAt });
}

function forgetToken(accId) {
  tokens.delete(accId);
}

async function refresh(acc) {
  const { p, clientId, clientSecret } = clientOf(acc.provider);
  let refreshToken = acc.pass;
  try {
    refreshToken = store.getAccount(acc.id).pass; // 取最新的（微软会轮换刷新令牌）
  } catch {
    // 账户还没保存（添加流程中），用传入的
  }
  const t = await postToken(p.tokenUrl, {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    ...(acc.provider === 'microsoft' ? { scope: p.scope } : {}),
  });
  if (t.refresh_token && t.refresh_token !== refreshToken) {
    try {
      store.saveAccount({ ...store.getAccount(acc.id), pass: t.refresh_token });
    } catch {
      // 保存失败时旧令牌仍可用，下次再试
    }
  }
  const entry = { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 };
  tokens.set(acc.id, entry);
  return entry;
}

async function getAccessToken(acc) {
  const cached = tokens.get(acc.id);
  if (cached && cached.expiresAt - Date.now() > 60000) return cached.accessToken;
  if (!inflight.has(acc.id)) {
    inflight.set(acc.id, refresh(acc).finally(() => inflight.delete(acc.id)));
  }
  try {
    return (await inflight.get(acc.id)).accessToken;
  } catch (e) {
    if (e.authenticationFailed) e.message = `${PROVIDERS[acc.provider]?.label || ''} 登录已失效，请在邮箱设置里重新登录`;
    throw e;
  }
}

module.exports = { PROVIDERS, authorize, cancelLogin, getAccessToken, seedToken, forgetToken };
