const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');
const scripts = fs.readdirSync(root).filter(file => file.endsWith('.js'));

function policy() {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(meta, 'index.html must set a Content-Security-Policy');
  return Object.fromEntries(meta[1].split(';').map(part => part.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...sources]) => [name, sources]));
}
test('the renderer has a strict Content-Security-Policy', () => {
  const csp = policy();
  assert.deepEqual(csp['default-src'], ["'none'"]);
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.deepEqual(csp['style-src'], ["'self'"]);
  assert.deepEqual(csp['media-src'], ['file:']);
  for (const name of ['connect-src', 'object-src', 'frame-src', 'base-uri', 'form-action']) assert.deepEqual(csp[name], ["'none'"], name);
  assert.doesNotMatch(Object.values(csp).flat().join(' '), /unsafe-|\*|https?:|data:/);
});
test('the page works under that policy: no inline scripts, handlers or styles', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, 'inline <script>');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler');
  assert.doesNotMatch(html, /\sstyle\s*=|<style[\s>]/i, 'inline style');
  assert.doesNotMatch(html + read('renderer.js'), /javascript:/i);
  assert.doesNotMatch(read('renderer.js'), /\sstyle=|setAttribute\(\s*['"]style|\beval\(|new Function\(|createObjectURL/, 'renderer must not rely on inline styles or eval');
});
test('every source file compiles', () => {
  assert.ok(scripts.includes('main.js') && scripts.includes('renderer.js'));
  for (const file of scripts) assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), file);
});
test('every file the app loads at run time is included in the packaged app', () => {
  const packaged = new Set(pkg.build.files);
  const needed = new Set([pkg.main, 'package.json']);
  for (const file of scripts.filter(file => file !== 'renderer.js')) for (const [, name] of read(file).matchAll(/require\('\.\/([\w.-]+)'\)/g)) needed.add(path.extname(name) ? name : name + '.js');
  for (const [, , ref] of html.matchAll(/\b(src|href)="([^"#]+)"/g)) if (!/^[a-z]+:/i.test(ref)) needed.add(ref);
  for (const file of needed) { assert.ok(fs.existsSync(path.join(root, file)), `${file} does not exist`); assert.ok(packaged.has(file), `${file} is missing from build.files`); }
  for (const file of packaged) assert.ok(fs.existsSync(path.join(root, file)), `build.files lists ${file} but it does not exist`);
});
test('the Windows download script builds the zip that the release workflow and README describe', () => {
  assert.match(pkg.scripts['dist:win'], /--win zip/);
  assert.deepEqual(pkg.build.win.target, ['zip']);
});
test('the main process allows one instance and keeps the scheduler timers unthrottled', () => {
  const main = read('main.js');
  assert.match(main, /requestSingleInstanceLock\(\)/);
  assert.match(main, /on\('second-instance'/);
  assert.match(main, /backgroundThrottling:\s*false/);
});
