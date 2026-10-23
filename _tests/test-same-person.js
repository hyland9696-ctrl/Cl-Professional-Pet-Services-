/* One person, one card.

   Stefany asked for a quote, changed something, and activated - and the
   tracker showed her three times, because every page load minted a new
   id. The phone number is now the id on the site; the tracker folds rows
   that share a phone within a day into one card; and the backend keeps the
   office's notes when the site writes the same person again. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

/* ---- the backend's merge, run outside Apps Script ---- */
{
  const src = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8');
  const merge = new Function(src + '\nreturn mergeNotes_;')();
  ok('fresh site markers win, office markers are kept',
     merge('[SID:abc] [SRC:Meta Ads] [QA:a] ', '[FU:2026-10-22] [ATT:2@2026-10-20] [T1:2026-10-20T15:00:00Z] [SID:old] [SRC:Direct] [QA:w] gate 1234')
       === '[SID:abc] [SRC:Meta Ads] [QA:a] [FU:2026-10-22] [ATT:2@2026-10-20] [T1:2026-10-20T15:00:00Z] gate 1234',
     merge('[SID:abc] [SRC:Meta Ads] [QA:a] ', '[FU:2026-10-22] [ATT:2@2026-10-20] [T1:2026-10-20T15:00:00Z] [SID:old] [SRC:Direct] [QA:w] gate 1234'));
  ok('nothing old: the fresh notes as they are', merge('[QA:w] ', '') === '[QA:w] ');
  ok('both have text: both kept', merge('[QA:d] too expensive', '[CD:2026-09-01] gate 1234') === '[QA:d] [CD:2026-09-01] too expensive | gate 1234');
  ok('the same text twice is not doubled', merge('[QA:w] hello', '[QA:a] hello') === '[QA:w] hello');
  ok('a tracker edit (full notes) carries nothing it already has', merge('[FU:2026-11-01] [QA:w] mine', '[FU:2026-10-01] [QA:w] old') === '[FU:2026-11-01] [QA:w] mine | old');
  ok('the sheet-error guard still parses', typeof new Function(src + '\nreturn safeCell_;')() === 'function');
}

