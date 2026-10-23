/* The security review's fixes.

   The tracker page used to carry the backend key in its source, so anyone
   who found the page could read and change every customer. The key lives
   on the phone now, typed once. The lead endpoint has to stay open for the
   public form, so it is capped and slowed instead. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

const tracker = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'index.html'), 'utf8');
ok('the tracker page no longer contains the backend key', !/clpps-8k3v51/.test(tracker));
ok('nor any Google key', !/AIza[0-9A-Za-z_-]{20,}/.test(tracker));
const gs = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8');
ok('code.txt is byte-identical to apps-script.gs', gs === fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'code.txt'), 'utf8'));
ok('the backend reads the key from a script property, with the old key only as the fallback', /getProperty\('TRACKER_KEY'\)/.test(gs) && /LEGACY_PIN/.test(gs) && !/p\.key !== PIN\b/.test(gs));
ok('the backend caps the size of a post and the rate of lead posts', /MAX_POST_BYTES/.test(gs) && /floodGate_\(\)/.test(gs) && /clip_\(l\[h\]/.test(gs));
// the pure helpers, outside Apps Script
const clip = new Function(gs + '\nreturn clip_;')();
ok('a 10,000-character name is cut to 400', clip('x'.repeat(10000), 400).length === 400 && clip('Pat', 400) === 'Pat');
const cfg = fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8');
ok('working files are excluded from the published site', /^\s*- tools$/m.test(cfg) && /^\s*- brand\/pricing\.html$/m.test(cfg) && /^\s*- _tests$/m.test(cfg));
ok('the site still has no file that would turn Jekyll off', !fs.existsSync(path.join(ROOT, '.nojekyll')));

(async () => {
  const b = await launch();

  /* ---- no password on this phone: the tracker asks, and nothing is fetched ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const gets = [];   // every request to the backend, GET url or POST body
    stubNetwork(p, {});
    await p.addInitScript(() => { try { localStorage.removeItem('clpps_key'); } catch (e) {} });
    await p.route('**/script.google.com/**', r => {
      gets.push(r.request().method() === 'GET' ? r.request().url() : String(r.request().postData()));
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: [] }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(800);
    ok('the password screen is shown', await p.$eval('#login', e => getComputedStyle(e).display !== 'none'));
    ok('and no request has gone to the backend', gets.length === 0, String(gets.length));
    await p.fill('#login-key', 'my-new-key'); await p.press('#login-key', 'Enter'); await p.waitForTimeout(600);
    ok('typing it opens the tracker', await p.$eval('#login', e => getComputedStyle(e).display === 'none'));
    ok('the list is fetched with that key, in the body of a POST', gets.some(u => /"action":"list"/.test(u) && /"key":"my-new-key"/.test(u)) && !gets.some(u => /^http/.test(u) && /key=/.test(u)), gets.join(' '));
    ok('and it is remembered on the phone', (await p.evaluate(() => localStorage.getItem('clpps_key'))) === 'my-new-key');
    await p.click('button:has-text("sign out")'); await p.waitForTimeout(200);
    ok('sign out forgets it and asks again', (await p.evaluate(() => localStorage.getItem('clpps_key'))) === null && await p.$eval('#login', e => getComputedStyle(e).display !== 'none'));
    await ctx.close();
  }

  /* ---- a wrong password is refused by the backend and asked for again ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    stubNetwork(p, {});
    await p.addInitScript(() => { try { localStorage.setItem('clpps_key', 'wrong'); } catch (e) {} });
    await p.route('**/script.google.com/**', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:false, error:'bad pin' }) }));
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(800);
    ok('a refused key brings the password screen back with a message', await p.$eval('#login', e => getComputedStyle(e).display !== 'none') && /not accepted/.test(await p.textContent('#login-msg')));
    ok('and the wrong key is dropped from the phone', (await p.evaluate(() => localStorage.getItem('clpps_key'))) === null);
    await ctx.close();
  }

  /* ---- what the public form can put on a staff phone: nothing that runs ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    let ran = false; p.on('dialog', d => { ran = true; d.dismiss(); });
    const gets = [], bodies = [];
    const now = new Date().toISOString();
    const rows = [
      // a manual-pricing reason, a follow-up date, a name, a note, all hostile
      { id:'x1', type:'ENQUIRY', name:'<img src=x onerror="alert(1)">', phone:'6363754342', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', manual:'YES', status:'new',
        crmnotes:'[FU:<img src=x onerror=alert(2)>] [MR:<img src=x onerror=alert(3)>] [QA:w] <script>alert(4)</script>', created: now },
      // an id that would break out of an onclick handler: dropped, not drawn
      { id:"');alert(5);//", type:'ENQUIRY', name:'Bad Id', phone:'6363754343', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: now },
      // a review link that is not a web address
      { id:'cfg1', type:'CONFIG', name:'review_link', notes:'javascript:alert(6)', status:'config', crmnotes:'', created: now },
    ];
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'GET') gets.push(r.request().url());
      else { try { bodies.push(JSON.parse(r.request().postData())); } catch (e) {} }
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', '1'); } catch (e) {} });
    await p.click('#numbersBtn'); await p.waitForTimeout(800);
    ok('nothing injected ran', !ran && errs.length === 0, errs.join('; '));
    ok('no injected image element exists anywhere on the page', (await p.$$('img[src="x"]')).length === 0);
    ok('the hostile name is shown as text', /<img src=x/.test(await p.textContent('#card-x1')));
    ok('the hostile manual-pricing reason is shown as text in Insights', /<img src=x onerror=alert\(3\)>/.test((await p.textContent('#insights')).replace(/\s+/g, ' ')));
    ok('the row with a hostile id is not drawn', (await p.$('[onclick*="alert(5)"]')) === null && !/Bad Id/.test(await p.textContent('#list')));
    ok('a review link that is not https falls back to the default', await p.evaluate(() => reviewLink().indexOf('https://') === 0));
    ok('the list is fetched by POST, so the key is not in any address', gets.length === 0 && bodies.some(b => b.action === 'list' && b.key === 'test-key'), gets.join(' '));
    ok('esc() escapes the single quote', await p.evaluate(() => esc("a'b") === 'a&#39;b'));
    await ctx.close();
  }

  /* ---- the quote-link page shows its address bar as text ---- */
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    let ran = false; p.on('dialog', d => { ran = true; d.dismiss(); });
    stubNetwork(p, {});
    await p.goto(ORIGIN + '/q/#id=abc&n=' + encodeURIComponent('<img src=x onerror=alert(7)>') + '&d=' + encodeURIComponent('<b>2</b>') + '&sv=weekly&a=' + encodeURIComponent('<i>1 Elm</i>') + '&p=85&u=2027-04-01'); await p.waitForTimeout(600);
    ok('nothing ran on the quote page', !ran);
    ok('the dogs and address values are text, not markup', (await p.$$('#q-details b, #q-details i, img[src="x"]')).length === 0 && /<b>2<\/b>/.test(await p.textContent('#q-details')));
    ok('the pixel is not loaded on a page whose address carries a name', (await p.$('script[src*="meta-pixel"]')) === null);
    await p.close();
  }

  /* ---- the public site never asks for a password ---- */
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    stubNetwork(p, {});
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(500);
    ok('the quote page has no login', (await p.$('#login')) === null);
    await p.close();
  }

  await b.close();
  done();
})();
