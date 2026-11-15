const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ICON_B64, LOGO_B64 } = require('./brand-assets');

const BASE_PATH = (process.env.BASE_PATH || '/mathigon-textbooks').replace(/\/+$/, '');
const OUT_DIR = path.resolve(process.cwd(), process.env.OUT_DIR || 'dist');
const PORTS = [4567, 8080, 5000, 3000];

const BRAND_CSS = `<style id="clipsat-brand-css">
header #logo svg, header a.logo svg, .clipsat-nav-brand svg { display: none !important; }
header #logo, header a.logo, .clipsat-nav-brand { display: inline-flex !important; align-items: center !important; gap: 10px !important; padding: 0 14px !important; text-decoration: none !important; height: 100% !important; width: auto !important; max-width: none !important; overflow: visible !important; }
.clipsat-nav-icon { width: 30px !important; height: 30px !important; object-fit: contain !important; display: block !important; flex-shrink: 0 !important; margin: 0 !important; }
.clipsat-nav-text { font-size: 17px !important; font-weight: 600 !important; color: #ffffff !important; letter-spacing: -0.01em !important; white-space: nowrap !important; line-height: 1.1 !important; }
.clipsat-nav-text strong { color: #5ad2c8 !important; font-weight: 700 !important; }
.clipsat-nav-text span { color: #ffffff !important; font-weight: 500 !important; }
.clipsat-hero-banner { display: flex; align-items: center; justify-content: center; gap: 22px; padding: 26px 28px; margin: 16px auto 28px; max-width: 820px; background: linear-gradient(135deg, #f4fafd 0%, #eefaf8 100%); border: 1px solid rgba(43, 148, 175, 0.2); border-radius: 16px; box-shadow: 0 6px 24px rgba(19, 68, 90, 0.06); flex-wrap: wrap; text-align: left; }
.clipsat-hero-logo { height: 92px !important; width: auto !important; object-fit: contain !important; flex-shrink: 0; }
.clipsat-hero-heading { margin: 0 0 6px !important; font-size: 30px !important; line-height: 1.15 !important; font-weight: 700 !important; color: #164e63 !important; }
.clipsat-hero-tagline { margin: 0 !important; font-size: 16px !important; color: #3b6978 !important; line-height: 1.45 !important; }
</style>`;

const NAV_BRAND_INNER = `<img class="clipsat-nav-icon" src="${BASE_PATH}/brand/clipsat-icon.png" alt="ClipSAT" width="30" height="30"><span class="clipsat-nav-text"><strong>ClipSAT</strong> <span>Math Explorer</span></span>`;
const NAV_BRAND_LINK = `<a id="logo" class="logo clipsat-nav-brand" href="${BASE_PATH}/" title="ClipSAT Math Explorer">${NAV_BRAND_INNER}</a>`;
const HERO_BANNER_HTML = `<div class="clipsat-hero-banner"><img class="clipsat-hero-logo" src="${BASE_PATH}/brand/clipsat-logo.png" alt="ClipSAT"><div class="clipsat-hero-copy"><h1 class="clipsat-hero-heading">ClipSAT Math Explorer</h1><p class="clipsat-hero-tagline">Interactive mathematics textbooks, visual explorations, and problem-solving labs</p></div></div>`;

