/* Where a visitor came from.

   Corey: "I'm not confident that META ads are tracking as META ads on our
   tracker right now. I feel like they come in as direct." Every way a
   Meta visit can arrive, and what it must be called. The rule lives in
   lead-source.js and nowhere else, so it is run here outside a browser
   with the page's surroundings faked, then once in a real browser to make
   sure the view beacon carries the reason. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

const SRC = fs.readFileSync(path.join(ROOT, 'lead-source.js'), 'utf8');

/* lead-source.js with a fake page around it */
function classify(o){
  const store = {};
  const mem = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const env = {
    location: { search: o.search || '', hash: o.hash || '', pathname: '/' },
    document: { referrer: o.referrer || '' },
    navigator: { userAgent: o.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' },
    sessionStorage: mem, localStorage: mem, URL,
  };
  const fn = new Function('location', 'document', 'navigator', 'sessionStorage', 'localStorage', 'URL',
    SRC + '\nreturn { src: clppsLeadSource(), how: clppsSourceHow };');
  return fn(env.location, env.document, env.navigator, env.sessionStorage, env.localStorage, env.URL);
}

const FB_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.34.108;FBBV/0;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]';
const IG_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android';

const cases = [
  // the tag Meta puts on every ad link
  ['a Meta ad click with fbclid', { search: '?fbclid=IwAR1abc' }, 'Meta Ads', 'fbclid'],
  ['fbclid after the hash (/#quote?fbclid=)', { hash: '#quote?fbclid=IwAR1abc' }, 'Meta Ads', 'fbclid'],
  ['fbclid with no referrer at all (iOS in-app browser)', { search: '?fbclid=x', ua: FB_IOS }, 'Meta Ads', 'fbclid'],
  // what Corey should put in the ad's URL parameters
  ['utm_source=facebook', { search: '?utm_source=facebook&utm_medium=paid' }, 'Meta Ads', 'utm:facebook'],
  ['utm_source=fb', { search: '?utm_source=fb' }, 'Meta Ads', 'utm:fb'],
  ['utm_source=ig', { search: '?utm_source=ig' }, 'Meta Ads', 'utm:ig'],
  ['utm_source=Instagram (capitals)', { search: '?utm_source=Instagram' }, 'Meta Ads', 'utm:instagram'],
  ['utm_source=meta', { search: '?utm_source=meta&utm_campaign=fall' }, 'Meta Ads', 'utm:meta'],
  // no tag on the link: the referrer, then the app
  ['no tag, referrer l.facebook.com', { referrer: 'https://l.facebook.com/' }, 'Meta (organic)', 'ref:l.facebook.com'],
  ['no tag, referrer lm.facebook.com', { referrer: 'https://lm.facebook.com/' }, 'Meta (organic)', 'ref:lm.facebook.com'],
  ['no tag, Android app referrer android-app://m.facebook.com', { referrer: 'android-app://m.facebook.com/' }, 'Meta (organic)', 'ref:m.facebook.com'],
  ['no tag, referrer l.instagram.com', { referrer: 'https://l.instagram.com/' }, 'Meta (organic)', 'ref:l.instagram.com'],
  ['no tag, no referrer, inside the Facebook app', { ua: FB_IOS }, 'Meta (organic)', 'app:meta'],
  ['no tag, no referrer, inside the Instagram app', { ua: IG_ANDROID }, 'Meta (organic)', 'app:meta'],
  // the rest, unchanged
  ['a Google ad click', { search: '?gclid=abc' }, 'Google Ads', 'gclid'],
  ['Google search', { referrer: 'https://www.google.com/' }, 'Google (organic)', 'ref:google.com'],
  ['a yard sign', { search: '?utm_source=yardsign&utm_campaign=stpeters' }, 'Yard sign QR (St. Peters)', 'utm:yardsign'],
  ['Nextdoor', { referrer: 'https://nextdoor.com/x' }, 'Nextdoor', 'ref:nextdoor.com'],
  ['typed in, nothing else: Direct', {}, 'Direct', 'none'],
  ['our own page as referrer is still Direct', { referrer: 'https://www.clpropetservices.com/st-peters/' }, 'Direct', 'ref:clpropetservices.com'],
];
for (const [name, o, src, how] of cases){
  const r = classify(o);
  ok(name + ' -> ' + src, r.src === src && r.how === how, 'got ' + r.src + ' / ' + r.how);
}
// the first answer sticks for the whole visit
{
  const store = {};
  const mem = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const run = (search) => new Function('location', 'document', 'navigator', 'sessionStorage', 'localStorage', 'URL',
    SRC + '\nreturn clppsLeadSource();')({ search, hash: '', pathname: '/' }, { referrer: '' }, { userAgent: '' }, mem, mem, URL);
  ok('the source is remembered when they click to the next page without the tag', run('?fbclid=1') === 'Meta Ads' && run('') === 'Meta Ads');
}

