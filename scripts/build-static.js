const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE_PATH = (process.env.BASE_PATH || '/mathigon-textbooks').replace(/\/+$/, '');
const OUT_DIR = path.resolve(process.cwd(), process.env.OUT_DIR || 'dist');
const PORTS = [4567, 8080, 5000, 3000];

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
  patchProp(window.HTMLLinkElement && HTMLLinkElement.prototype, 'href');
})();
</script>`;

function rewriteCss(css) {
  return css.replace(/url\(\s*(["']?)\/(?!\/)/g, (m, q) => {
    return `url(${q}${BASE_PATH}/`;
  }).replace(new RegExp(`${BASE_PATH}${BASE_PATH}/`, 'g'), `${BASE_PATH}/`);
}

function rewriteHtml(html) {
  let out = html.replace(/(href|src|data-src|poster|action)=(["'])\/(?!\/)/g, `$1=$2${BASE_PATH}/`);
  out = out.replace(/srcset=(["'])([^"']+)\1/g, (m, q, val) => {
    const rewritten = val.replace(/(^|,\s*)\/(?!\/)/g, `$1${BASE_PATH}/`);
    return `srcset=${q}${rewritten}${q}`;
  });
  out = out.replace(new RegExp(`${BASE_PATH}${BASE_PATH}/`, 'g'), `${BASE_PATH}/`);
  out = rewriteCss(out);
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n${RUNTIME_SHIM}`);
  } else {
    out = `${RUNTIME_SHIM}\n${out}`;
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
      const origin = 'http://' + 'localhost:' + port;
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
        writeOut(routeToFile(norm), rewriteHtml(html));
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
