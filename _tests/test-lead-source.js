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
    await p.click('#t-nums .stat'); await p.waitForTimeout(500);   // the journeys live in the tapped-open detail
    const t = (await p.textContent('#t-detail')).replace(/\s+/g, ' ');
    ok('journeys say why a Meta Ads visit is Meta Ads', /Meta Ads \(Meta click id on the link\)/.test(t), t.slice(0, 300));
    ok('journeys say why a Direct visit is Direct', /Direct \(no tag on the link, no referrer\)/.test(t));
    ok('journeys name the app when that was the only clue', /inside the Facebook\/Instagram app/.test(t));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }
  await b.close();
  done();
})();
