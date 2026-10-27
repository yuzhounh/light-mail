// 邮件选择、批量操作与文件夹菜单；由 app.js 提供当前视图和 IPC。
let messageActionBusy = false;

function selectedMessages() {
  return visibleMessages().filter((m) => S.selectedKeys.has(keyOf(m)));
}

function actionMessages() {
  if (S.selectedKeys.size) return selectedMessages();
  const current = S.messages.find((m) => keyOf(m) === S.curKey) || S.cur;
  return current ? [current] : [];
}

function selectMessage(item, toggle = false, extend = false, includePreview = true) {
  const key = keyOf(item);
  if (extend && S.anchorKey) {
    const rows = visibleMessages();
    const start = rows.findIndex((m) => keyOf(m) === S.anchorKey);
    const end = rows.findIndex((m) => keyOf(m) === key);
    if (start >= 0 && end >= 0) {
      S.selectedKeys = new Set(rows.slice(Math.min(start, end), Math.max(start, end) + 1).map(keyOf));
      updateMessageSelection();
      return;
    }
  }
  if (toggle) {
    if (includePreview && !S.selectedKeys.size && S.curKey && S.curKey !== key) S.selectedKeys.add(S.curKey);
    if (S.selectedKeys.has(key)) S.selectedKeys.delete(key);
    else S.selectedKeys.add(key);
  } else S.selectedKeys.clear();
  S.anchorKey = key;
  updateMessageSelection();
}

function inputDialog(title, label, value = '', options = null) {
  return new Promise((resolve) => {
    const root = $('modal-root');
    root.innerHTML = `<div class="overlay"><form class="modal"><div class="modal-head"><span>${esc(title)}</span><button type="button" class="icon-btn" data-cancel>${ic('x')}</button></div><div class="modal-body"><div class="field"><label for="action-value">${esc(label)}</label>${options ? `<select id="action-value">${options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>` : `<input id="action-value" value="${esc(value)}" />`}</div></div><div class="modal-foot"><button type="button" class="btn" data-cancel>取消</button><button class="btn primary" type="submit">确定</button></div></form></div>`;
    const finish = (result) => { root.innerHTML = ''; resolve(result); };
    const form = root.querySelector('form');
    form.addEventListener('submit', (event) => { event.preventDefault(); finish($('action-value').value); });
    form.addEventListener('click', (event) => { if (event.target.closest('[data-cancel]')) finish(null); });
    form.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); finish(null); } });
    $('action-value').focus();
  });
}

