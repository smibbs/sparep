#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getJSFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getJSFiles(full));
    } else if (entry.isFile() && full.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function getExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const named = new Set();
  let hasDefault = false;
  let match;
  const declRegex = /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_]+)/g;
  while ((match = declRegex.exec(content))) {
    named.add(match[1]);
  }
  const listRegex = /export\s*{([^}]+)}/g;
  while ((match = listRegex.exec(content))) {
    const parts = match[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const [local, exported] = p.split(/\s+as\s+/);
      named.add((exported || local).trim());
    }
  }
  if (/export\s+default/.test(content)) {
    hasDefault = true;
  }
  return { named, hasDefault };
}

function parseImportLine(line) {
  line = line.trim();
  const side = line.match(/^import\s+['"](.+)['"]/);
  if (side) {
    return { source: side[1], specifiers: [] };
  }
  const m = line.match(/^import\s+(.+)\s+from\s+['"](.+)['"]/);
  if (!m) return null;
  const spec = m[1].trim();
  const source = m[2].trim();
  const specifiers = [];
  if (spec.startsWith('{')) {
    const names = spec.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    for (const n of names) {
      const [imported] = n.split(/\s+as\s+/);
      specifiers.push({ type: 'named', name: imported });
    }
  } else if (spec.includes('{')) {
    const [def, rest] = spec.split('{');
    if (def.trim()) {
      specifiers.push({ type: 'default' });
    }
    const names = rest.replace('}', '').split(',').map(s => s.trim()).filter(Boolean);
    for (const n of names) {
      const [imported] = n.split(/\s+as\s+/);
      specifiers.push({ type: 'named', name: imported });
    }
  } else if (spec.startsWith('*')) {
    specifiers.push({ type: 'namespace' });
  } else if (spec) {
    specifiers.push({ type: 'default' });
  }
  return { source, specifiers };
}

// Collect import statements using ripgrep
let rgOutput;
try {
  rgOutput = execSync('rg --json "^import" js').toString().trim().split('\n');
} catch (err) {
  console.error('Failed to run ripgrep:', err.message);
  process.exit(1);
}
const imports = new Map();
for (const line of rgOutput) {
  if (!line) continue;
  const obj = JSON.parse(line);
  if (obj.type !== 'match') continue;
  const file = path.resolve(process.cwd(), obj.data.path.text);
  const lineText = obj.data.lines.text;
  const parsed = parseImportLine(lineText);
  if (!parsed) continue;
  if (!imports.has(file)) imports.set(file, []);
  imports.get(file).push(parsed);
}

// Build export map
const jsDir = path.join(process.cwd(), 'js');
const allFiles = getJSFiles(jsDir);
const exportsMap = new Map();
for (const f of allFiles) {
  exportsMap.set(f, getExports(f));
}

let errors = [];
for (const [file, importList] of imports) {
  const dir = path.dirname(file);
  for (const imp of importList) {
    if (!imp.source.startsWith('.')) continue; // external module
    let target = path.resolve(dir, imp.source);
    if (!path.extname(target)) target += '.js';
    if (!exportsMap.has(target)) {
      errors.push(`${path.relative(process.cwd(), file)}: cannot resolve ${imp.source}`);
      continue;
    }
    const exp = exportsMap.get(target);
    for (const spec of imp.specifiers) {
      if (spec.type === 'named') {
        if (!exp.named.has(spec.name)) {
          errors.push(`${path.relative(process.cwd(), file)}: '${spec.name}' not exported from ${imp.source}`);
        }
      } else if (spec.type === 'default') {
        if (!exp.hasDefault) {
          errors.push(`${path.relative(process.cwd(), file)}: default export not found in ${imp.source}`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error('Import audit failed:');
  for (const e of errors) {
    console.error('  ' + e);
  }
  process.exit(1);
} else {
  console.log('All imports verified.');
}
