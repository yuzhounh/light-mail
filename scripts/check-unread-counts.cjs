// Reuse the isolated native mail fixture, running only unread-count regressions.
const fs = require('fs');
const path = require('path');
const base = fs.readFileSync(path.join(__dirname, 'check-reader-interactions.cjs'), 'utf8').split('const timeout = setTimeout')[0];
const checks = String.raw`
const timeout = setTimeout(() => { console.error('Unread count checks timed out'); app.exit(1); }, 25000);
const count = () => evaluate(main, "folderMeta('fixture','INBOX').unseen");
app.whenReady().then(async () => {
  main = hiddenWindow({ width: 1500, height: 900, webPreferences: { preload: path.join(root, 'src/main/preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await main.loadFile(path.join(root, 'src/renderer/index.html'));
  await until(() => evaluate(main, "S.messages.length===3 && !S.loading"), 'main ready');
  await click(main, row(1, ' .subj'));
  await until(async () => (await state(main)).body === 1, 'preview ready');
  await click(main, '#read-pane [data-act="popout"]');
  await until(() => !!readerFor(1), 'reader opens');
  const first = readerFor(1);
  await until(async () => (await state(first)).body === 1, 'reader ready');
  await click(first, '[data-act="unread"]');
  await until(async () => (await count())===3, 'unread increments count');
  await click(first, '[data-act="trash"]');
  await until(async () => !readerFor(1) && (await count())===2, 'visible unread deletion decrements count');
  assert.equal((await state(main)).current, null);
  // A repeated removal must not decrement the same unread mail twice.
  update({ accId:'fixture',path:'INBOX',uids:[1],removed:true });
  await sleep(80);
  assert.equal(await count(), 2);

  // Keep the main window on another folder while the reader changes INBOX.
  await evaluate(main, "S.sel={accId:'fixture',path:'Trash'};S.messages=[];closeMessage();renderList()");
  readers.open(mail[1]);
  await until(() => !!readerFor(2), 'off-list reader opens');
  const second = readerFor(2);
  await until(async () => (await state(second)).body===2 && (await count())===1, 'off-list read state sync');
  await click(second, '[data-act="unread"]');
  await until(async () => (await count())===2, 'off-list unread increments count');
  assert.equal(await evaluate(main, 'S.sel.path'), 'Trash');
  assert.equal(await evaluate(main, 'S.messages.length'), 0);
  await click(second, '[data-act="trash"]');
  await until(async () => !readerFor(2) && (await count())===1, 'off-list unread deletion decrements count');
  assert.equal(await evaluate(main, 'S.sel.path'), 'Trash');
  assert.equal(calls.filter(c=>c.name==='folders:list').every(c=>c.args[0]==='fixture'), true);

  // Check the actual refresh function against out-of-order server responses.
  const vm = require('vm');
  const source = fs.readFileSync(path.join(root, 'src/renderer/app.js'),'utf8');
  const refresh = source.slice(source.indexOf('async function refreshFolders('), source.indexOf('function updateUnreadCount('));
  const pending=[];
  const context={S:{accounts:[{id:'fixture'}],folders:{},errors:[]},IS_READER_WINDOW:false,folderRefreshTokens:new Map(),
    call:()=>new Promise(resolve=>pending.push(resolve)),renderNav(){},updateUnreadCount(){},accById:()=>({email:'fixture@example.test'})};
  vm.createContext(context);vm.runInContext(refresh,context);
  const old=context.refreshFolders(['fixture']);const latest=context.refreshFolders(['fixture']);
  pending[1]([{path:'INBOX',unseen:1}]);await latest;
  pending[0]([{path:'INBOX',unseen:3}]);await old;
  assert.equal(context.S.folders.fixture[0].unseen,1,'older refresh must not overwrite latest count');
  // A visible change must not discard the only refresh for an earlier off-list change.
  context.S.folders.fixture=[{path:'INBOX',unseen:2}];
  context.S.messages=[{accId:'fixture',path:'INBOX',uid:2,seen:false}];
  context.S.selectedKeys=new Set();
  context.keyOf=m=>[m.accId,m.path,m.uid].join('|');
  context.folderMeta=()=>context.S.folders.fixture[0];
  context.renderReader=()=>{};context.updateMessageSelection=()=>{};context.renderList=()=>{};
  const handler=source.slice(source.indexOf('function applyMessageUpdate('),source.indexOf("window.api.on('message:updated'"));
  vm.runInContext(handler,context);
  context.applyMessageUpdate({accId:'fixture',path:'INBOX',uids:[99],seen:false});
  context.applyMessageUpdate({accId:'fixture',path:'INBOX',uids:[2],seen:true});
  assert.equal(pending.length,4,'both changes must be covered by a latest count request');
  pending[3]([{path:'INBOX',unseen:2}]);await new Promise(resolve=>setImmediate(resolve));
  pending[2]([{path:'INBOX',unseen:3}]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.S.folders.fixture[0].unseen,2,'off-list update survives a following visible change');
  assert.deepEqual(errors,[]);
  const result={passed:true,visibleDeletion:true,duplicateRemoval:true,offListUnread:true,offListDeletion:true,viewPreserved:true,staleRefreshIgnored:true,overlappingChangesPreserved:true};
  fs.writeFileSync(path.join(root,'tmp/unread-count-check.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error.stack);clearTimeout(timeout);app.exit(1)});
`;
module._compile(base + checks, __filename);
