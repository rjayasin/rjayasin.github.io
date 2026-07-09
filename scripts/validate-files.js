#!/usr/bin/env node
// Syntax-checks the files passed as arguments: .js via node --check, .json
// via JSON.parse, and the inline <script> blocks of .html files via vm
// compilation. Used by the advisory PR validation workflow: problems are
// printed as GitHub annotations and the exit code is non-zero, but the
// workflow job never gates merges.
const fs = require('fs');
const vm = require('vm');
const { spawnSync } = require('child_process');

let problems = 0;

function report(file, line, message) {
  problems++;
  const loc = line ? `,line=${line}` : '';
  console.log(`::error file=${file}${loc}::${String(message).replace(/\s*\n\s*/g, ' ')}`);
}

function checkJs(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status === 0) return;
  const err = r.stderr || '';
  const lineMatch = err.match(/:(\d+)\r?\n/);
  const msgMatch = err.match(/^\w*Error.*$/m);
  report(file, lineMatch ? Number(lineMatch[1]) : 0, msgMatch ? msgMatch[0] : 'syntax error');
}

function checkJson(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    report(file, 0, e.message);
    return;
  }
  if (/etymology\/game\/trees\/[^/]+\.json$/.test(file.replace(/\\/g, '/'))) {
    checkTreeChunk(file, data);
  }
}

// The etymology game renders language names straight off its cached trees —
// there is no code→name lookup at play time — so every node that names a
// language must carry its display name baked in (the pool script does this;
// see cleanTree in etymology-pool.js). A bare code here would show up
// verbatim on a player's card.
function checkTreeChunk(file, data) {
  for (const [word, tree] of Object.entries(data)) {
    (function walk(n) {
      if (n && typeof n === 'object') {
        if (n.lang && !n.name) {
          report(file, 0, `"${word}": node has language code "${n.lang}" but no baked name`);
        }
        (n.children || []).forEach(walk);
      }
    })(tree);
  }
}

function checkHtml(file) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    // Only classic scripts can be compiled with vm.Script; skip modules
    // and non-JS payloads like JSON-LD.
    const type = /\btype\s*=\s*["']?([\w/+-]+)/i.exec(attrs);
    if (type && !/javascript/i.test(type[1])) continue;
    const offset = src.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1;
    try {
      new vm.Script(m[2], { filename: file, lineOffset: offset });
    } catch (e) {
      const lineMatch = /:(\d+)/.exec(e.stack || '');
      report(file, lineMatch ? Number(lineMatch[1]) : offset + 1, e.message);
    }
  }
}

for (const file of process.argv.slice(2)) {
  if (!fs.existsSync(file)) continue;
  if (file.endsWith('.js')) checkJs(file);
  else if (file.endsWith('.json')) checkJson(file);
  else if (file.endsWith('.html')) checkHtml(file);
}

if (problems) {
  console.error(`${problems} problem(s) found`);
  process.exit(1);
}
