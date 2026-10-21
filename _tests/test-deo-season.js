/* Deodorize & sanitize is a warm-weather service.

   Corey stops once it drops below 50F and starts again when it warms, so
   the switch is a weather call made in the tracker, not a date. OFF: the
   quote still asks, a yes costs nothing today and is marked "when the
   season reopens"; ON: priced in as before. The phone quote and the city
   pages follow. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

ok('the price list says what to assume when the backend cannot be reached (off, it is October)',
   /deoSeasonDefault:\s*'off'/.test(fs.readFileSync(path.join(ROOT, 'pricing.js'), 'utf8')));
for (const slug of ['st-peters', 'wildwood', 'belleville-il']){
  ok(slug + ': the add-on line says it is seasonal', /\$15 per treatment \(seasonal: paused once it drops below 50&deg;\)/.test(fs.readFileSync(path.join(ROOT, slug, 'index.html'), 'utf8')));
}

/* the backend's public answer, with the switch set a given way */
function publicRoute(p, deo){
  return p.route('**/script.google.com/**', r => {
    if (r.request().method() === 'GET' && /action=public/.test(r.request().url())){
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, rating:5, count:31, deo }) });
    }
    return r.fallback();
  });
}
async function toPrice(p, deo){
  await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(900);
  await p.fill('#q-zip', '63376'); await p.waitForTimeout(400);
  await p.click('#q-deo-grid [data-v="' + deo + '"]'); await p.waitForTimeout(200);
  await p.fill('#qf2-name', 'Season Sam'); await p.fill('#qf2-phone', '6363754342');
  await p.fill('#qf2-email', 'sam@gmail.com'); await p.fill('#qf2-addr', '1 Test Lane');
  await p.click('#q-see-btn'); await p.waitForTimeout(700);
}