(async () => {
  const b = await launch();
  // the view beacon carries the reason, on the home page and on a city page
  for (const [url, ua, want] of [
      ['/?fbclid=IwAR9test', null, { service: 'Meta Ads', how: 'how=fbclid' }],
      ['/st-peters/', FB_IOS, { service: 'Meta (organic)', how: 'how=app:meta' }],
      ['/wentzville/?utm_source=facebook&utm_medium=paid&utm_campaign=fall', null, { service: 'Meta Ads', how: 'how=utm:facebook' }],
      ['/', null, { service: 'Direct', how: 'how=none' }]]){
    const ctx = await b.newContext(Object.assign({ viewport:{ width:390, height:844 } }, ua ? { userAgent: ua } : {}));
    const p = await ctx.newPage();
    const posts = [];
    stubNetwork(p, { posts });
    await p.goto(ORIGIN + url); await p.waitForTimeout(700);
    const v = posts.find(l => l && l.type === 'VIEW');
    ok(url + (ua ? ' in the Facebook app' : '') + ': view says ' + want.service, v && v.service === want.service, v && (v.service + ' / ' + v.notes));
    ok(url + ': and says why (' + want.how + ')', v && v.notes === want.how, v && v.notes);
    await ctx.close();
  }
  // a yard sign scan in a town that has its own page lands on that page,
  // still tagged as the sign: the printed QR cannot change, the target can
  for (const [code, slug, city] of [['lsl', 'lake-st-louis', 'Lake St. Louis'], ['wld', 'wildwood', 'Wildwood'], ['stp', 'st-peters', 'St. Peters']]){
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const posts = [];
    stubNetwork(p, { posts });
    await p.goto(ORIGIN + '/' + code + '/'); await p.waitForTimeout(900);
    ok('/' + code + ' forwards to /' + slug + '/', new URL(p.url()).pathname === '/' + slug + '/', p.url());
    const v = posts.find(l => l && l.type === 'VIEW');
    ok('/' + code + ': the visit is the ' + city + ' sign, on the city page', v && v.service === 'Yard sign QR (' + city + ')' && v.name === 'city-' + slug, v && (v.service + ' / ' + v.name));
    await ctx.close();
  }
  // the tracker shows the reason beside the source in Visitor journeys
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const now = new Date().toISOString();
    stubNetwork(p, { leads: [
      { id:'v1', type:'VIEW', name:'home', zip:'', yard:'s1', service:'Meta Ads', notes:'how=fbclid', created: now },
      { id:'v2', type:'VIEW', name:'home', zip:'direct', yard:'s2', service:'Direct', notes:'how=none', created: now },
      { id:'v3', type:'VIEW', name:'city-st-peters', zip:'', yard:'s3', service:'Meta (organic)', notes:'how=app:meta', created: now },
    ] });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', '1'); } catch (e) {} });
    await p.click('#numbersBtn'); await p.waitForTimeout(1500);
    await p.evaluate(() => foldAll(true)); await p.waitForTimeout(150);   // the cards start closed now
    await p.click('#t-nums .stat'); await p.waitForTimeout(500);   // the journeys live in the tapped-open detail
    const t = (await p.textContent('#t-detail')).replace(/\s+/g, ' ');
    ok('journeys say why a Meta Ads visit is Meta Ads', /Meta Ads \(Meta click id on the link\)/.test(t), t.slice(0, 300));
    ok('journeys say why a Direct visit is Direct', /Direct \(no tag on the link, no referrer\)/.test(t));
    ok('journeys name the app when that was the only clue', /inside the Facebook\/Instagram app/.test(t));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }
  // the monthly roll-up: a row per source, a column per month, leads / customers
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:1400 } });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date('2026-11-20T15:00:00Z') });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const L = (id, created, src, status, extra) => ({ id, type:'ENQUIRY', name:'Person ' + id, phone:'63637501' + id.slice(1).padStart(2, '0'), zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status, crmnotes:'[SID:s' + id + '] ' + (src ? '[SRC:' + src + '] ' : '') + (extra || '') + '[QA:w] ', created });
    stubNetwork(p, { leads: [
      L('a1', '2026-11-03T10:00:00Z', 'Meta Ads', 'new'),
      L('a2', '2026-11-05T10:00:00Z', 'Meta (organic)', 'new'),                               // in the app, no tag: could be an ad
      L('a3', '2026-11-06T10:00:00Z', 'Meta (organic)', 'closed', '[CD:2026-11-10] '),        // a real facebook.com referrer
      L('a4', '2026-10-28T10:00:00Z', 'Google Ads', 'closed', '[CD:2026-11-02] '),            // asked in October, started in November
      L('a5', '2026-10-12T10:00:00Z', 'Yard sign QR (St. Peters)', 'new'),
      L('a6', '2026-10-15T10:00:00Z', '', 'lost'),
      { id:'v2', type:'VIEW', name:'home', zip:'', yard:'sa2', service:'Meta (organic)', notes:'how=app:meta', created:'2026-11-05T09:58:00Z' },
      { id:'v3', type:'VIEW', name:'home', zip:'', yard:'sa3', service:'Meta (organic)', notes:'how=ref:l.facebook.com', created:'2026-11-06T09:58:00Z' },
    ] });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    const R = await p.evaluate(() => { const T = rollRows(); const o = { mos: T.mos }; T.rows.forEach(r => o[r.name] = r.per.map(c => c.join('/')).join(' ') + ' = ' + r.all.join('/')); return o; });
    ok('months newest first; a lead counts in the month they asked and a customer in the month they started', R.mos.join() === '2026-11,2026-10' && R['Google Ads'] === '0/1 1/0 = 1/1', JSON.stringify(R));
    ok('a Meta lead that opened inside the app with no tag is on its own line, not called organic; a real Facebook referrer stays organic', R['Meta (in app, no tag)'] === '1/0 0/0 = 1/0' && R['Meta (organic)'] === '1/1 0/0 = 1/1' && R['Meta Ads'] === '1/0 0/0 = 1/0', JSON.stringify(R));
    ok('All Meta adds the three Meta lines; yard signs from every town are one line; an untagged lead is Not tagged; the total counts each lead once', R['All Meta'] === '3/1 0/0 = 3/1' && R['Yard sign'] === '0/0 1/0 = 1/0' && R['Not tagged'] === '0/0 1/0 = 1/0' && R['TOTAL'] === '3/2 3/0 = 6/2', JSON.stringify(R));
    await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', '1'); } catch (e) {} });
    await p.click('#numbersBtn'); await p.waitForTimeout(1500);
    const tx = (await p.textContent('#insights')).replace(/\s+/g, ' ');
    ok('the table is in the Numbers panel with the months across the top and the note about untagged Meta', /Monthly roll-up by source/.test(tx) && /Nov 26/.test(tx) && /Oct 26/.test(tx) && /could be either/.test(tx) && (await p.$$('#insights button:has-text("Copy for a spreadsheet")')).length === 1, tx.slice(tx.indexOf('Monthly roll-up'), tx.indexOf('Monthly roll-up') + 300));
    ok('on a phone the table scrolls inside its own box and the page stays the width of the screen', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const tsv = await p.evaluate(() => { let got = ''; window.copyText = (s) => { got = s; }; rollCopy(); return got; });
    ok('Copy gives two tab-separated blocks, leads then customers, ready for a spreadsheet', /^Leads by source\tNov 26\tOct 26\tTotal\n/.test(tsv) && /\nAll Meta\t3\t0\t3\n/.test(tsv) && /\n\nCustomers started by source\tNov 26\tOct 26\tTotal\n/.test(tsv) && /\nTOTAL\t2\t0\t2$/.test(tsv), tsv);
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }
  await b.close();
  done();
})();