(async () => {
  const b = await launch();

  /* ---- the site: the phone number is the id, across reloads ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    let p = await ctx.newPage();
    const posts = [];
    stubNetwork(p, { posts });
    // a fresh tab each time: the wizard resumes a reloaded tab at the price
    // step, and "came back from the Facebook app" is a new tab anyway
    const fill = async () => {
      await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
      await p.fill('#q-zip', '63042'); await p.waitForTimeout(400);
      await p.fill('#qf2-name', 'Stefany Freeman'); await p.fill('#qf2-phone', '(949) 390-4971');
      await p.fill('#qf2-email', 'stefany@gmail.com'); await p.fill('#qf2-addr', '806 Lynn Haven Ln');
      await p.click('#q-see-btn'); await p.waitForTimeout(700);
    };
    await fill();
    const first = posts.find(l => l && l.type === 'ENQUIRY');
    ok('the lead id is the phone number', first && first.id === 'p9493904971', first && first.id);
    await p.close(); p = await ctx.newPage(); stubNetwork(p, { posts });
    await fill();   // back again later: new tab, same person
    const again = posts.filter(l => l && l.type === 'ENQUIRY');
    ok('after a reload the same person has the same id', again.length === 2 && again[1].id === 'p9493904971', again.map(l => l.id).join(','));
    await p.check('#qf2-tos'); await p.click('#q-yes-btn'); await p.waitForTimeout(700);
    const act = posts.find(l => l && l.type === 'ACTIVATE');
    ok('and so does the activation', act && act.id === 'p9493904971', act && act.id);
    await ctx.close();
  }

  /* ---- the tracker: three rows, one Stefany ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const now = Date.now();
    const at = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
    const rows = [
      // Stefany, three ids inside two hours; the office had already called on the first
      { id:'s3', type:'ACTIVATE', name:'Stefany Freeman', phone:'19493904971', email:'stefany.d.freeman@gmail.com', zip:'63042', dogs:'1', service:'weekly', price:'$107/mo', status:'new', crmnotes:'[SID:c] [QA:a] ', created: at(10) },
      { id:'s2', type:'ENQUIRY', name:'Stefany Freeman', phone:'19493904971', zip:'63042', dogs:'1', service:'weekly', price:'$107/mo', status:'new', crmnotes:'[SID:b] [QA:w] ', created: at(60) },
      { id:'s1', type:'ENQUIRY', name:'Stefany Freeman', phone:'(949) 390-4971', zip:'63042', dogs:'1', service:'weekly', price:'$92/mo', status:'called', crmnotes:'[ATT:1@2026-10-20] [T1:' + at(90) + '] [SID:a] [QA:w] gate code 4471', created: at(120) },
      // the same phone from the spring: a separate visit
      { id:'s0', type:'DECLINED', name:'S. Freeman', phone:'9493904971', zip:'63042', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:d] price', created: at(60 * 24 * 90) },
      // an id whose newest row is deleted: gone, even though an older row is not
      { id:'x1', type:'ENQUIRY', name:'Gone Gary', phone:'6363754301', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'deleted', crmnotes:'', created: at(5) },
      { id:'x1', type:'ENQUIRY', name:'Gone Gary', phone:'6363754301', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'', created: at(50) },
      // an id removed once, then back with a newer row: shown
      { id:'y1', type:'ENQUIRY', name:'Back Betty', phone:'6363754302', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'', created: at(3) },
      { id:'y1', type:'ENQUIRY', name:'Back Betty', phone:'6363754302', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'deleted', crmnotes:'', created: at(400) },
    ];
    stubNetwork(p, { leads: rows });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    const cards = await p.$$eval('#list .card', els => els.map(e => ({ id: e.id, who: e.querySelector('.who').textContent.trim(), text: e.textContent.replace(/\s+/g, ' ') })));
    const stef = cards.filter(c => /Stefany Freeman/.test(c.who));
    ok('one Stefany card, not three', stef.length === 1, cards.map(c => c.who).join(' | '));
    ok('it is the newest row: the activation', stef[0] && stef[0].id === 'card-s3' && /WANTS TO START/.test(stef[0].text), stef[0] && stef[0].id);
    ok('it inherits the Called status from the older row', await p.$eval('#card-s3 .stbtns button.on', e => e.textContent.trim()) === 'Called',
       await p.$eval('#card-s3 .stbtns button.on', e => e.textContent.trim()));
    ok('and the office\'s notes', /gate code 4471/.test(stef[0].text), stef[0].text.slice(0, 400));
    ok('no same-phone line for the folded rows', !/Same phone as Stefany/.test(stef[0].text));
    ok('the spring visit stays its own card, and the line points at it', cards.some(c => c.who === 'S. Freeman') && /Same phone as S\. Freeman/.test(stef[0].text), stef[0].text.slice(0, 400));
    ok('a removed lead stays removed', !cards.some(c => c.who === 'Gone Gary'));
    ok('a lead who came back after being removed is shown', cards.some(c => c.who === 'Back Betty'));
    const stats = (await p.textContent('#stats')).replace(/\s+/g, ' ');
    ok('the counts see one Stefany', !/3 Interested/.test(stats));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  /* ---- a lead this phone remembers but the sheet does not is re-pushed silently ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const posts = [];
    await p.addInitScript(() => {
      try { localStorage.setItem('clpps_leads', JSON.stringify([{ id:'local1', type:'ENQUIRY', name:'Cached Cathy', phone:'6363754399', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: new Date().toISOString() }])); } catch (e) {}
    });
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} }
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: [] }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    const rp = posts.find(x => x.action === 'lead' && x.lead && x.lead.id === 'local1');
    ok('the cached lead is pushed back to the sheet', !!rp);
    ok('and silently: it was never news to the office', rp && rp.lead.silent === 1, rp && JSON.stringify(rp.lead.silent));
    await ctx.close();
  }

  await b.close();
  done();
})();