(async () => {
  const b = await launch();

  /* ---- the season is OFF (the backend says so) ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const posts = [], mails = [];
    stubNetwork(p, { posts, mails });
    await publicRoute(p, 'off');
    await toPrice(p, 'every');
    const label = (await p.textContent('#q-deo-label')).replace(/\s+/g, ' ');
    ok('OFF: the question says it is paused for the season', /paused for the season/.test(label), label);
    ok('OFF: the hint explains the 50 degree rule and that it is not in the price', /below 50/.test(await p.textContent('#q-deo-hint')) && /not in today/.test(await p.textContent('#q-deo-hint')));
    ok('OFF: the yes card reads as a yes for later', /Yes — every visit/.test(await p.textContent('#q-deo-grid [data-v="every"]')));
    const price = await p.textContent('#q-price');
    ok('OFF: the price is the scooping price only ($85, not $145)', /\$85/.test(price) && !/145/.test(price), price);
    ok('OFF: the note under the price says deodorize comes when the season reopens', /when the season reopens/.test(await p.textContent('#q-price-note')));
    ok('OFF: the recap says so too', /deodorize when the season reopens/.test(await p.textContent('#q-recap')), await p.textContent('#q-recap'));
    const lead = posts.find(l => l && l.type === 'ENQUIRY');
    ok('OFF: the lead carries the wish, not the price', lead && /^WANTS IT WHEN THE SEASON REOPENS: every visit/.test(lead.deodorize) && /^\$85\/mo/.test(lead.price) && !/deodorize/.test(lead.price), lead && (lead.deodorize + ' / ' + lead.price));
    const mail = mails.find(m => /QUOTE REQUEST/.test(m._subject));
    ok('OFF: the office email says the season was off', mail && /off \(paused/.test(mail.Deodorize_Season) && /SEASON REOPENS/.test(mail.Deodorize), mail && mail.Deodorize_Season);
    await ctx.close();
  }

  /* ---- the season is ON ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const posts = [];
    stubNetwork(p, { posts });
    await publicRoute(p, 'on');
    await toPrice(p, 'every');
    ok('ON: the question is the plain add-on again', /\$15 per treatment/.test(await p.textContent('#q-deo-label')) && (await p.$eval('#q-deo-hint', e => getComputedStyle(e).display)) === 'none');
    const price = await p.textContent('#q-price');
    ok('ON: deodorize is in the price ($85 + 4 x $15 = $145)', /\$145/.test(price), price);
    const lead = posts.find(l => l && l.type === 'ENQUIRY');
    ok('ON: the lead says every visit, priced', lead && lead.deodorize === 'every visit ($15/treatment)' && /^\$145\/mo \(includes 4 deodorize/.test(lead.price), lead && (lead.deodorize + ' / ' + lead.price));
    await ctx.close();
  }

  /* ---- no answer from the backend: the price list's default (off) ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    stubNetwork(p, {});
    await toPrice(p, 'every');
    ok('backend silent: off by default, scooping price only', /\$85/.test(await p.textContent('#q-price')) && /paused for the season/.test(await p.textContent('#q-deo-label')));
    await ctx.close();
  }

  /* ---- the tracker: the switch, the phone quote, the card, the list ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('dialog', d => d.accept());
    const posts = [];
    const now = new Date().toISOString();
    const rows = [
      { id:'w1', type:'ENQUIRY', name:'Waiting Wanda', phone:'6363754342', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', deodorize:'WANTS IT WHEN THE SEASON REOPENS: every visit ($15/treatment)', status:'called', crmnotes:'[QA:w] ', created: now },
      { id:'n1', type:'ENQUIRY', name:'No Ned', phone:'6363754343', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', deodorize:'no', status:'new', crmnotes:'[QA:w] ', created: now },
    ];
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} }
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    ok('the toolbar shows the season, OFF by default', /Deodorize season: OFF/.test((await p.textContent('#deoBtn')).replace(/\s+/g, ' ')), await p.textContent('#deoBtn'));
    const card = (await p.textContent('#card-w1')).replace(/\s+/g, ' ');
    ok('a card says they want it when the season reopens', /deodorize when the season reopens/.test(card), card.slice(0, 300));
    ok('a plain lead says nothing', !/season/.test((await p.textContent('#card-n1')).replace(/\s+/g, ' ')));

    // the phone quote prices nothing for deodorize while off
    await p.click('button:has-text("Phone quote")'); await p.waitForTimeout(300);
    await p.fill('#pq-zip', '63376'); await p.waitForTimeout(200);
    await p.click('#pq-deo button:has-text("Every visit")'); await p.waitForTimeout(300);
    const pq = (await p.textContent('#pq-price')).replace(/\s+/g, ' ');
    ok('phone quote OFF: $85 and a note that deodorize comes when it reopens', /\$85/.test(pq) && /season is OFF/.test(pq) && !/145/.test(pq), pq.slice(0, 300));

    // the list for spring
    await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', '1'); } catch (e) {} });
    await p.click('#numbersBtn'); await p.waitForTimeout(800);
    const ins = (await p.textContent('#insights')).replace(/\s+/g, ' ');
    ok('Insights lists who said yes while it was off', /Deodorize when the season reopens/.test(ins) && /Waiting Wanda/.test(ins) && !/No Ned/.test(ins.split('Deodorize when the season reopens')[1].split('Referral')[0]), ins.slice(0, 300));

    // flip it on
    await p.click('#deoBtn'); await p.waitForTimeout(400);
    ok('flipping writes a deo_season setting', posts.some(x => x.action === 'lead' && x.lead && x.lead.type === 'CONFIG' && x.lead.name === 'deo_season' && x.lead.notes === 'on'));
    ok('and the button says ON', /Deodorize season: ON/.test((await p.textContent('#deoBtn')).replace(/\s+/g, ' ')));
    await p.click('#pq-deo button:has-text("Every visit")'); await p.waitForTimeout(300);
    const pq2 = (await p.textContent('#pq-price')).replace(/\s+/g, ' ');
    ok('phone quote ON: deodorize is priced in ($145)', /\$145/.test(pq2), pq2.slice(0, 200));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  await b.close();
  done();
})();