const RUNTIME_SHIM = `<script>
(function() {
  var BASE = ${JSON.stringify(BASE_PATH)};
  function prefixUrl(u) {
    if (typeof u !== 'string') return u;
    if (u.startsWith('/') && !u.startsWith('//') && u !== BASE && !u.startsWith(BASE + '/')) {
      return BASE + u;
    }
    return u;
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      var method = (init && init.method) || (input && input.method) || 'GET';
      if (String(method).toUpperCase() === 'POST') {
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (typeof input === 'string') {
        input = prefixUrl(input);
      } else if (input && input.url) {
        try {
          var parsed = new URL(input.url, location.origin);
          if (parsed.origin === location.origin) {
            input = new Request(prefixUrl(parsed.pathname) + parsed.search + parsed.hash, input);
          }
        } catch (e) {}
      }
      return origFetch.call(this, input, init);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._mgonMethod = String(method || 'GET').toUpperCase();
    if (typeof url === 'string') arguments[1] = prefixUrl(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    if (this._mgonMethod === 'POST') {
      var self = this;
      setTimeout(function() {
        try {
          Object.defineProperty(self, 'status', { value: 200 });
          Object.defineProperty(self, 'readyState', { value: 4 });
          Object.defineProperty(self, 'responseText', { value: '{}' });
          if (self.onreadystatechange) self.onreadystatechange();
          if (self.onload) self.onload();
        } catch (e) {}
      }, 0);
      return;
    }
    return origSend.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    navigator.sendBeacon = function() { return true; };
  }
  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if ((name === 'src' || name === 'href' || name === 'xlink:href' || name === 'data-src') && typeof value === 'string') {
      value = prefixUrl(value);
    }
    return origSetAttr.call(this, name, value);
  };
  function patchProp(Proto, prop) {
    var desc = Proto && Object.getOwnPropertyDescriptor(Proto, prop);
    if (desc && desc.set) {
      Object.defineProperty(Proto, prop, {
        get: desc.get,
        set: function(v) { return desc.set.call(this, prefixUrl(v)); },
        configurable: true
      });
    }
  }
  patchProp(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src');
  patchProp(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
  patchProp(window.HTMLLinkElement && window.HTMLLinkElement.prototype, 'href');

  function applyClipSatBrand() {
    if (document.title) {
      document.title = document.title
        .replace(/Mathigon Development Server/gi, 'ClipSAT Math Explorer')
        .replace(/[–|-]\s*Mathigon\b/gi, '– ClipSAT Math Explorer');
      if (document.title.trim() === 'Mathigon') document.title = 'ClipSAT Math Explorer';
    }
    var navLink = document.querySelector('header #logo, header a.logo, header nav a:first-child, header > a:first-child');
    if (navLink && !navLink.classList.contains('clipsat-nav-brand')) {
      navLink.classList.add('clipsat-nav-brand');
      navLink.setAttribute('href', BASE + '/');
      navLink.setAttribute('title', 'ClipSAT Math Explorer');
      navLink.innerHTML = ${JSON.stringify(NAV_BRAND_INNER)};
    }
    var headings = document.querySelectorAll('h1');
    for (var i = 0; i < headings.length; i++) {
      if (/Mathigon Development Server/i.test(headings[i].textContent || '')) {
        var wrap = document.createElement('div');
        wrap.innerHTML = ${JSON.stringify(HERO_BANNER_HTML)};
        headings[i].replaceWith(wrap.firstChild);
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyClipSatBrand);
  } else {
    applyClipSatBrand();
  }
})();
</script>`;

