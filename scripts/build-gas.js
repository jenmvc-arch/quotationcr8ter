'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'gas');
const output = path.join(root, 'deploy', 'gas');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of fs.readdirSync(source)) {
  if (file.endsWith('.gs') || file === 'Index.html' || file === 'appsscript.json') fs.copyFileSync(path.join(source, file), path.join(output, file));
}
process.stdout.write('Apps Script staging shell built in deploy/gas/. No Script ID or production target is configured.\n');
