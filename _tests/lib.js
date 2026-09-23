/* Shared bits every test needs, so no test has to know where anything
   lives on a particular machine. The old suite hard-coded an absolute
   path to one workspace and a Chromium build number; both were wrong the
   moment the machine changed. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:' + (process.env.CLPPS_TEST_PORT || 8731);

/* Find a Chromium without downloading one. Playwright's own lookup works
   when PLAYWRIGHT_BROWSERS_PATH is set, which it is on the build
   machines; the explicit search is the fallback for anywhere else. */
function chromePath() {
  if (process.env.CLPPS_CHROME) return process.env.CLPPS_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
                 path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
  for (const r of roots) {
    let entries = [];
    try { entries = fs.readdirSync(r); } catch (e) { continue; }
    // newest chromium-NNNN first
    const dirs = entries.filter(d => /^chromium(-|_)/.test(d))
                        .sort((a, b) => (parseInt(b.replace(/\D/g, ''), 10) || 0) -
                                        (parseInt(a.replace(/\D/g, ''), 10) || 0));
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(r, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;   // let playwright try, and say so clearly if it cannot
}

async function launch() {
  const { chromium } = require('playwright-core');
  const exe = chromePath();
  try {
    return await chromium.launch(exe ? { executablePath: exe } : {});
  } catch (e) {
    console.error('\nCould not start Chromium.' +
      '\n  Looked in: PLAYWRIGHT_BROWSERS_PATH, /opt/pw-browsers, ~/.cache/ms-playwright' +
      '\n  Set CLPPS_CHROME to a Chromium binary to point it somewhere else.\n');
    throw e;
  }
}

/* Every test reports the same way: one line per promise, the failure
   detail underneath it, a count at the end, and a non-zero exit so a
   runner or a hook can tell. */
function reporter() {
  const fails = [];
  const ok = (name, cond, extra) => {
    console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name +
                (cond || !extra ? '' : '\n      ' + extra));
    if (!cond) fails.push(name);
  };
  const done = () => {
    console.log(fails.length ? '\n' + fails.length + ' FAILURES' : '\nALL PASS');
    process.exit(fails.length ? 1 : 0);
  };
  return { ok, done, fails };
}

// Load one of the site's browser scripts into this process.
function loadSiteScript(name) {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.global = sandbox;
  new Function('window', 'module', 'exports', src +
    '\n;this.__exported = typeof module !== "undefined" ? module.exports : {};'
  ).call(sandbox, sandbox.window, sandbox.module, sandbox.module.exports);
  return sandbox.module.exports;
}

/* The outside world, stubbed. Nothing in these tests may touch the real
   spreadsheet, the real inbox or Facebook. */
function stubNetwork(page, collect) {
  const posts = (collect && collect.posts) || [];
  const mails = (collect && collect.mails) || [];
  page.route('**/script.google.com/**', r => {
    if (r.request().method() === 'POST') {
      try { posts.push(JSON.parse(r.request().postData()).lead); } catch (e) {}
    }
    return r.fulfill({ contentType: 'application/json',
                       body: JSON.stringify({ ok: true, leads: (collect && collect.leads) || [] }) });
  });
  page.route('**/formsubmit.co/**', r => {
    try { mails.push(JSON.parse(r.request().postData())); } catch (e) {}
    return r.fulfill({ contentType: 'application/json', body: '{"success":"true"}' });
  });
  page.route('**/connect.facebook.net/**', r =>
    r.fulfill({ contentType: 'application/javascript', body: 'window.fbq=function(){};' }));
  page.route('**/nominatim**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  return { posts, mails };
}

module.exports = { ROOT, ORIGIN, launch, reporter, loadSiteScript, stubNetwork, chromePath };
