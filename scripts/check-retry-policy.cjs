const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/main/main.js'), 'utf8');
const start = source.indexOf('  let networkWasOnline =');
const end = source.indexOf('  }, 60000);', start) + '  }, 60000);'.length;
assert.ok(start >= 0 && end > start);
let online = true, reconnects = 0, tick;
vm.runInNewContext(source.slice(start, end), {
  net: { isOnline: () => online },
  watchers: new Map([['account', { reconnect() { reconnects++; } }]]),
  setInterval(fn) { tick = fn; },
});
for (let i = 0; i < 10; i++) tick();
assert.equal(reconnects, 0, 'A reachable network with an unavailable IMAP server must respect retry backoff');
online = false; tick(); tick();
assert.equal(reconnects, 0);
online = true; tick(); tick();
assert.equal(reconnects, 1, 'Network recovery should wake each watcher exactly once');
console.log('ok: healthy-network retry backoff, offline ticks, one recovery wake');
