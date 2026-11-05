/* Seven more things the tracker keeps an eye on.

   Money left on the table, behind on payment, which ad brought whom, the
   story on each card, quotes about to run out, win-back for closed
   accounts, and who did what. Fixed clock: 5 November 2026. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const NOW = new Date('2026-11-05T15:00:00Z');
const ago = (days) => new Date(NOW.getTime() - days * 864e5).toISOString();
const day = (days) => new Date(NOW.getTime() - days * 864e5).toISOString().slice(0, 10);

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1600 } });
  const p = await ctx.newPage();
  await p.clock.install({ time: NOW });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const dialogs = []; p.on('dialog', async d => { dialogs.push(d.message()); await d.accept(d.message().startsWith('How much') ? '120' : d.message().startsWith('Behind since') ? '2026-09-01' : d.message().startsWith('Who uses') ? 'Jesse' : ''); });
  const posts = [];
  const rows = [
    // Becky: 2 dogs weekly in 63376, pays $55; the table says $91
    { id:'u1', type:'SAVED', name:'Becky Under', phone:'6363750001', zip:'63376', address:'1 Poseidon Ct, St. Peters, Missouri 63376', dogs:'2', service:'weekly', price:'$55/mo', status:'closed', crmnotes:'[CD:2024-03-01] [IC:w] ', created: ago(600) },
    // Karen: 5 dogs, with a $30 deodorize add-on in the price: plan $112 against table $? (5 dogs is manual): skipped
    { id:'u2', type:'SAVED', name:'Karen Five', phone:'6363750002', zip:'63301', address:'2 Innisfree Dr, St. Charles, Missouri 63301', dogs:'5', service:'weekly', price:'$142/mo (includes $30 deodorize)', status:'closed', crmnotes:'[CD:2026-05-01] [IC:w] ', created: ago(180) },
    // Sarah: 2 dogs weekly 63301, pays $80 + $45 deodorize = $125; plan $80 against table $91
    { id:'u3', type:'SAVED', name:'Sarah Add', phone:'6363750003', zip:'63301', address:'3 Lime Kiln, St. Charles, Missouri 63301', dogs:'2', service:'weekly', price:'$125/mo (includes $45 deodorize)', status:'closed', crmnotes:'[CD:2026-08-11] [IC:w] ', created: ago(80) },
    // Pat: at the table price already
    { id:'u4', type:'SAVED', name:'Pat Exact', phone:'6363750004', zip:'63376', address:'4 Newport Ct, St. Peters, Missouri 63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-09-11] [IC:w] ', created: ago(50) },
    // a quote from an ad link, with campaign and ad names
    { id:'a1', type:'ENQUIRY', name:'Ad Amy', phone:'6363750005', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[SRC:Meta Ads] [CAMP:Fall promo] [AD:Yard sign video] [CD:2026-10-20] [QA:a] ', created: ago(20) },
    { id:'a2', type:'ENQUIRY', name:'Ad Al', phone:'6363750006', zip:'63366', dogs:'1', service:'weekly', price:'$85/mo', status:'lost', crmnotes:'[SRC:Meta Ads] [CAMP:Fall promo] [AD:Yard sign video] [QA:d] price', created: ago(18) },
    { id:'a3', type:'ENQUIRY', name:'Ad Ann', phone:'6363750007', zip:'63366', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[SRC:Meta Ads] [CAMP:Fall promo] [AD:Before and after] [QA:w] ', created: ago(2) },
    // a saved quote from 172 days ago: price runs out in 10 days
    { id:'e1', type:'ENQUIRY', name:'Expiring Ed', phone:'6363750008', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called', crmnotes:'[QA:w] [ATT:1@' + day(170) + '] [T1:' + ago(170) + '] ', created: ago(172) },
    // a quote from 100 days ago: not yet
    { id:'e2', type:'ENQUIRY', name:'Early Earl', phone:'6363750009', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called', crmnotes:'[QA:w] ', created: ago(100) },
    // accounts closed: 100 days ago for cost (win-back due); 100 days ago for non-payment (never); 30 days ago (not yet)
    { id:'w1', type:'SAVED', name:'Gone Gina', phone:'6363750010', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'cancelled', crmnotes:'[CD:2025-06-01] [CX:' + day(100) + '] [CXR:price] ', created: ago(500) },
    { id:'w2', type:'SAVED', name:'Owed Oscar', phone:'6363750011', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'cancelled', crmnotes:'[CD:2025-06-01] [CX:' + day(100) + '] [CXR:nonpay] ', created: ago(500) },
    { id:'w3', type:'SAVED', name:'Recent Rae', phone:'6363750012', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'cancelled', crmnotes:'[CD:2025-06-01] [CX:' + day(30) + '] [CXR:moved] ', created: ago(500) },
    // a full story
    { id:'s1', type:'ENQUIRY', name:'Story Sam', phone:'6363750013', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[ATT:2@2026-10-03] [TX:1@2026-10-04] [T1:2026-10-02T15:00:00Z] [CD:2026-10-06] [SD:2026-10-09] [RV:2026-10-25] [QA:a] [BY:Corey~2026-10-25] ', created: '2026-10-01T14:00:00Z' },
  ];
  stubNetwork(p, {});
  // a stub sheet that remembers updates, as the real one does, so a reload
  // after an action does not quietly put the old row back
  await p.route('**/script.google.com/**', r => {
    if (r.request().method() === 'POST'){
      let body = {}; try { body = JSON.parse(r.request().postData()); } catch (e) {}
      posts.push(body);
      if (body.action === 'update'){ const row = rows.find(x => x.id === body.id); if (row){ if (body.notes != null) row.crmnotes = body.notes; if (body.status) row.status = body.status; } }
    }
    return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
  });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
  const t = async (id) => (await p.textContent('#card-' + id)).replace(/\s+/g, ' ');

  /* ---- the story on a card ---- */
  await p.click('#morebtn-s1'); await p.waitForTimeout(200);
  const story = (await p.textContent('#card-s1 .story')).replace(/\s+/g, ' ');
  ok('the story runs in date order', /Oct 1 asked for a price.*Oct 2 first contact.*Oct 3 2 calls by then.*Oct 4 1 text by then.*Oct 6 active.*Oct 9 first visit.*Oct 25 review asked/.test(story), story);
  ok('and says who last touched it', /last touched by Corey 2026-10-25/.test(story));

  /* ---- quote about to run out ---- */
  ok('a 172-day-old saved quote warns with the days left and a text', /Price locked until .* 10 days left/.test(await t('e1')) && await p.$eval('#card-e1 a[href^="sms:"]', e => /locked in until/.test(decodeURIComponent(e.getAttribute('href')))), await t('e1'));
  ok('a 100-day-old quote does not warn yet', !/Price locked until/.test(await t('e2')));

  /* ---- win-back for a closed account ---- */
  ok('an account closed 100 days ago for cost gets the win-back offer', /Gone 100 days — worth a win-back text/.test(await t('w1')), await t('w1'));
  ok('one closed for non-payment never does', !/win-back/.test(await t('w2')));
  ok('one closed 30 days ago, not yet', !/win-back/.test(await t('w3')));
  await p.click('#card-w1 button:has-text("Mark as sent")'); await p.waitForTimeout(300);
  ok('marking it sent stamps the date', posts.some(x => x.action === 'update' && x.id === 'w1' && /\[WC:2026-11-05\]/.test(x.notes)) && /Win-back text sent 2026-11-05/.test(await t('w1')));

  /* ---- behind on payment ---- */
  await p.click('#card-u4 button:has-text("Behind on payment")'); await p.waitForTimeout(500);
  ok('the two questions were asked', dialogs.some(d => /How much/.test(d)) && dialogs.some(d => /Behind since/.test(d)), dialogs.join(' | '));
  ok('the card shows the amount and since when', /\$120 behind on payment since/.test(await t('u4')), await t('u4'));
  ok('the sheet gets the marker', posts.some(x => x.action === 'update' && x.id === 'u4' && /\[OW:120@2026-09-01\]/.test(x.notes)));
  await p.click('button:has-text("Daily brief")'); await p.waitForTimeout(300);
  const brief = await p.textContent('#brief-body');
  ok('the brief lists who is behind and the total', /1 customer behind on payment, \$120 in all:/.test(brief) && /Pat Exact — \$120 since 2026-09-01/.test(brief), brief.slice(0, 400));
  ok('the brief lists the expiring quote', /1 quote about to run out/.test(brief) && /Expiring Ed — \$85\/mo — 10 days left/.test(brief));
  ok('the closed account marked sent is no longer listed for a win-back', !/closed account gone 90\+ days/.test(brief));
  await p.click('button:has-text("Daily brief")'); await p.waitForTimeout(200);
  await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', 'open'); } catch (e) {} });
  await p.click('#numbersBtn'); await p.waitForTimeout(1200);
  ok('the revenue card says what is on the books but not in the bank', /\$120 behind on payment from 1 customer/.test((await p.textContent('#revenue')).replace(/\s+/g, ' ')), (await p.textContent('#revenue')).replace(/\s+/g, ' ').slice(0, 300) + ' | display=' + (await p.$eval('#revenue', e => e.style.display)));

  /* ---- money left on the table ---- */
  const ut = (await p.textContent('#undertable')).replace(/\s+/g, ' ');
  ok('Becky at $55 against the table\'s $91: +$36', /Becky Under.*\$55 → \$91 \+\$36/.test(ut), ut.slice(0, 300));
  ok('Sarah\'s deodorize add-on is set aside before comparing: $80 against $91, +$11', /Sarah Add.*\$80 → \$91 \+\$11/.test(ut), ut.slice(0, 400));
  ok('Pat at the table price is not listed; five dogs is not compared', !/Pat Exact/.test(ut) && !/Karen Five/.test(ut));
  ok('the total is the sum', /\$47\/mo.*\$564 a year, across 2 customers/.test(ut), ut.slice(0, 200));

  /* ---- which ad ---- */
  const ins = (await p.textContent('#insights')).replace(/\s+/g, ' ');
  ok('the by-ad section lists campaign and ad with quotes, won and customers', /By ad.*Fall promo › Yard sign video.*2 quotes · 1 won · 1 customer/.test(ins) && /Fall promo › Before and after.*1 quote · 0 won · 0 customers/.test(ins), ins.slice(ins.indexOf('By ad'), ins.indexOf('By ad') + 300));

  /* ---- who did what ---- */
  await p.click('#whoBtn'); await p.waitForTimeout(300);
  ok('naming the phone', /Jesse/.test(await p.textContent('#whoBtn')) && (await p.evaluate(() => localStorage.getItem('clpps_who'))) === 'Jesse');
  await p.click('#card-e2 button:has-text("+1 attempt")'); await p.waitForTimeout(300);
  ok('an attempt is signed with the name and the day', posts.some(x => x.action === 'update' && x.id === 'e2' && /\[BY:Jesse~2026-11-05\]/.test(x.notes)), JSON.stringify(posts.filter(x => x.id === 'e2').slice(-1)));
  await p.click('#morebtn-e2'); await p.waitForTimeout(200);
  ok('and the story shows it', /last touched by Jesse 2026-11-05/.test((await p.textContent('#card-e2 .story')).replace(/\s+/g, ' ')));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
