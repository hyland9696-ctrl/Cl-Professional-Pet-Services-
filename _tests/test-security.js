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
ok('nor any Google key', !/AIza[0-9A-Za-z_-]{20,}/.test(tracker));
ok('the tracker page carries no password of its own any more', !/clpps-8k3v51/.test(tracker) && /var KEY = '';/.test(tracker));
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
    await p.evaluate(() => foldAll(true)); await p.waitForTimeout(150);   // the cards start closed now
    ok('nothing injected ran', !ran && errs.length === 0, errs.join('; '));
    ok('no injected image element exists anywhere on the page', (await p.$$('img[src="x"]')).length === 0);
    ok('the hostile name is shown as text', /<img src=x/.test(await p.textContent('#card-x1')));
    ok('the hostile manual-pricing reason is shown as text in Insights', /<img src=x onerror=alert\(3\)>/.test((await p.textContent('#insights')).replace(/\s+/g, ' ')));
    ok('the row with a hostile id is not drawn', (await p.$('[onclick*="alert(5)"]')) === null && !/Bad Id/.test(await p.textContent('#list')));
    ok('a review link that is not https falls back to the default', await p.evaluate(() => reviewLink().indexOf('https://') === 0));
    ok('the list is fetched by POST, so the key is not in any address', gets.length === 0 && bodies.some(b => b.action === 'list' && b.key), gets.join(' '));
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

  /* ---- the password gate: typed once per phone, checked by the script ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:900 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { try { sessionStorage.setItem('gate-test', '1'); } catch (e) {} });   // a phone that has never typed it
    const posts = [];
    const rows = [{ id:'g1', type:'ENQUIRY', name:'Gated Gwen', phone:'6363754342', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: new Date().toISOString() }];
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      posts.push(body);
      if (body.key !== 'right-one') return r.fulfill({ contentType:'application/json', body: '{"ok":false,"error":"bad pin"}' });
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(800);
    ok('with no password on the phone the gate covers the page and nothing is fetched', await p.isVisible('#gate') && posts.length === 0, String(posts.length));
    await p.fill('#gate-pw', 'wrong'); await p.click('#gate-btn'); await p.waitForTimeout(500);
    ok('a wrong password is refused by the script, and the gate says so', await p.isVisible('#gate') && /did not work/.test(await p.textContent('#gate-err')) && (await p.evaluate(() => localStorage.getItem('clpps_key'))) === null);
    await p.fill('#gate-pw', 'right-one'); await p.press('#gate-pw', 'Enter'); await p.waitForTimeout(1200);
    ok('the right one opens the page, loads the leads and is kept on the phone', !(await p.isVisible('#gate')) && /Gated Gwen/.test(await p.textContent('#list')) && (await p.evaluate(() => localStorage.getItem('clpps_key'))) === 'right-one');
    ok('every write from then on carries it', posts.filter(x => x.action === 'list').slice(-1)[0].key === 'right-one');
    await p.reload(); await p.waitForTimeout(1000);
    ok('after a reload it stays open', !(await p.isVisible('#gate')) && /Gated Gwen/.test(await p.textContent('#list')));
    // the password changes in the script: the next load is refused and the gate returns
    await p.route('**/script.google.com/**', r => r.fulfill({ contentType:'application/json', body: '{"ok":false,"error":"bad pin"}' }));
    await p.click('header button:has-text("Refresh")'); await p.waitForTimeout(1000);
    ok('when the script stops accepting it, the phone forgets it and asks again', await p.isVisible('#gate') && (await p.evaluate(() => localStorage.getItem('clpps_key'))) === null);
    await p.unroute('**/script.google.com/**');
    await p.route('**/script.google.com/**', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) }));
    await p.fill('#gate-pw', 'new-one'); await p.click('#gate-btn'); await p.waitForTimeout(1000);
    p.on('dialog', d => d.accept());
    await p.evaluate(() => toggleToolMore(true)); await p.click('#lockBtn'); await p.waitForTimeout(400);
    ok('Lock clears the password and the saved customer list and brings the gate back', await p.isVisible('#gate') && (await p.evaluate(() => localStorage.getItem('clpps_key') === null && localStorage.getItem('clpps_leads') === null)));
    // the script is a version behind: it answers {"ok":false} to a POST list
    // (it has never heard of one) and only knows the older GET with the key
    // in the address. The gate must try that too, like the page does, or it
    // locks everyone out until the script is updated.
    await p.unroute('**/script.google.com/**');
    const gets = [];
    await p.route('**/script.google.com/**', r => {
      const req = r.request();
      if (req.method() === 'POST') return r.fulfill({ contentType:'application/json', body: '{"ok":false}' });
      gets.push(req.url());
      const key = decodeURIComponent((req.url().match(/[?&]key=([^&]*)/) || [])[1] || '');
      if (key !== 'old-script-key') return r.fulfill({ contentType:'application/json', body: '{"ok":false,"error":"bad pin"}' });
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.fill('#gate-pw', 'wrong'); await p.click('#gate-btn'); await p.waitForTimeout(600);
    ok('against an old script a wrong password is still refused, by the GET', await p.isVisible('#gate') && /did not work/.test(await p.textContent('#gate-err')) && gets.length === 1 && /action=list&key=wrong&days=1/.test(gets[0]), gets.join());
    await p.fill('#gate-pw', 'old-script-key'); await p.click('#gate-btn'); await p.waitForTimeout(1200);
    ok('and the right one opens the page through the GET the old script understands', !(await p.isVisible('#gate')) && /Gated Gwen/.test(await p.textContent('#list')) && (await p.evaluate(() => localStorage.getItem('clpps_key'))) === 'old-script-key', await p.textContent('#gate-err'));
    await ctx.close();
  }

  /* ---- a backend that has not been redeployed answers no to a POST list; the page falls back to GET ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const now = new Date().toISOString();
    const rows = [{ id:'g1', type:'ENQUIRY', name:'Get Gloria', phone:'6363754342', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: now },
                  { id:'v1', type:'VIEW', name:'home', zip:'', yard:'s1', service:'Direct', notes:'how=none', created: now }];
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'POST') return r.fulfill({ contentType:'application/json', body: '{"ok":false}' });   // the old script
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    ok('the leads load anyway, by GET', /Get Gloria/.test(await p.textContent('#list')));
    ok('no scary banner', (await p.$eval('#offline', e => getComputedStyle(e).display)) === 'none' && !/999 hours/.test(await p.textContent('#health')));
    await ctx.close();
  }
  /* ---- and when neither way works, the page says so instead of going quiet ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => r.fulfill({ contentType:'application/json', body: '{"ok":false,"error":"nope"}' }));
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    ok('the page says the database would not send the list', /would not send the list \(nope\)/.test(await p.textContent('#offline')));
    ok('and the health line stays quiet rather than inventing hours', (await p.$eval('#health', e => getComputedStyle(e).display)) === 'none');
    await ctx.close();
  }

  await b.close();
  done();
})();