function rewriteCss(css) {
  return css.replace(/url\(\s*(["']?)\/(?!\/)/g, (m, q) => {
    return `url(${q}${BASE_PATH}/`;
  }).replace(new RegExp(`${BASE_PATH}${BASE_PATH}/`, 'g'), `${BASE_PATH}/`);
}

function rewriteHtml(html, norm = '') {
  let out = html.replace(/(href|src|data-src|poster|action)=(["'])\/(?!\/)/g, `$1=$2${BASE_PATH}/`);
  out = out.replace(/srcset=(["'])([^"']+)\1/g, (m, q, val) => {
    const rewritten = val.replace(/(^|,\s*)\/(?!\/)/g, `$1${BASE_PATH}/`);
    return `srcset=${q}${rewritten}${q}`;
  });
  out = out.replace(new RegExp(`${BASE_PATH}${BASE_PATH}/`, 'g'), `${BASE_PATH}/`);
  out = rewriteCss(out);

  if (norm === '/') {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, '<title>ClipSAT Math Explorer – Interactive Mathematics Textbooks</title>');
  } else {
    out = out.replace(/<title>([\s\S]*?)<\/title>/i, (m, t) => {
      const updated = t
        .replace(/Mathigon Development Server/gi, 'ClipSAT Math Explorer')
        .replace(/[–|-]\s*Mathigon\b/gi, '– ClipSAT Math Explorer');
      return `<title>${updated}</title>`;
    });
  }
  out = out.replace(/content=(["'])Mathigon\1/gi, 'content=$1ClipSAT Math Explorer$1');

  out = out.replace(/<header\b([\s\S]*?)<\/header>/i, (headerBlock) => {
    return headerBlock.replace(/<a\b[^>]*(?:\bid=["']logo["']|\bclass=["'][^"']*\blogo\b[^"']*["'])[^>]*>[\s\S]*?<\/a>/i, NAV_BRAND_LINK);
  });

  out = out.replace(/<h1[^>]*>\s*Mathigon Development Server\s*<\/h1>/gi, HERO_BANNER_HTML);
  out = out.replace(/©\s*Mathigon,?\s*\d{4}/gi, '© ClipSAT Math Explorer');

  const headInject = `${BRAND_CSS}\n<link rel="icon" type="image/png" href="${BASE_PATH}/brand/clipsat-icon.png">\n<link rel="shortcut icon" type="image/png" href="${BASE_PATH}/brand/clipsat-icon.png">\n<link rel="apple-touch-icon" href="${BASE_PATH}/brand/clipsat-icon.png">`;
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${headInject}\n</head>`);
  }
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n${RUNTIME_SHIM}`);
  } else {
    out = `${RUNTIME_SHIM}\n${headInject}\n${out}`;
  }
  return out;
}

function extractUrls(text, baseOrigin) {
  const found = new Set();
  const attrRe = /(?:href|src|data-src|poster)=["']([^"'#]+)["']/gi;
  let m;
  while ((m = attrRe.exec(text)) !== null) {
    found.add(m[1]);
  }
  const srcsetRe = /srcset=["']([^"']+)["']/gi;
  while ((m = srcsetRe.exec(text)) !== null) {
    for (const part of m[1].split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u) found.add(u);
    }
  }
  const cssRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = cssRe.exec(text)) !== null) {
    found.add(m[1]);
  }
  const result = [];
  for (const raw of found) {
    if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('javascript:')) continue;
    try {
      const u = new URL(raw, baseOrigin);
      if (u.origin === baseOrigin && u.pathname.startsWith('/')) {
        result.push(u.pathname);
      }
    } catch {}
  }
  return result;
}

function writeOut(relPath, content) {
  const clean = relPath.replace(/^\/+/, '');
  const full = path.join(OUT_DIR, clean);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function routeToFile(pathname) {
  if (pathname === '/' || pathname === '') return 'index.html';
  const ext = path.extname(pathname);
  if (ext) return pathname.replace(/^\/+/, '');
  return path.posix.join(pathname.replace(/^\/+/, ''), 'index.html');
}

async function waitForServer(proc) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`mgon-serve exited early with code ${proc.exitCode}`);
    for (const port of PORTS) {
      const origin = 'http' + '://localhost:' + port;
      try {
        const res = await fetch(`${origin}/`, { redirect: 'manual' });
        if (res.status > 0) return origin;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Timed out waiting for mgon-serve');
}

function copyContentMedia(dir, rel = 'content') {
  if (!fs.existsSync(dir)) return;
  const skipExts = new Set(['.md', '.yaml', '.yml', '.ts', '.scss', '.pug']);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, entry.name);
    const dstRel = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) {
      copyContentMedia(src, dstRel);
    } else if (!skipExts.has(path.extname(entry.name).toLowerCase())) {
      const dst = path.join(OUT_DIR, dstRel);
      if (!fs.existsSync(dst)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
    }
  }
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = spawn('npx', ['mgon-serve'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '4567' }
  });
  server.stdout.on('data', (d) => process.stdout.write(d));
  server.stderr.on('data', (d) => process.stderr.write(d));

  try {
    const baseOrigin = await waitForServer(server);
    console.log(`mgon-serve ready at ${baseOrigin}`);

    const visited = new Set();
    const queue = ['/', '/main.css', '/main.js', '/course.css', '/course.js', '/favicon.ico'];

    while (queue.length > 0) {
      const reqPath = queue.shift();
      const norm = reqPath === '/' ? '/' : reqPath.replace(/\/+$/, '');
      if (visited.has(norm)) continue;
      visited.add(norm);

      let res;
      try {
        res = await fetch(`${baseOrigin}${norm}`, { redirect: 'manual' });
      } catch (err) {
        console.warn(`Fetch failed for ${norm}: ${err.message}`);
        continue;
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (loc) {
          try {
            const target = new URL(loc, baseOrigin);
            if (target.origin === baseOrigin) {
              const targetPath = target.pathname === '/' ? '/' : target.pathname.replace(/\/+$/, '');
              queue.push(targetPath);
              const destUrl = `${BASE_PATH}${targetPath === '/' ? '/' : targetPath}`;
              const redirectHtml = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${destUrl}"><script>location.replace(${JSON.stringify(destUrl)});</script></head><body>Redirecting to <a href="${destUrl}">${destUrl}</a></body></html>`;
              writeOut(routeToFile(norm), redirectHtml);
            }
          } catch {}
        }
        continue;
      }

      if (res.status !== 200) continue;

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        const html = await res.text();
        for (const u of extractUrls(html, baseOrigin)) {
          if (!visited.has(u)) queue.push(u);
        }
        writeOut(routeToFile(norm), rewriteHtml(html, norm));
      } else if (ct.includes('text/css') || norm.endsWith('.css')) {
        const css = await res.text();
        for (const u of extractUrls(css, baseOrigin)) {
          if (!visited.has(u)) queue.push(u);
        }
        writeOut(routeToFile(norm), rewriteCss(css));
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        writeOut(routeToFile(norm), buf);
      }
    }

    copyContentMedia(path.resolve(process.cwd(), 'content'));
    const iconBuf = Buffer.from(ICON_B64, 'base64');
    const logoBuf = Buffer.from(LOGO_B64, 'base64');
    writeOut('brand/clipsat-icon.png', iconBuf);
    writeOut('brand/clipsat-logo.png', logoBuf);
    writeOut('favicon.png', iconBuf);
    writeOut('favicon.ico', iconBuf);
    writeOut('.nojekyll', '');
    console.log(`Static export complete: ${visited.size} routes/assets crawled into ${OUT_DIR}`);
  } finally {
    server.kill('SIGTERM');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
