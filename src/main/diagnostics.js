// Bounded startup diagnostics: counts/stages/error codes only, never mail or credentials.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function recordStartup(stage, error, count) {
  try {
    const directory = app.getPath('userData');
    const file = path.join(directory, 'startup-diagnostics.jsonl');
    const entry = { time: new Date().toISOString(), stage };
    if (error) entry.code = String(error.code || error.name || 'ERROR').slice(0, 80);
    if (Number.isInteger(count)) entry.count = count;
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 65536) {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-100).join('\n') + '\n');
    }
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch { /* Diagnostics must not prevent startup. */ }
}

module.exports = { recordStartup };
