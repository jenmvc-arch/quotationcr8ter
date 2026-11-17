'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (['dist', 'node_modules', '.git', '.vercel', 'tests', 'scripts', 'src', 'deploy', 'docs'].includes(entry.name)) continue;
  fs.cpSync(path.join(root, entry.name), path.join(output, entry.name), { recursive: true });
}
process.stdout.write('Static demo copied to dist/. This output uses local browser storage only.\n');