async function runMessageAction(action, items = actionMessages()) {
  if (!items.length || messageActionBusy) return;
  if (['reply', 'replyAll', 'forward', 'open', 'open-window'].includes(action)) {
    if (items.length !== 1) return;
    if (action === 'open') return openMessage(items[0]);
    if (action === 'open-window') return openReaderWindow(items[0]);
    const item = items[0];
    const detail = await guard(async () => (await call('message:cached', item.accId, item.path, item.uid)) || call('message:get', item.accId, item.path, item.uid));
    if (detail) return action === 'forward' ? forwardMsg(detail) : replyTo(action === 'replyAll', detail);
    return;
  }
  if (action === 'trash') {
    const missing = [...new Set(items.filter((m) => !folderMeta(m.accId, m.path)).map((m) => m.accId))];
    try { await Promise.all(missing.map(async (id) => { S.folders[id] = await call('folders:list', id); })); }
    catch (error) { toast(error.message, true); return; }
  }
  const permanent = items.filter((m) => folderMeta(m.accId, m.path)?.specialUse === '\\Trash');
  if (action === 'trash' && permanent.length && !confirm(`将永久删除废纸篓中选中的 ${permanent.length} 封邮件，无法恢复。是否继续？`)) return;
  messageActionBusy = true;
  try {
    const groups = new Map();
    for (const item of items) {
      const key = JSON.stringify([item.accId, item.path]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const destinations = new Map();
    if (action === 'move') {
      for (const accId of new Set(items.map((m) => m.accId))) {
        if (!S.folders[accId]?.length) await refreshFolders([accId]);
        const sources = new Set(items.filter((m) => m.accId === accId).map((m) => m.path));
        const options = (S.folders[accId] || []).filter((f) => !sources.has(f.path)).map((f) => ({ value: f.path, label: f.specialUse ? f.label : f.path }));
        if (!options.length) throw new Error('没有可用的目标文件夹');
        const destination = await inputDialog('移动邮件', `${accById(accId)?.email}：选择目标文件夹`, '', options);
        if (destination === null) return;
        destinations.set(accId, destination);
      }
    }
    const failures = [];
    let completed = 0;
    const flag = { read: ['\\Seen', true], unread: ['\\Seen', false], star: ['\\Flagged', true], unstar: ['\\Flagged', false] }[action];
    for (const group of groups.values()) {
      const first = group[0];
      const keys = new Set(group.map(keyOf));
      try {
        const uids = group.map((m) => m.uid);
        if (flag) await call('message:flag', first.accId, first.path, uids, ...flag);
        else if (action === 'move') await call('messages:move-to', first.accId, first.path, uids, destinations.get(first.accId));
        else if (['archive', 'junk', 'trash'].includes(action)) await call('message:move', first.accId, first.path, uids, action, action === 'trash' && group.every((m) => folderMeta(m.accId, m.path)?.specialUse === '\\Trash'));
        else throw new Error('不支持的操作');
        if (flag) {
          const field = flag[0] === '\\Seen' ? 'seen' : 'flagged';
          for (const item of S.messages) if (keys.has(keyOf(item))) item[field] = flag[1];
          if (S.cur && keys.has(S.curKey) && field === 'flagged') { S.cur.flagged = flag[1]; renderReader(); }
        } else {
          S.messages = S.messages.filter((m) => !keys.has(keyOf(m)));
          if (keys.has(S.curKey)) closeMessage(false);
        }
        keys.forEach((key) => S.selectedKeys.delete(key));
        completed += group.length;
      } catch (err) { failures.push(`${accById(first.accId)?.email}：${err.message}`); }
    }
    renderList();
    toast(failures.length ? `已处理 ${completed} 封；${failures.join('；')}` : `已处理 ${completed} 封邮件`, failures.length > 0);
    if (!IS_READER_WINDOW) await Promise.all([refreshFolders([...new Set(items.map((m) => m.accId))]), loadList()]);
  } catch (err) { toast(err.message, true); }
  finally { messageActionBusy = false; }
}

async function showMessageMenu(event) {
  event.preventDefault();
  if (event.target.closest('[data-act="edit-draft"]')) {
    if (await call('menu:show', [{ id: 'edit', label: '继续编辑本地草稿' }]) === 'edit') openCompose();
    return;
  }
  const row = event.target.closest('[data-key]');
  if (row && !S.selectedKeys.has(row.dataset.key)) {
    S.selectedKeys = new Set([row.dataset.key]); S.anchorKey = row.dataset.key; updateMessageSelection();
  }
  const items = selectedMessages();
  const menu = [];
  if (items.length) {
    if (items.length === 1) menu.push({ id: 'open', label: '预览' }, { id: 'open-window', label: '在独立窗口打开' }, { id: 'reply', label: '回复' }, { id: 'replyAll', label: '回复全部' }, { id: 'forward', label: '转发' }, { type: 'separator' });
    menu.push({ id: 'read', label: '标为已读' }, { id: 'unread', label: '标为未读' }, { id: 'star', label: '添加星标' }, { id: 'unstar', label: '取消星标' },
      { type: 'separator' }, { id: 'archive', label: '归档' }, { id: 'move', label: '移动到…' }, { id: 'junk', label: '移到垃圾邮件' },
      { id: 'trash', label: items.every((m) => folderMeta(m.accId, m.path)?.specialUse === '\\Trash') ? '永久删除…' : '删除（移到废纸篓）' }, { type: 'separator' });
  }
  menu.push({ id: 'select-all', label: '全选当前已加载邮件', enabled: visibleMessages().length > 0 }, { id: 'clear', label: '取消选择', enabled: items.length > 0 }, { id: 'refresh', label: '刷新' });
  const action = await call('menu:show', menu);
  if (action === 'select-all') { S.selectedKeys = new Set(visibleMessages().map(keyOf)); updateMessageSelection(); }
  else if (action === 'clear') { S.selectedKeys.clear(); updateMessageSelection(); }
  else if (action === 'refresh') { refreshFolders(); loadList(); }
  else if (action) await runMessageAction(action, items);
}

async function showFolderMenu(event) {
  const row = event.target.closest('.nav-item, .nav-scope');
  const account = event.target.closest('[data-account]');
  if (!row && !account) return;
  event.preventDefault();
  const accId = row?.dataset.acc || account?.dataset.account;
  const folder = row?.dataset.path;
  const meta = folderMeta(accId, folder);
  const remote = accId && folder && !folder.startsWith('@');
  const custom = remote && meta && !meta.specialUse && folder.toUpperCase() !== 'INBOX';
  const menu = [{ id: 'refresh', label: '刷新' }];
  if (remote || !accId || folder === '@all') menu.push({ id: 'read', label: '全部标为已读' });
  if (accId) menu.push({ id: 'create', label: remote ? '新建子文件夹…' : '新建文件夹…' });
  if (custom) menu.push({ type: 'separator' }, { id: 'rename', label: '重命名…' }, { id: 'move', label: '移动文件夹到…' });
  const action = await call('menu:show', menu);
  if (!action) return;
  try {
    if (action === 'refresh') { await refreshFolders(accId ? [accId] : undefined); await loadList(); return; }
    if (action === 'read') {
      const targets = scopeTargets({ accId: accId || null, path: folder || '@all' });
      for (const t of targets) await call('folder:read', t.accId, t.path);
      if (S.sel.accId === accId && S.sel.path === folder) S.messages.forEach((m) => { m.seen = true; });
    } else if (action === 'move') {
      const delimiter = meta.delimiter || '/';
      const options = [{ value: '', label: '邮箱根目录' }, ...(S.folders[accId] || []).filter((f) => f.path !== folder && !f.path.startsWith(folder + delimiter)).map((f) => ({ value: f.path, label: f.path }))];
      const parent = await inputDialog('移动文件夹', '选择父文件夹', '', options);
      if (parent === null) return;
      const destination = await call('folder:edit', accId, 'move', folder, parent);
      if (S.sel.accId === accId && (S.sel.path === folder || S.sel.path.startsWith(folder + delimiter))) S.sel.path = destination + S.sel.path.slice(folder.length);
    } else {
      const name = await inputDialog(action === 'rename' ? '重命名文件夹' : '新建文件夹', '文件夹名称', action === 'rename' ? meta.name : '');
      if (name === null) return;
      const destination = await call('folder:edit', accId, action, remote ? folder : '', name);
      const delimiter = meta?.delimiter || '/';
      if (action === 'rename' && S.sel.accId === accId && (S.sel.path === folder || S.sel.path.startsWith(folder + delimiter))) S.sel.path = destination + S.sel.path.slice(folder.length);
    }
    await refreshFolders([accId]);
    await loadList();
  } catch (err) { toast(err.message, true); }
}
