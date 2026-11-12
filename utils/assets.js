/**
 * Front-end asset helpers (speed):
 *  - ensureTailwindBuilt(): builds public/css/tailwind.css when a page / JS file is newer than it
 *  - renderIndexHtml(): index.html with every local script / stylesheet stamped "?v=<content hash>",
 *    so browsers can cache those files for a year and still get changes immediately.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const TAILWIND_OUT = path.join(PUBLIC, 'css', 'tailwind.css');
const TAILWIND_IN = path.join(PUBLIC, 'css', 'tailwind.src.css');
const INDEX = path.join(PUBLIC, 'index.html');

function newestMtime(dir, ext) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full, ext));
    else if (entry.name.endsWith(ext)) newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

function ensureTailwindBuilt({ force = false } = {}) {
  try {
    const outTime = fs.existsSync(TAILWIND_OUT) ? fs.statSync(TAILWIND_OUT).mtimeMs : 0;
    const srcTime = Math.max(
      newestMtime(path.join(PUBLIC, 'js'), '.js'),
      fs.statSync(INDEX).mtimeMs,
      fs.statSync(path.join(ROOT, 'tailwind.config.js')).mtimeMs,
      fs.existsSync(TAILWIND_IN) ? fs.statSync(TAILWIND_IN).mtimeMs : 0
    );
    if (!force && outTime >= srcTime) return { built: false };
    const cli = path.join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
    if (!fs.existsSync(cli)) {
      console.warn('⚠️ tailwindcss is not installed (npm install). Using the existing CSS file.');
      return { built: false, error: 'missing tailwindcss' };
    }
    const started = Date.now();
    execFileSync(process.execPath, [cli, '-c', path.join(ROOT, 'tailwind.config.js'), '-i', TAILWIND_IN, '-o', TAILWIND_OUT, '--minify'], { cwd: ROOT, stdio: 'pipe' });
    console.log(`🎨 Tailwind CSS built in ${Date.now() - started} ms (${Math.round(fs.statSync(TAILWIND_OUT).size / 1024)} KB)`);
    hashCache.clear();
    return { built: true };
  } catch (err) {
    console.error('⚠️ Tailwind build failed:', err.message);
    return { built: false, error: err.message };
  }
}

// Content hash per file, refreshed when the file changes (mtime)
const hashCache = new Map();
function fileVersion(urlPath) {
  const file = path.join(PUBLIC, urlPath.replace(/^\//, ''));
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const hit = hashCache.get(file);
    if (hit && hit.mtime === mtime) return hit.v;
    const v = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
    hashCache.set(file, { mtime, v });
    return v;
  } catch (e) {
    return null;
  }
}

let indexCache = { key: '', html: '' };
function renderIndexHtml() {
  let template;
  let mtime;
  try {
    mtime = fs.statSync(INDEX).mtimeMs;
    template = fs.readFileSync(INDEX, 'utf8');
  } catch (e) {
    return '';
  }
  // Stamp every local /js/... and /css/... reference (script tags, link tags and the admin list)
  const stamped = template.replace(/(["'])(\/(?:js|css)\/[^"'?\s]+\.(?:js|css))(?:\?v=[^"']*)?\1/g, (m, q, url) => {
    const v = fileVersion(url);
    return v ? `${q}${url}?v=${v}${q}` : m;
  });
  // Without a built Tailwind file, fall back to the CDN so the site never shows unstyled
  if (!fs.existsSync(TAILWIND_OUT)) {
    return stamped.replace('<!--TAILWIND_FALLBACK-->', '<script src="https://cdn.tailwindcss.com"></script>');
  }
  const key = `${mtime}|${stamped.length}`;
  if (indexCache.key !== key || indexCache.html !== stamped) indexCache = { key, html: stamped };
  return indexCache.html;
}

module.exports = { ensureTailwindBuilt, renderIndexHtml, fileVersion };
