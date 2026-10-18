const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveDraft(draft) {
    const result = ipcRenderer.sendSync('draft:save', draft);
    if (!result.ok) throw new Error(result.error);
    return true;
  },
  async call(name, ...args) {
    const r = await ipcRenderer.invoke('api', name, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  on(channel, cb) {
    const allowed = ['mail:changed', 'mail:open', 'acct:status', 'app:compose', 'draft:changed'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => cb(payload));
  },
});
