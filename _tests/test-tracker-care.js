/* Looking after a lead once it is in.

   Jesse: "Right now it lets me edit it and change stuff but doesn't allow
   me to take away deodorizer." Plus the three things built alongside: the
   not-called clock, the same-person line, and the website-to-tracker
   health line. Fixed clock: a Wednesday at 2pm, so "hours ago" and the
   daytime rule mean one thing. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const NOW = new Date('2026-10-14T14:00:00Z');          // a Wednesday, 2pm in the browser's zone (UTC here)
const ago = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

(async () => {
  const b = await launch();
  const rows = [
    { id:'L1', type:'ENQUIRY', name:'Deo Dana', phone:'6363754342', email:'dana@gmail.com', zip:'63376', dogs:'2', service:'weekly',
      deodorize:'every visit ($15/treatment)', price:'$151/mo', status:'called', crmnotes:'[QA:w] [T1:' + ago(20) + '] ', created: ago(24) },
    { id:'L2', type:'ENQUIRY', name:'Hour Harry', phone:'6363754343', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: ago(2) },
    { id:'L3', type:'ENQUIRY', name:'Five Fiona', phone:'6363754344', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: ago(5) },
    { id:'L4', type:'ENQUIRY', name:'Fresh Fred', phone:'6363754345', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: ago(0.3) },
    { id:'L5', type:'DECLINED', name:'No Nora', phone:'6363754346', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:d] too much', created: ago(30) },
    { id:'L6', type:'ENQUIRY', name:'Called Carl', phone:'6363754347', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] [T1:' + ago(4) + '] ', created: ago(6) },
    // the same person as L3, by phone, from the spring: a repeat shopper
    { id:'L7', type:'DECLINED', name:'Fiona Earlier', phone:'(636) 375-4344', zip:'63376', dogs:'1', service:'weekly', price:'$81/mo', status:'new', crmnotes:'[QA:d] price', created: ago(24 * 120) },
    // the same person as L1 by email, now a closed customer
    { id:'L8', type:'ACTIVATE', name:'Dana Again', email:'Dana@Gmail.com', zip:'63376', dogs:'2', service:'weekly', price:'$91/mo', status:'closed', crmnotes:'[QA:a] [CD:2026-09-01] ', created: ago(24 * 50) },
  ];
  const views = [{ id:'v1', type:'VIEW', name:'home', zip:'', yard:'s1', service:'Direct', notes:'how=none', created: ago(10) }];

  /* ---- editing: deodorize can be taken off, and the price follows ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    await p.clock.install({ time: NOW });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const posts = [];
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} }
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows.concat(views) }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);

    const card = (await p.textContent('#card-L1')).replace(/\s+/g, ' ');
    ok('the card says deodorize while it is on', /deodorize/.test(card));
    await p.click('#card-L1 [onclick^="editLead"]'); await p.waitForTimeout(300);
    ok('the edit panel shows the deodorize setting', (await p.inputValue('#m-deo')) === 'every', await p.inputValue('#m-deo'));
    ok('and the ZIP', (await p.inputValue('#m-zip')) === '63376');
    await p.selectOption('#m-deo', 'no');
    await p.click('button:has-text("Recalculate price")'); await p.waitForTimeout(200);
    ok('recalculating without deodorize gives the engine price for 2 dogs weekly', (await p.inputValue('#m-price')) === '$91/mo', await p.inputValue('#m-price'));
    await p.click('#m-savebtn'); await p.waitForTimeout(400);
    const saved = posts.find(x => x.action === 'lead' && x.lead && x.lead.id === 'L1');
    ok('saving writes deodorize off and the new price', saved && saved.lead.deodorize === 'no' && saved.lead.price === '$91/mo', saved && JSON.stringify([saved.lead.deodorize, saved.lead.price]));
    ok('and keeps the ZIP', saved && saved.lead.zip === '63376');
    ok('the edit is silent (no email about a known customer)', saved && saved.lead.silent === 1);
    const after = (await p.textContent('#card-L1')).replace(/\s+/g, ' ');
    ok('the card no longer says deodorize', !/deodorize/.test(after), after.slice(0, 200));

    // Illinois: the engine will not price it, and says so instead of guessing
    await p.click('#card-L2 [onclick^="editLead"]'); await p.waitForTimeout(300);
    await p.fill('#m-zip', '62002');
    await p.fill('#m-price', '$82/mo');
    await p.click('button:has-text("Recalculate price")'); await p.waitForTimeout(200);
    ok('an Illinois ZIP leaves the typed price alone', (await p.inputValue('#m-price')) === '$82/mo');
    ok('and says it is priced by hand', /priced by hand/.test(await p.textContent('#toast')));
    await p.click('#m-savebtn'); await p.waitForTimeout(300);

    /* ---- the not-called clock ---- */
    const t = async (id) => (await p.textContent('#card-' + id)).replace(/\s+/g, ' ');
    const h2 = await p.$eval('#card-L2', e => { const d = [...e.querySelectorAll('div')].find(x => /Not called yet/.test(x.textContent)); return d ? [d.textContent.trim(), getComputedStyle(d).color] : null; });
    ok('L2 after 2h: amber, no "reach out" yet', h2 && /came in 2 hours ago/.test(h2[0]) && !/Reach out/.test(h2[0]) && h2[1] === 'rgb(180, 83, 9)', JSON.stringify(h2));
    const h5 = await p.$eval('#card-L3', e => { const d = [...e.querySelectorAll('div')].find(x => /Not called yet/.test(x.textContent)); return d ? [d.textContent.trim(), getComputedStyle(d).color] : null; });
    ok('L3 after 5h: red, "Reach out!"', h5 && /came in 5 hours ago\. Reach out!/.test(h5[0]) && h5[1] === 'rgb(192, 57, 43)', JSON.stringify(h5));
    ok('twenty minutes old: no clock yet', !/Not called yet/.test(await t('L4')));
    ok('said no on the site: no clock (the win-back email\'s job)', !/Not called yet/.test(await t('L5')));
    ok('an attempt was logged: no clock', !/Not called yet/.test(await t('L6')));

    /* ---- the same person twice ---- */
    ok('L3 is flagged as the same phone as the spring lead', /Same phone as Fiona Earlier \(.*said no, \$81\/mo\)/.test(await t('L3')), await t('L3'));
    ok('the earlier lead points back the other way', /Same phone as Five Fiona/.test(await t('L7')));
    ok('L8 matches L1 by email, case-insensitively', /Same email as Deo Dana/.test(await t('L8')));
    ok('a lead with no twin says nothing', !/Same (phone|email)/.test(await t('L2')));

    /* ---- the daily brief leads with the waiting ones, longest first ---- */
    await p.click('button:has-text("Daily brief")'); await p.waitForTimeout(300);
    const brief = await p.textContent('#brief-body');
    ok('the brief lists leads not called yet', /2 leads not called yet, longest wait first:/.test(brief), brief.slice(0, 300));
    const i3 = brief.indexOf('Five Fiona'), i2 = brief.indexOf('Hour Harry');
    ok('longest wait first, with the hours', i3 > 0 && i2 > i3 && /Five Fiona — \$85\/mo — 5h/.test(brief), brief.slice(i3, i3 + 60));

    /* ---- the health line ---- */
    const health = (await p.textContent('#health')).replace(/\s+/g, ' ');
    ok('ten daytime hours with no visit: the warning shows', /No website visits recorded for 10 hours/.test(health), health);
    ok('and it says when the last visit and lead arrived', /last visit 10h ago/.test(health) && /last lead/.test(health));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  /* ---- health line, the quiet case ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    await p.clock.install({ time: NOW });
    stubNetwork(p, { leads: rows.concat([{ id:'v2', type:'VIEW', name:'home', zip:'', yard:'s2', service:'Direct', notes:'how=none', created: ago(0.2) }]) });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    const health = (await p.textContent('#health')).replace(/\s+/g, ' ');
    ok('a visit twelve minutes ago: a plain line, no warning', /last visit 12 min ago/.test(health) && !/No website visits/.test(health), health);
    await ctx.close();
  }

  await b.close();
  done();
})();
