// Backport safe known-folder handling to the pinned electron-builder template.
// https://github.com/electron-userland/electron-builder/issues/8536
// Upstream: packages/app-builder-lib/templates/nsis/multiUser.nsh
const fs = require('fs');
const path = require('path');

module.exports = async function prepareInstaller() {
  const root = path.dirname(require.resolve('app-builder-lib/package.json'));
  const template = path.join(root, 'templates', 'nsis', 'multiUser.nsh');
  const input = fs.readFileSync(template, 'utf8');
  const source = input.replace(/\r\n/g, '\n');
  const original = [
    '      System::Store S',
    '      # Win7 has a per-user programfiles known folder and this can be a non-default location',
    '      System::Call \'SHELL32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1\'',
    '      ${If} $1 == 0',
    '        System::Call \'*$2(&w${NSIS_MAX_STRLEN} .s)\'',
    '        StrCpy $0 $1',
    '        System::Call \'OLE32::CoTaskMemFree(p r2)\'',
    '      ${endif}',
    '      System::Store L',
  ].join('\n');
  const replacement = [
    '      # Light Mail: upstream safe known-folder handling, without System::Store.',
    '      Push $1',
    '      Push $2',
    '      StrCpy $2 0',
    '      System::Call \'SHELL32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1\'',
    '      ${If} $1 == 0',
    '        System::Call \'KERNEL32::lstrcpynW(w .r0, p r2, i ${NSIS_MAX_STRLEN})p\'',
    '      ${endif}',
    '      ${If} $2 != 0',
    '        System::Call \'OLE32::CoTaskMemFree(p r2)\'',
    '      ${endif}',
    '      Pop $2',
    '      Pop $1',
  ].join('\n');
  if (!source.includes(replacement) && source.split(original).length !== 2) {
    throw new Error('NSIS template changed: review the installer compatibility patch before packaging.');
  }
  let output = source.replace(original, replacement);
  const oldParameter = '${StdUtils.GetParameter} $R0 "D" ""';
  const newParameter = '!insertmacro LightMailGetDParameter $R0';
  if (!output.includes(newParameter)) {
    if (output.split(oldParameter).length !== 3) throw new Error('NSIS directory parsing template changed.');
    output = output.split(oldParameter).join(newParameter);
  }
  if (output === source) return;
  fs.writeFileSync(template, input.includes('\r\n') ? output.replace(/\n/g, '\r\n') : output);
  console.log('Applied upstream NSIS known-folder and directory argument fixes.');
};
