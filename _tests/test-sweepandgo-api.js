/* The Sweep&Go connection. Jesse: "Set up everything you can, make it work
   for me." The nightly sync in the script pulls clients, subscriptions,
   dispatch pins, invoices and payments; the tracker shows the sync line,
   uses the pins, and reads billed / collected / owed from the backend. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

/* ---- the backend's pure parts, run outside Apps Script ---- */
{
  const gs = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8');
  ok('code.txt is byte-identical to apps-script.gs', gs === fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'code.txt'), 'utf8'));
  ok('the token and the webhook word come from script properties, never the file', /getProperty\('SG_TOKEN'\)/.test(gs) && /getProperty\('SG_HOOK'\)/.test(gs) && !/Bearer kJ/.test(gs));
  ok('the webhook is answered before the size and JSON checks, by the secret word in the address', /if \(qp\.hook\) return json_\(sgHook_\(qp\.hook, e\)\);/.test(gs) && gs.indexOf('if (qp.hook)') < gs.indexOf("body.action === 'list'"));
  ok('billing and sync need the key', /action === 'billing'[^]*?bad pin/.test(gs) && /action === 'sgsync'[^]*?bad pin/.test(gs));
  const X = new Function(gs + '\nreturn { sgPlan_, sgMonthly_, sgDayKeys_, sgSetMarkers_, sgReason_, sgSource_, sgDigits_, BILLING_HEADERS };')();
  ok('frequency words become plan words', X.sgPlan_('once_a_week') === 'weekly' && X.sgPlan_('two_times_a_week') === 'twice a week' && X.sgPlan_('bi_weekly') === 'every other week' && X.sgPlan_('1d-bW') === 'every other week' && X.sgPlan_('once_a_month') === 'monthly' && X.sgPlan_('2d-2xW') === 'twice a week' && X.sgPlan_('3d-1xW') === 'weekly', [X.sgPlan_('1d-bW'), X.sgPlan_('2d-2xW')].join());
  ok('a monthly subscription is its price; per-cleanup billing is multiplied up', X.sgMonthly_({ price: 85, billing_interval: 'monthly' }, 'weekly') === 85 && Math.round(X.sgMonthly_({ price: 20, billing_interval: 'per_cleanup' }, 'weekly')) === 87 && Math.round(X.sgMonthly_({ price: 20, billing_interval: 'weekly' }, 'weekly')) === 87);
  ok('service days read one or two days', X.sgDayKeys_('Monday') === 'mon' && X.sgDayKeys_('Tuesday, Friday') === 'tue,fri' && X.sgDayKeys_('') === '');
  ok('the markers Sweep&Go owns are replaced, the office ones kept', X.sgSetMarkers_('[FU:2026-12-01] [DAY:mon] [CD:2026-01-01] gate 4321', { DAY: 'thu', CD: '2026-02-02', CX: '' }) === '[CD:2026-02-02] [DAY:thu] [FU:2026-12-01] gate 4321', X.sgSetMarkers_('[FU:2026-12-01] [DAY:mon] [CD:2026-01-01] gate 4321', { DAY: 'thu', CD: '2026-02-02', CX: '' }));
  ok('termination reasons map to the tracker\'s tags', X.sgReason_('Too expensive') === 'price' && X.sgReason_('Moving out of state') === 'moved' && X.sgReason_('Dog passed away') === 'nodog' && X.sgReason_('') === '' && X.sgReason_('because') === 'other');
  ok('the source reads the ad tag first, then how they heard', X.sgSource_({ tracking_field: 'utm_source=facebook&utm_medium=paid' }) === 'Meta Ads' && X.sgSource_({ how_heard_answer: 'A friend referred me' }) === 'Referral' && X.sgSource_({}) === '');
  ok('phones are the last ten digits', X.sgDigits_('+1 (636) 375-4342') === '6363754342' && X.sgDigits_('4342') === '');
  // the billing fold, against a fake sheet
  const H = X.BILLING_HEADERS;
  const row = (o) => H.map(h => o[h] == null ? '' : o[h]);
  const rows = [
    row({ kind:'invoice', number:'1', date:'2026-07-02', client:'Dana Deo', type:'subscription', status:'paid', total:'85.00', paid:'85.00', remaining:'0.00' }),
    row({ kind:'invoice', number:'2', date:'2026-07-05', client:'Eddie Eow', type:'subscription', status:'overdue', total:'95.00', paid:'0.00', remaining:'95.00' }),
    row({ kind:'invoice', number:'3', date:'2026-07-09', client:'Voided Vic', type:'subscription', status:'voided', total:'500.00', paid:'0.00', remaining:'500.00' }),
    row({ kind:'invoice', number:'4', date:'2026-07-12', client:'Once Olga', type:'one-time', status:'paid', total:'75.00', paid:'75.00', remaining:'0.00' }),
    row({ kind:'invoice', number:'5', date:'2026-08-02', client:'Eddie Eow', type:'subscription', status:'draft', total:'95.00', paid:'0.00', remaining:'' }),
    row({ kind:'payment', date:'2026-07-02', client:'Dana Deo', type:'credit_card', status:'succeeded', total:'85', paid:'85' }),
    row({ kind:'payment', date:'2026-07-06', client:'Eddie Eow', type:'credit_card', status:'failed', total:'95', paid:'95' }),
    row({ kind:'payment', date:'2026-07-12', client:'Once Olga', type:'check', status:'succeeded', total:'75', paid:'75' }),
  ];
  const fake = { getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) };
  const billing = new Function(gs + '\nbillingSheet_ = function(){ return FAKE; };\nreturn sgBilling_;').call(null)
  const sgBilling = new Function('FAKE', gs + '\nbillingSheet_ = function(){ return FAKE; };\nreturn sgBilling_();')(fake);
  ok('July: billed without the void, one-time apart, collected from succeeded payments, unpaid from what remains', sgBilling.months['2026-07'] && sgBilling.months['2026-07'].billed === 255 && sgBilling.months['2026-07'].onetime === 75 && sgBilling.months['2026-07'].collected === 160 && sgBilling.months['2026-07'].unpaid === 95 && sgBilling.months['2026-07'].failed === 1 && sgBilling.months['2026-07'].customers === 2, JSON.stringify(sgBilling.months));
  ok('a draft with no remaining figure counts in full', sgBilling.months['2026-08'].unpaid === 95);
  ok('who owes what, biggest first, with the statuses and the oldest date', sgBilling.unpaid.length === 1 && sgBilling.unpaid[0].name === 'Eddie Eow' && sgBilling.unpaid[0].owed === 190 && sgBilling.unpaid[0].statuses.overdue === 1 && sgBilling.unpaid[0].statuses.draft === 1 && sgBilling.unpaid[0].oldest === '2026-07-05', JSON.stringify(sgBilling.unpaid));
}

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1500 } });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-12T15:00:00Z') });   // a Thursday
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const posts = [];
  const rows = [
    // pinned by the sync: an exact spot, not the ZIP centre
    { id:'D1', type:'SAVED', name:'Dana Deo', phone:'6363750001', email:'dana@gmail.com', zip:'63376', address:'1 Oak St, St. Peters, MO 63376', dogs:'2', service:'weekly', deodorize:'every visit ($15/treatment)', price:'$151/mo (includes $60 deodorize)', status:'closed', crmnotes:'[CD:2026-06-01] [DAY:thu] [LL:38.79123,-90.60111] [SGID:rcl_ABC] [QA:a] ', created:'2026-06-01T12:00:00Z' },
    { id:'E1', type:'SAVED', name:'Eddie Eow', phone:'6363750002', email:'eddie@gmail.com', zip:'63366', address:'2 Pine St, O\'Fallon, MO 63366', dogs:'1', service:'every other week', deodorize:'no', price:'$95/mo', status:'closed', crmnotes:'[CD:2026-07-01] [DAY:thu] [QA:a] ', created:'2026-07-01T12:00:00Z' },
    { id:'k1', type:'CONFIG', name:'sg_last_sync', notes: JSON.stringify({ at:'2026-11-12T09:00:00Z', clients: 94, added: 2, updated: 11, pinned: 90, invoices: 1200, errors: [] }), status:'config', crmnotes:'', created:'2026-11-12T09:00:00Z' },
    { id:'k2', type:'CONFIG', name:'sg_routes', notes: JSON.stringify({ '2026-11-12': [{ who:'Jesse Duncan', min: 250, drive: 70, clean: 180, mi: 61.5, jobs: 20, price: 540 }] }), status:'config', crmnotes:'', created:'2026-11-12T09:00:00Z' },
    { id:'v1', type:'VIEW', name:'home', zip:'', yard:'s1', service:'Direct', notes:'how=none', created:'2026-11-12T14:50:00Z' },
  ];
  const billing = { ok:true, rows: 9, months: {
    '2026-10': { billed: 8144, onetime: 75, collected: 6332, unpaid: 1712, failed: 27, invoices: 95, customers: 90 },
    '2026-11': { billed: 8078, onetime: 0, collected: 6796, unpaid: 2154, failed: 16, invoices: 92, customers: 86 } },
    unpaid: [ { name:'Eddie Eow', owed: 190, n: 2, oldest:'2026-10-05', statuses: { overdue: 1, draft: 1 } }, { name:'Nobody Known', owed: 65, n: 1, oldest:'2026-11-01', statuses: { failed: 1 } } ] };
  stubNetwork(p, {});
  await p.route('**/script.google.com/**', r => {
    let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (body.action) posts.push(body);
    if (body.action === 'billing') return r.fulfill({ contentType:'application/json', body: JSON.stringify(billing) });
    if (body.action === 'sgsync') return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, clients: 94, added: 0, updated: 3, errors: [] }) });
    return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
  });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);

  /* ---- the sync line ---- */
  const health = (await p.textContent('#health')).replace(/\s+/g, ' ');
  ok('the health line says when Sweep&Go last synced and what it did', /Sweep&Go: synced 6h ago · 94 clients · 2 new · 11 updated/.test(health), health);
  await p.click('#health button:has-text("Sync now")'); await p.waitForTimeout(600);
  ok('Sync now asks the script, signed', posts.some(x => x.action === 'sgsync' && x.key));
  ok('and says what came back', /Synced: 94 clients, 0 new, 3 updated/.test(await p.textContent('#toast')), await p.textContent('#toast'));

  /* ---- the pins and the route ---- */
  ok('a customer with a Sweep&Go pin is placed exactly, not at the ZIP centre', await p.evaluate(() => { const r = routePt(leads.filter(l => l.id === 'D1')[0]); return !r.approx && Math.abs(r.pt[0] - 38.79123) < 1e-6; }));
  ok('one without still sits at the ZIP centre', await p.evaluate(() => routePt(leads.filter(l => l.id === 'E1')[0]).approx === true));
  await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', 'open'); } catch (e) {} });
  await p.click('#numbersBtn'); await p.waitForTimeout(1200);
  await p.evaluate(() => foldAll(true)); await p.waitForTimeout(200);
  const sched = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
  ok('the routes block counts the pinned home', /1 home pinned to the street, 1 placed at the ZIP centre/.test(sched), sched.slice(sched.indexOf('home'), sched.indexOf('home') + 80));
  ok('the Day plan shows Sweep&Go\'s own plan for today beside the estimate', /Sweep&Go’s plan for 2026-11-12 \(Jesse Duncan\): 20 jobs, 62 mi, 4h 10m with 1h 10m driving, \$540/.test(sched), sched.slice(sched.indexOf('Sweep&Go’s plan'), sched.indexOf('Sweep&Go’s plan') + 120));

  /* ---- the billing card ---- */
  ok('opening the panel fetched the billing fold, signed', posts.some(x => x.action === 'billing' && x.key));
  const bill = (await p.textContent('#billing')).replace(/\s+/g, ' ');
  ok('this month billed and collected, with last month beside each', /\$8,078\s*billed Nov · \$8,144 last month/.test(bill) && /\$6,796\s*collected Nov · \$6,332 last month/.test(bill), bill.slice(0, 400));
  ok('the year so far, and what is still unpaid', /\$16,222\s*billed 2026 · \$13,128 collected/.test(bill) && /\$3,866\s*invoiced this year, still unpaid/.test(bill), bill.slice(0, 500));
  ok('who owes what, with Draft explained', /Owed\s*2 customers · \$255/.test(bill) && /Eddie Eow 1 overdue, 1 draft · since 2026-10-05\s*\$190/.test(bill) && /Draft means Sweep&Go generated it and never sent it/.test(bill), bill.slice(bill.indexOf('Owed'), bill.indexOf('Owed') + 300));
  ok('somebody not in the tracker is listed without a link', /Nobody Known 1 failed/.test(bill) && (await p.$$('#billing a:has-text("Nobody Known")')).length === 0);
  await p.click('#billing button:has-text("On their card")'); await p.waitForTimeout(400);
  const owed = posts.find(x => x.action === 'update' && x.id === 'E1' && /\[OW:190@2026-10-05\]/.test(x.notes));
  ok('one tap puts the amount and the date on their card', !!owed, JSON.stringify(posts.filter(x => x.id === 'E1').slice(-1)));
  ok('and the card shows it', /\$190 behind on payment since/.test((await p.textContent('#card-E1')).replace(/\s+/g, ' ')));
  ok('the closed heading carries the month', /\$8,078 billed · \$6,796 in · \$255 owed/.test(await p.$eval('#billing .fsum', e => e.textContent)), await p.$eval('#billing .fsum', e => e.textContent));
  await p.click('#importBtn'); await p.waitForTimeout(300);
  ok('the import panel says the uploads are a one-off now', /Connected to Sweep&Go\. Customers, service days, prices and billing sync every night/.test(await p.textContent('#sg-auto')));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
