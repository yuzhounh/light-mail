// Native Electron startup checks. Run with electron scripts/check-startup-window.js --case=normal|retry|optional.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.resolve(__dirname, '..');
const scenario = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7) || 'normal';
if (!['normal', 'retry', 'optional'].includes(scenario)) throw new Error('Unknown scenario');
const profile = fs.mkdtempSync(path.join(root, 'tmp/native-startup-'));
app.setPath('appData', profile);
const data = path.join(profile, 'my-mail');
fs.mkdirSync(data);
const accounts = ['xynu.edu.cn', 'gmail.com', '163.com', 'qq.com'].map((domain, index) => ({
  id: String(index), email: `example@${domain}`, alias: `Example ${index}`, pass: 'plain:ZXhhbXBsZQ==',
}));
fs.writeFileSync(path.join(data, 'accounts.json'), JSON.stringify(accounts));
const mail = require('../src/main/mail');
mail.listFolders = async () => [{ path: 'INBOX', label: '收件箱', specialUse: '\\Inbox', unseen: 0 }];
mail.listMessages = async () => ({ messages: [], total: 0 });
const filename = path.join(root, 'src/main/main.js');
let source = fs.readFileSync(filename, 'utf8').replace('show: !smokeOutput,', 'show: false,');
if (scenario === 'retry') source = source.replace("'accounts:list': () => {", "'accounts:list': () => { if (!global.startupInjectedFailure) { global.startupInjectedFailure = true; throw Object.assign(new Error('Injected read error'), {code:'EBUSY'}); }");
if (scenario === 'optional') {
  source = source.replace("'settings:get': (localOnly = false) => {", "'settings:get': (localOnly = false) => { if (localOnly) throw new Error('Injected optional settings error');");
  source = source.replace("'draft:get': () => store.getDraft(),", "'draft:get': () => { throw new Error('Injected optional draft error'); },");
}
const report = path.join(root, `tmp/native-startup-${scenario}.json`);
source = source.replace('  await createWindow();', `  await createWindow();
  let observed;
  for (let attempt=0; attempt<40; attempt++) {
    observed = await win.webContents.executeJavaScript("({accounts:S.accounts.length,state:S.accountsState,rows:document.querySelectorAll('.nav-account').length,incorrectEmpty:document.getElementById('acct-head').textContent.includes('尚未添加账户')})");
    if (observed.accounts === 4 && observed.rows === 4) break;
    if (observed.incorrectEmpty) throw new Error('Startup failure presented as missing accounts');
    await new Promise(resolve => setTimeout(resolve,100));
  }
  require('assert/strict').equal(observed.accounts,4);
  require('assert/strict').equal(observed.rows,4);
  fs.writeFileSync(${JSON.stringify(report)},JSON.stringify({...observed,scenario:${JSON.stringify(scenario)},isolated:true},null,2));
  app.exit(0); return;`);
const moduleUnderTest = new Module(filename, module);
moduleUnderTest.filename = filename;
moduleUnderTest.paths = Module._nodeModulePaths(path.dirname(filename));
moduleUnderTest._compile(source, filename);
