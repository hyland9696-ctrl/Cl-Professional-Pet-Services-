/* Google Ads conversion tracking (google-ads.js). Off until the ID is
   filled in: no Google code loads, nothing is sent. With an ID and labels
   (injected here), the Google tag loads once and each conversion goes to
   its own label, once per page view: a quote request with its value,
   and taps on phone, text and email links. */
const fs = require('fs'), path = require('path');
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'google-ads.js'), 'utf8');

(async () => {
  const b = await launch();
  ok('the file ships switched off: a blank ID', /var GOOGLE_ADS_ID = "";/.test(SRC));
  ok('every public page loads it, stamped', ['index.html', 'st-peters/index.html', 'commercial/index.html', 'contact/index.html', 'q/index.html'].every(f => /src="\/google-ads\.js\?v=[0-9a-f]+"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  ok('the private pages do not: the tracker and the customer account page', ['hq-8k3v51/index.html', 'account/index.html'].every(f => !/google-ads\.js/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  ok('the quote request is reported from the quote form itself, mid-way through', /clppsAds\('quote'/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
    const google = []; stubNetwork(p, {});
    await p.route('**/googletagmanager.com/**', r => { google.push(r.request().url()); r.fulfill({ contentType: 'application/javascript', body: '' }); });
    await p.goto(ORIGIN + '/'); await p.waitForTimeout(700);
    ok('with no ID nothing loads from Google and there is no tag on the page', google.length === 0 && (await p.evaluate(() => typeof window.gtag === 'undefined' && typeof window.clppsAds === 'function' && !document.querySelector('script[src*="googletagmanager.com"]'))));
    await p.evaluate(() => clppsAds('quote', 91));
    ok('and a conversion call does nothing', await p.evaluate(() => !window.dataLayer || window.dataLayer.length === 0));
    await ctx.close();
  }
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
    const google = []; stubNetwork(p, {});
    await p.route('**/googletagmanager.com/**', r => { google.push(r.request().url()); r.fulfill({ contentType: 'application/javascript', body: '' }); });
    await p.route('**/google-ads.js*', r => r.fulfill({ contentType: 'application/javascript', body: SRC.replace('var GOOGLE_ADS_ID = "";', 'var GOOGLE_ADS_ID = "AW-123456789";').replace(/quote:\s*""/, 'quote: "QUOTELBL"').replace(/call:\s*""/, 'call: "CALLLBL"').replace(/text:\s*""/, 'text: "TEXTLBL"') }));
    await p.goto(ORIGIN + '/'); await p.waitForTimeout(800);
    const tags = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('script[src*="googletagmanager.com"]'), x => x.src));
    ok('with an ID the Google tag is added once, for that ID', tags.length === 1 && /gtag\/js\?id=AW-123456789$/.test(tags[0]), tags.join());
    const ev = () => p.evaluate(() => Array.prototype.slice.call(window.dataLayer).map(a => Array.prototype.slice.call(a)).filter(a => a[0] === 'event').map(a => a[2]));
    await p.evaluate(() => { clppsAds('quote', 91); clppsAds('quote', 91); clppsAds('activated', 91); });
    const e1 = await ev();
    ok('a quote request is sent to its label with the value, once; an action with no label is not sent', e1.length === 1 && e1[0].send_to === 'AW-123456789/QUOTELBL' && e1[0].value === 91 && e1[0].currency === 'USD', JSON.stringify(e1));
    await p.evaluate(() => { document.querySelectorAll('a[href^="tel:"], a[href^="sms:"]').forEach(a => a.addEventListener('click', e => e.preventDefault())); document.querySelector('a[href^="tel:"]').click(); document.querySelector('a[href^="sms:"]').click(); document.querySelector('a[href^="tel:"]').click(); });
    const e2 = await ev();
    ok('a tap on a phone number and on the text button each count once', e2.filter(x => x.send_to === 'AW-123456789/CALLLBL').length === 1 && e2.filter(x => x.send_to === 'AW-123456789/TEXTLBL').length === 1, JSON.stringify(e2));
    await ctx.close();
  }
  /* ---- the thank-you page ---- */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
    stubNetwork(p, {});
    await p.route('**/googletagmanager.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await p.route('**/google-ads.js*', r => r.fulfill({ contentType: 'application/javascript', body: SRC.replace('var GOOGLE_ADS_ID = "";', 'var GOOGLE_ADS_ID = "AW-123456789";').replace(/activated:\s*""/, 'activated: "STARTLBL"').replace(/commercial:\s*""/, 'commercial: "COMLBL"') }));
    const ev = () => p.evaluate(() => Array.prototype.slice.call(window.dataLayer || []).map(a => Array.prototype.slice.call(a)).filter(a => a[0] === 'event').map(a => a[2]));
    await p.goto(ORIGIN + '/thank-you/?t=start'); await p.waitForTimeout(600);
    ok('opened directly, the thank-you page thanks them but reports no sale', /You’re on the list!/.test(await p.textContent('h1')) && (await ev()).length === 0 && (await p.evaluate(() => window.clppsThanks.counted)) === false);
    await p.evaluate(() => sessionStorage.setItem('clpps_ty', JSON.stringify({ k: 'start', v: 91, at: Date.now() })));
    await p.goto(ORIGIN + '/thank-you/?t=start'); await p.waitForTimeout(600);
    const e1 = await ev();
    ok('arriving from the sign-up form, it reports the sale once, with its value', e1.length === 1 && e1[0].send_to === 'AW-123456789/STARTLBL' && e1[0].value === 91, JSON.stringify(e1));
    await p.reload(); await p.waitForTimeout(600);
    ok('a refresh does not count it again', (await ev()).length === 0);
    await p.evaluate(() => sessionStorage.setItem('clpps_ty', JSON.stringify({ k: 'start', v: 91, at: Date.now() })));
    await p.goto(ORIGIN + '/thank-you/?t=commercial'); await p.waitForTimeout(600);
    ok('a note for one form cannot be spent on another, and the commercial page has its own words', (await ev()).length === 0 && /we have your request/.test(await p.textContent('h1')));
    ok('it tells them what happens next and how to reach us, and stays out of search engines', (await p.$$('.step')).length === 3 && (await p.$$('a[href^="tel:"]')).length >= 1 && (await p.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow' && await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  }
  ok('the sign-up, the emailed quote and the commercial form all hand over to the thank-you page', (() => { const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), q = fs.readFileSync(path.join(ROOT, 'q/index.html'), 'utf8'); return /qThanks\('start'/.test(h) && /qThanks\('commercial'/.test(h) && /\/thank-you\/\?t=start/.test(q) && !/clppsAds\('activated'/.test(h + q); })());
  await b.close(); done();
})();
