#!/usr/bin/env node

// Simple build script that verifies module imports and bundles JS sources
// into a single dist/bundle.js file. Any import/export issues or syntax
// errors will cause the build to fail.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// First, audit imports to catch missing exports or unresolved files
try {
  execSync('node scripts/audit-imports.js', { stdio: 'inherit' });
} catch (err) {
  process.exit(1);
}

const srcDir = path.join(__dirname, '..', 'js');
const outDir = path.join(__dirname, '..', 'dist');

// Ensure fresh dist directory
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Concatenate all JS files into a single bundle
const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith('.js'));

let bundle = '';
for (const file of files) {
  const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
  bundle += `// ${file}\n${content}\n`;
}

const bundlePath = path.join(outDir, 'bundle.js');
fs.writeFileSync(bundlePath, bundle);

// Perform a syntax check on the generated bundle
try {
  execSync(`node --check ${bundlePath}`, { stdio: 'inherit' });
  console.log(`Bundled ${files.length} files into ${bundlePath}`);
} catch (err) {
  process.exit(1);
}

