/* The Google rating and review count on the website.

   Corey: "the Google review point on the website is not the live total."
   It was typed into sixteen files. Now every page reads it from the
   backend, which is set in the tracker (or by Google itself if a key is
   ever added). These check the whole chain: backend answer, page display,
   structured data, the fallback when the backend is not there, and the
   tracker control that sets it. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

/* ---- the backend, with fake Google services ---- */
function loadScript(rows){
  const store = rows.slice(), cache = {};
  const HEAD = ['id','created','type','name','phone','email','address','zip','service','dogs','yard','deodorize','hero','price','manual','honored','notes','status','crmnotes','updated'];
  if (!store.length) store.push(HEAD);
  const sh = { getLastRow: () => store.length, appendRow: r => store.push(r), getDataRange: () => ({ getValues: () => store }),
               getRange: () => ({ setValue(){}, setNumberFormat(){} }), getMaxRows: () => 1000 };
  const ctx = {
    MailApp: { sendEmail(){} }, Utilities: { sleep(){} }, Logger: { log(){} },
    SpreadsheetApp: { create: () => ({ getId: () => 'x', getSheets: () => [sh] }), openById: () => ({ getSheets: () => [sh] }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet', setProperty(){} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => ({ body: t }) }) },
    console,
  };
  const src = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8');
  const api = new Function(...Object.keys(ctx), src + '\n;return { doGet, doPost, HEADERS };')(...Object.values(ctx));
  return { api, store, cache, HEAD };
}
const row = (HEAD, o) => HEAD.map(h => o[h] || '');

{
  const { api } = loadScript([]);
  const out = JSON.parse(api.doGet({ parameter: { action: 'public' } }).body);
  // the answer is always ok now, because the deodorize season switch rides
  // along with it; the review figures are null rather than invented
  ok('backend: with nothing set the figures are null rather than invented', out.ok === true && out.rating === null && out.count === null, JSON.stringify(out));
}
{
  const t = loadScript([]);
  t.store.push(row(t.HEAD, { id:'c1', created:'2026-09-01T00:00:00Z', type:'CONFIG', name:'review_rating', notes:'5.0' }));
  t.store.push(row(t.HEAD, { id:'c2', created:'2026-09-01T00:00:00Z', type:'CONFIG', name:'review_count',  notes:'28' }));
  t.store.push(row(t.HEAD, { id:'c3', created:'2026-10-13T00:00:00Z', type:'CONFIG', name:'review_count',  notes:'41' }));
  t.store.push(row(t.HEAD, { id:'c4', created:'2026-10-13T00:00:00Z', type:'CONFIG', name:'review_rating', notes:'4.9' }));
  const out = JSON.parse(t.api.doGet({ parameter: { action: 'public' } }).body);
  ok('backend: the newest rating and count win', out.ok === true && out.rating === 4.9 && out.count === 41, JSON.stringify(out));
  ok('backend: no PIN needed - it is the number already printed on the site', !('error' in out));
  ok('backend: the answer is cached', !!t.cache.public_stats);
  // saving a new count from the tracker clears the cache so the site sees it within the hour
  // settings rows need the key now; the stub answers 'sheet' for every script property, so that is the key
  t.api.doPost({ postData: { contents: JSON.stringify({ action: 'lead', key: 'sheet', lead: { id:'c5', type:'CONFIG', name:'review_count', notes:'42', status:'config', created:'2026-10-14T00:00:00Z' } }) } });
  // and one with NO timestamp at all, which the backend must stamp itself
  t.api.doPost({ postData: { contents: JSON.stringify({ action: 'lead', key: 'sheet', lead: { id:'c6', type:'CONFIG', name:'review_rating', notes:'4.8', status:'config' } }) } });
  ok('backend: a settings row WITHOUT the key is refused', JSON.parse(t.api.doPost({ postData: { contents: JSON.stringify({ action: 'lead', lead: { id:'c7', type:'CONFIG', name:'review_count', notes:'1', status:'config' } }) } }).body).ok === false);
  ok('backend: a config save drops the cache', !t.cache.public_stats);
  const again = JSON.parse(t.api.doGet({ parameter: { action: 'public' } }).body);
  ok('backend: and the next read has the new count', again.count === 42, JSON.stringify(again));
  ok('backend: a config row sent without a timestamp is stamped, so it still counts as newest', again.rating === 4.8, JSON.stringify(again));
  ok('the paste-in copy matches', fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'code.txt'), 'utf8') === fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8'));
}

/* ---- the pages ---- */
(async () => {
  const b = await launch();
  const PAGES = ['/', '/st-peters/', '/lake-st-louis/', '/belleville-il/'];

  // every page carries the hooks and the script
  for (const pg of PAGES){
    const file = path.join(ROOT, pg === '/' ? 'index.html' : pg.slice(1) + 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    ok(pg + ' has the rating and count hooks', /data-review-rating/.test(html) && /data-review-count/.test(html));
    ok(pg + ' loads reviews.js', /src="\/reviews\.js/.test(html));
  }

  // the backend answers: the page shows it, including in structured data
  for (const pg of ['/', '/lake-st-louis/']){
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    let publicHits = 0;
    p.route('**/script.google.com/**', r => {
      if (/action=public/.test(r.request().url())){ publicHits++; return r.fulfill({ contentType:'application/json', body:'{"ok":true,"rating":4.9,"count":41,"updated":"2026-10-13"}' }); }
      return r.fulfill({ contentType:'application/json', body:'{"ok":true}' });
    });
    p.route('**/connect.facebook.net/**', r => r.fulfill({ contentType:'application/javascript', body:'window.fbq=function(){};' }));
    p.route('**/nominatim**', r => r.fulfill({ contentType:'application/json', body:'[]' }));
    await p.goto(ORIGIN + pg); await p.waitForTimeout(700);
    const rating = await p.$eval('[data-review-rating]', e => e.textContent.trim());
    const count = await p.$eval('[data-review-count]', e => e.textContent.trim());
    ok(pg + ' shows the live rating', rating === '4.9', rating);
    ok(pg + ' shows the live count', count === '41 reviews', count);
    const ld = await p.$$eval('script[type="application/ld+json"]', els => els.map(e => e.textContent).join(''));
    ok(pg + ' structured data carries the live figures too', /"ratingValue":"4.9"/.test(ld) && /"reviewCount":"41"/.test(ld));
    ok(pg + ' asked the backend once', publicHits === 1, String(publicHits));
    await p.reload(); await p.waitForTimeout(500);
    ok(pg + ' remembers it on the next load instead of asking again', publicHits === 1 && (await p.$eval('[data-review-count]', e => e.textContent.trim())) === '41 reviews', String(publicHits));
    ok(pg + ' no page errors', errs.length === 0, errs.join('; '));
    await p.close();
  }

  // the backend is not there (not redeployed yet, offline): the typed figure stays
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.route('**/script.google.com/**', r => r.abort());
    p.route('**/connect.facebook.net/**', r => r.fulfill({ contentType:'application/javascript', body:'window.fbq=function(){};' }));
    await p.goto(ORIGIN + '/st-peters/'); await p.waitForTimeout(700);
    ok('with no backend the page still shows the typed figure', (await p.$eval('[data-review-count]', e => e.textContent.trim())) === '28 reviews');
    ok('and throws nothing', errs.length === 0, errs.join('; '));
    await p.close();
  }
  // a nonsense answer is ignored
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    p.route('**/script.google.com/**', r => r.fulfill({ contentType:'application/json', body:'{"ok":true,"rating":17,"count":-3}' }));
    p.route('**/connect.facebook.net/**', r => r.fulfill({ contentType:'application/javascript', body:'window.fbq=function(){};' }));
    await p.goto(ORIGIN + '/st-peters/'); await p.waitForTimeout(600);
    ok('a nonsense rating from the backend is ignored', (await p.$eval('[data-review-rating]', e => e.textContent.trim())) === '5.0');
    await p.close();
  }

  /* ---- the tracker control ---- */
  {
    const p = await b.newPage({ viewport:{ width:430, height:1400 } });
    const posts = [];
    const rows = [
      { id:'c1', type:'CONFIG', name:'review_rating', notes:'5.0', created:'2026-09-01T00:00:00Z' },
      { id:'c2', type:'CONFIG', name:'review_count',  notes:'28',  created:'2026-09-01T00:00:00Z' },
      { id:'k1', type:'ACTIVATE', name:'Kevin Barr', status:'closed', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo',
        crmnotes:'[CD:2026-08-01] [SD:2026-08-03] [QA:a] ', created:'2026-07-28T00:00:00Z' },
    ];
    stubNetwork(p, { posts, leads: rows });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    await p.evaluate(() => toggleReviewSettings()); await p.waitForTimeout(200);
    ok('tracker: the settings show the rating and count boxes, pre-filled',
       (await p.inputValue('#rv-rating')) === '5.0' && (await p.inputValue('#rv-count')) === '28');
    await p.fill('#rv-rating', '4.9'); await p.fill('#rv-count', '41');
    await p.evaluate(() => saveReviewStats()); await p.waitForTimeout(400);
    const cfg = posts.filter(x => x && x.type === 'CONFIG');
    ok('tracker: saving writes both numbers to the sheet as config rows',
       cfg.some(x => x.name === 'review_rating' && x.notes === '4.9') && cfg.some(x => x.name === 'review_count' && x.notes === '41'),
       JSON.stringify(cfg.map(x => [x.name, x.notes])));
    ok('tracker: a silly rating is refused', await p.evaluate(() => { document.getElementById('rv-rating').value = '9'; saveReviewStats(); return true; }) &&
       !posts.some(x => x && x.type === 'CONFIG' && x.notes === '9'));
    await p.close();
  }

  await b.close();
  done();
})();
