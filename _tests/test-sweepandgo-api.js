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
  ok('tips ride along with succeeded payments', sgBilling.months['2026-07'].tips === 0);
  // declining cards: a failure with nothing good after it, inside 60 days (today is real time here, so use recent dates)
  const recent = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10), older = new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10);
  const rows2 = rows.concat([
    row({ kind:'payment', date: older, client:'Card Carl', type:'credit_card', status:'succeeded', total:'85', paid:'85', remaining:'5.00' }),
    row({ kind:'payment', date: recent, client:'Card Carl', type:'credit_card', status:'failed', total:'85', paid:'85' }),
    row({ kind:'payment', date: older, client:'Fixed Fay', type:'credit_card', status:'failed', total:'85', paid:'85' }),
    row({ kind:'payment', date: recent, client:'Fixed Fay', type:'credit_card', status:'succeeded', total:'85', paid:'85', remaining:'3.00' }),
  ]);
  const fake2 = { getLastRow: () => rows2.length + 1, getRange: () => ({ getValues: () => rows2 }) };
  const b2 = new Function('FAKE', gs + '\nbillingSheet_ = function(){ return FAKE; };\nreturn sgBilling_();')(fake2);
  ok('a card that failed last, with nothing since, is listed; one that recovered is not', b2.declining.length === 1 && b2.declining[0].name === 'Card Carl' && b2.declining[0].amount === 85, JSON.stringify(b2.declining));
  ok('tips are summed by month from succeeded payments', b2.months[recent.slice(0, 7)].tips + (b2.months[older.slice(0, 7)].tips || 0) === 8 || (recent.slice(0, 7) === older.slice(0, 7) && b2.months[recent.slice(0, 7)].tips === 8), JSON.stringify(b2.months));
  // the jobs fold
  const JH = new Function(gs + '\nreturn JOBS_HEADERS;')();
  const jrow = (o) => JH.map(h => o[h] == null ? '' : o[h]);
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const jrows = [
    jrow({ date: d(1), client:'Dana Deo', zip:'63376', status:'completed', minutes:'12.5', dogs:'2', plan:'once_a_week', price:'35', tech:'Jesse Duncan' }),
    jrow({ date: d(1), client:'Eddie Eow', zip:'63366', status:'completed', minutes:'8', dogs:'1', plan:'bi_weekly', price:'44', tech:'Jesse Duncan' }),
    jrow({ date: d(1), client:'Skip Sam', zip:'63376', status:'skipped', skip_reason:'Gate locked', minutes:'0', dogs:'1' }),
    jrow({ date: d(2), client:'Ann A', zip:'63376', status:'completed', minutes:'9', dogs:'1', price:'20' }),
    jrow({ date: d(2), client:'Bob B', zip:'63376', status:'completed', minutes:'7', dogs:'1', price:'20' }),
    jrow({ date: d(2), client:'Cat C', zip:'63376', status:'completed', minutes:'10', dogs:'1', price:'20' }),
    jrow({ date: d(2), client:'Dee D', zip:'63376', status:'completed', minutes:'6', dogs:'1', price:'20' }),
    jrow({ date: d(2), client:'Long Lou', zip:'63376', status:'completed', minutes:'400', dogs:'1', price:'20' }),   // a timer left running: ignored for minutes, counted as a visit
    jrow({ date: d(40), client:'Old Otto', zip:'63376', status:'completed', minutes:'9', dogs:'1', price:'20' }),   // outside 30 days
  ];
  const fakeJ = { getLastRow: () => jrows.length + 1, getRange: () => ({ getValues: () => jrows }) };
  const J = new Function('FAKE', gs + '\njobsSheet_ = function(){ return FAKE; };\nreturn sgJobs_();')(fakeJ);
  ok('the jobs fold: visits in the window, timed ones, skips with reasons', J.visits === 7 && J.timed === 6 && J.skipped === 1 && J.skipReasons['Gate locked'] === 1 && !J.byDate[d(40)], JSON.stringify(J));
  ok('median minutes by dog count, so one runaway timer does not pull it', J.byDogs['1'].n === 5 && J.byDogs['1'].median === 8 && J.byDogs['2'].median === 12.5, JSON.stringify(J.byDogs));
  ok('minutes parse from a duration or from the clock times', new Function(gs + '\nreturn sgMinutes_;')()({ duration: '9:26' }) > 9.4 && Math.round(new Function(gs + '\nreturn sgMinutes_;')()({ start_time: '2026-07-13 04:30:00', end_time: '2026-07-13 04:42:00' })) === 12);
  ok('the sync writes pauses, opt-outs and stop estimates', /PZ: \(sub && sub\.paused && sub\.pause\)/.test(gs) && /set\.NOEM = '1'/.test(gs) && /set2\.ET = String\(pin\.est\)/.test(gs) && /leads\/list/.test(gs) && /completed_jobs_report/.test(gs));
  ok('who owes what, biggest first, with the statuses and the oldest date', sgBilling.unpaid.length === 1 && sgBilling.unpaid[0].name === 'Eddie Eow' && sgBilling.unpaid[0].owed === 190 && sgBilling.unpaid[0].statuses.overdue === 1 && sgBilling.unpaid[0].statuses.draft === 1 && sgBilling.unpaid[0].oldest === '2026-07-05', JSON.stringify(sgBilling.unpaid));
}

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1500 } });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-12T15:00:00Z') });   // a Thursday
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const posts = [], sgcreates = [], pricemoves = [];
  p.on('dialog', d => d.accept());
  const rows = [
    // pinned by the sync: an exact spot, not the ZIP centre
    { id:'D1', type:'SAVED', name:'Dana Deo', phone:'6363750001', email:'dana@gmail.com', zip:'63376', address:'1 Oak St, St. Peters, MO 63376', dogs:'2', service:'weekly', deodorize:'every visit ($15/treatment)', price:'$151/mo (includes $60 deodorize)', status:'closed', crmnotes:'[CD:2026-06-01] [DAY:thu] [LL:38.79123,-90.60111] [SGID:rcl_ABC] [QA:a] ', created:'2026-06-01T12:00:00Z' },
    // paused in Sweep&Go until next month: off the route, still a customer; and a stop with Sweep&Go's own 14-minute estimate
    { id:'P1', type:'SAVED', name:'Paused Pat', phone:'6363750003', email:'pat@gmail.com', zip:'63376', address:'3 Ash St, St. Peters, MO 63376', dogs:'1', service:'weekly', deodorize:'no', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-05-01] [DAY:thu] [PZ:2026-11-01~2026-12-15] [QA:a] ', created:'2026-05-01T12:00:00Z' },
    { id:'E1', type:'SAVED', name:'Eddie Eow', phone:'6363750002', email:'eddie@gmail.com', zip:'63366', address:'2 Pine St, O\'Fallon, MO 63366', dogs:'1', service:'every other week', deodorize:'no', price:'$95/mo', status:'closed', crmnotes:'[CD:2026-07-01] [DAY:thu] [ET:14] [QA:a] ', created:'2026-07-01T12:00:00Z' },
    { id:'N1', type:'SAVED', name:'Near Ned', phone:'6363750008', email:'ned@gmail.com', zip:'63376', address:'5 Oak St, St. Peters, MO 63376', dogs:'1', service:'weekly', deodorize:'no', price:'$75/mo', status:'closed', crmnotes:'[CD:2026-08-01] [DAY:thu] [LL:38.79200,-90.60150] [WE:1@2026-08-02] [WE:2@2026-09-01] [RV:2026-09-01] [QA:a] ', created:'2026-08-01T12:00:00Z' },
    // accepted on the website, not in Sweep&Go yet: the card offers the sign-up
    { id:'A1', type:'ACTIVATE', name:'Ann Accept', phone:'6363750020', email:'ann@gmail.com', zip:'63376', address:'12 Elm St, St. Peters, MO 63376', dogs:'1', service:'weekly', deodorize:'no', price:'$85/mo', status:'called', crmnotes:'[HH:A friend or neighbor] [QA:a] ', created:'2026-11-11T12:00:00Z' },
    { id:'az1', type:'AUTH', name:'Ann Accept', zip:'A1', price:'$85/mo', service:'weekly', dogs:'1', email:'ann@gmail.com', created:'2026-11-11T13:00:00Z' },
    // a quiet quote the script emailed two days in
    { id:'F1', type:'ENQUIRY', name:'Quiet Quincy', phone:'6363750030', email:'quincy@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[FE:1@2026-11-10] [QA:w] ', created:'2026-11-08T12:00:00Z' },
    { id:'Q1', type:'DECLINED', name:'Quote Quinn', phone:'6363750010', email:'quinn@gmail.com', zip:'63376', address:'9 Oak St, St. Peters, MO 63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[LL:38.79300,-90.60200] [QA:d] too much', created:'2026-10-01T12:00:00Z' },
    { id:'k1', type:'CONFIG', name:'sg_last_sync', notes: JSON.stringify({ at:'2026-11-12T09:00:00Z', clients: 94, added: 2, updated: 11, pinned: 90, invoices: 1200, errors: [] }), status:'config', crmnotes:'', created:'2026-11-12T09:00:00Z' },
    { id:'k2', type:'CONFIG', name:'sg_routes', notes: JSON.stringify({ '2026-11-12': [{ who:'Jesse Duncan', min: 250, drive: 70, clean: 180, mi: 61.5, jobs: 20, price: 540 }], '2026-11-11': [{ who:'Jesse Duncan', min: 230, drive: 60, clean: 170, mi: 50, jobs: 18, price: 500 }], '2026-11-10': [{ who:'Jesse Duncan', min: 240, drive: 60, clean: 180, mi: 50, jobs: 20, price: 560 }] }), status:'config', crmnotes:'', created:'2026-11-12T09:00:00Z' },
    { id:'v1', type:'VIEW', name:'home', zip:'', yard:'s1', service:'Direct', notes:'how=none', created:'2026-11-12T14:50:00Z' },
  ];
  const billing = { ok:true, rows: 9, months: {
    '2026-10': { billed: 8144, onetime: 75, collected: 6332, unpaid: 1712, failed: 27, invoices: 95, customers: 90 },
    '2026-11': { billed: 8078, onetime: 0, collected: 6796, unpaid: 2154, failed: 16, invoices: 92, customers: 86 } },
    unpaid: [ { name:'Eddie Eow', owed: 190, n: 2, oldest:'2026-10-05', statuses: { overdue: 1, draft: 1 } }, { name:'Nobody Known', owed: 65, n: 1, oldest:'2026-11-01', statuses: { failed: 1 } } ],
    declining: [ { name:'Eddie Eow', when:'2026-11-08', amount: 95 } ] };
  stubNetwork(p, {});
  await p.route('**/api.open-meteo.com/**', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ daily: { time: ['2026-11-12','2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17','2026-11-18'], precipitation_probability_max: [60, 10, 0, 0, 20, 70, 5], temperature_2m_min: [41, 38, 36, 40, 44, 47, 45], temperature_2m_max: [55, 52, 50, 58, 61, 59, 57] } }) }));
  await p.route('**/script.google.com/**', r => {
    let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (body.action) posts.push(body);
    if (body.action === 'billing') return r.fulfill({ contentType:'application/json', body: JSON.stringify(billing) });
    if (body.action === 'jobs') return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, days: 30, visits: 310, minutes: 2790, timed: 300, skipped: 4, skipReasons: { 'Gate locked': 3, 'Client request': 1 }, skippedBy: { 'Eddie Eow': 2, 'Someone Else': 1 }, rate: { byPlan: { weekly: { n: 250, price: 5000, min: 2250, perHour: 133 }, 'every other week': { n: 50, price: 2200, min: 540, perHour: 244 } }, byDogs: { '1': { n: 120, price: 2400, min: 840, perHour: 171 }, '2': { n: 140, price: 3500, min: 1540, perHour: 136 } }, byWeekday: { thu: { n: 60, price: 1500, min: 600, perHour: 150 } } }, byClient: { 'Dana Deo': { n: 4, med: 20, price: 35 }, 'Eddie Eow': { n: 2, med: 8, price: 44 }, 'Near Ned': { n: 4, med: 7, price: 20 } }, byDogs: { '1': { n: 120, median: 7 }, '2': { n: 140, median: 11 }, '3': { n: 40, median: 15 } }, byDate: { '2026-11-11': { visits: 18, skipped: 1, minutes: 170, price: 500 }, '2026-11-10': { visits: 20, skipped: 0, minutes: 190, price: 560 } }, techs: { 'Jesse Duncan': 310 } }) });
    if (body.action === 'sgcreate'){ sgcreates.push(body); return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, created:true, priceOk:false, sgPrice: 95, quoted: 85 }) }); }
    if (body.action === 'pricemove'){ pricemoves.push(body); return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, sent: body.items.map(i => i.id), failed: [], date: body.date }) }); }
    if (body.action === 'billingcsv') return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, rows: 2, csv: 'kind,number,date,client\ninvoice,1,2026-11-02,Dana Deo\npayment,,2026-11-02,Dana Deo\n', months: 'month,billed,one_time,collected,unpaid,tips,failed_payments,customers_invoiced\n2026-11,8078,0,6796,2154,40,16,86\n' }) });
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
  ok('the routes block counts the pinned home', /2 homes pinned to the street, 1 placed at the ZIP centre/.test(sched), sched.slice(sched.indexOf('home'), sched.indexOf('home') + 80));
  ok('a paused customer is off the day list but listed as paused, with the return date', /Thu\s*3 stops/.test(sched) && /Paused in Sweep&Go\s*1.*Paused Pat.*back 2026-12-15/.test(sched), sched.slice(sched.indexOf('Paused'), sched.indexOf('Paused') + 120));
  ok('and their card says so', /Paused in Sweep&Go until 2026-12-15 — off the route, still a customer/.test((await p.textContent('#card-P1')).replace(/\s+/g, ' ')));
  ok('the Day plan uses Sweep&Go\'s own minutes for a stop that has them', /2\. ~Eddie Eow[^]*?14 min/.test(sched) || /Eddie Eow[^]*?14 min · \$44/.test(sched), sched.slice(sched.indexOf('Eddie Eow'), sched.indexOf('Eddie Eow') + 120));
  /* ---- the Work done card ---- */
  const jobs = (await p.textContent('#jobs')).replace(/\s+/g, ' ');
  ok('visits, hours on site, the average stop, skips and the week\'s real miles', /310\s*visits done · 46h 30m on site/.test(jobs) && /9\s*minutes a stop, average · 300 timed/.test(jobs) && /4\s*skipped · Gate locked 3/.test(jobs) && /162\s*road miles this week, Sweep&Go’s count · 3 days/.test(jobs), jobs.slice(0, 400));
  ok('minutes a stop by dog count, measured', /1 dog 7 min \(120\) · 2 dogs 11 min \(140\) · 3 dogs 15 min \(40\)/.test(jobs));
  ok('and the offer to run the Day plan on the measured numbers', /Measured: 7 min, 4 per extra dog, 51 mph/.test(jobs), jobs.slice(jobs.indexOf('Measured'), jobs.indexOf('Measured') + 80));
  await p.click('#jobs button:has-text("Use the measured numbers")'); await p.waitForTimeout(400);
  const assume = await p.evaluate(() => routeAssume());
  ok('one tap sets them', assume.base === 7 && assume.perDog === 4 && assume.mph === 51, JSON.stringify(assume));
  ok('the day-by-day table pairs visits with the real miles', /Tue, Nov 10\s*20\s*3h 10m\s*50\s*1h/.test((await p.textContent('#jobs')).replace(/\s+/g, ' ')), (await p.textContent('#jobs')).replace(/\s+/g, ' ').slice(-300));
  ok('the closed heading carries the month\'s work', /310 visits · 46h 30m · 4 skipped/.test(await p.$eval('#jobs .fsum', e => e.textContent)));
  /* ---- dollars an hour ---- */
  const jobs2 = (await p.textContent('#jobs')).replace(/\s+/g, ' ');
  ok('dollars an hour on site and with driving, on the fold heading', /Dollars an hour\s*\$\d+ on site · \$\d+ with driving/.test(jobs2), jobs2.slice(jobs2.indexOf('Dollars'), jobs2.indexOf('Dollars') + 80));
  ok('by plan, best first; by dogs; by day', /every other week\s*50\s*11 min\s*\$244\s*weekly\s*250\s*9 min\s*\$133/.test(jobs2) && /1 dog\s*120\s*7 min\s*\$171/.test(jobs2) && /Thu\s*60\s*10 min\s*\$150/.test(jobs2), jobs2.slice(jobs2.indexOf('By plan'), jobs2.indexOf('By plan') + 260));
  /* ---- at risk ---- */
  const risk = (await p.textContent('#risk')).replace(/\s+/g, ' ');
  ok('Eddie: owed, card declining, skipped twice - at the top, with the reasons and a check-in text', /At risk/.test(risk) && /Eddie Eow/.test(risk) && /card declining since 2026-11-08 · \$190 owed since 2026-10-05 · 2 visits skipped in 30 days/.test(risk), risk.slice(0, 300));
  ok('one warning sign alone does not put somebody on the list', !/Dana Deo/.test(risk) && !/Near Ned/.test(risk));
  ok('the check-in text is ready and logs itself', await p.$eval('#risk a[href^="sms:"]', e => /Just checking in/.test(decodeURIComponent(e.getAttribute('href'))) && /textLead/.test(e.getAttribute('onclick'))));
  ok('the closed heading counts them', /1 to check in on/.test(await p.$eval('#risk .fsum', e => e.textContent)));
  /* ---- neighbour prospects ---- */
  const terr = (await p.textContent('#territory')).replace(/\s+/g, ' ');
  ok('two pinned customers within a quarter mile make a cluster, and the quote nearby that said no is named', /Neighbour prospects \(1\)/.test(terr) && /St\. Peters · Oak St 2 customers within a quarter mile: (Dana, Near|Near, Dana)/.test(terr) && /1 quote nearby never signed up: Quote Quinn \(said no\)/.test(terr), terr.slice(terr.indexOf('Neighbour prospects'), terr.indexOf('Neighbour prospects') + 260));
  /* ---- who earns their keep ---- */
  const keep = (await p.textContent('#undertable')).replace(/\s+/g, ' ');
  ok('dollars an hour per customer from measured minutes, price and the drive, worst first', /Who earns their keep\s*median \$\d+\/h · \d+ well under/.test(keep) && /Dana Deo 2 dogs · \$35 a visit · 20 min/.test(keep) && /Eddie Eow 1 dog · \$44 a visit · 8 min/.test(keep), keep.slice(keep.indexOf('Who earns'), keep.indexOf('Who earns') + 300));
  ok('the drive counts: Ned, seven minutes next to the start, beats Eddie\'s $44 with a ten-minute leg to O\'Fallon; Dana, 20 minutes for $35, is under the line', /Under the line\s*Dana Deo/.test(keep) && /Best\s*Near Ned 1 dog · \$20 a visit · 7 min \+ 0 drive\s*\$169\/h\s*Eddie Eow.*?\+ 10 drive\s*\$150\/h/.test(keep), keep.slice(keep.indexOf('Best'), keep.indexOf('Best') + 200));
  /* ---- when do we need a second person ---- */
  const hire = (await p.textContent('#hire')).replace(/\s+/g, ' ');
  ok('hours a week measured from Sweep&Go, net growth from the last three months, and a verdict in a sentence', /\d+(\.\d)?h\s*a week on the route now, measured/.test(hire) && /customers a month, net, last 3 months \(\d+ started, \d+ left\)/.test(hire) && /At this pace the route (stays under 40 hours a week for the next twelve months|reaches 40 hours a week in)/.test(hire), hire.slice(0, 400));
  ok('what the hire costs, in dollars and in customers', /A second person at 20 hours a week costs about \$1,559 a month, which is \d+ customers’ revenue/.test(hire), hire.slice(hire.indexOf('A second person'), hire.indexOf('A second person') + 160));
  await p.$eval('#hire [data-fold="hire-assume"]', e => e.classList.remove('folded'));
  await p.fill('#hr-cap', '12'); await p.click('#hire button:has-text("Save")'); await p.waitForTimeout(400);
  const hire2 = (await p.textContent('#hire')).replace(/\s+/g, ' ');
  ok('lower the cap and the month the route fills moves up, on the card and the closed heading', /reaches 12 hours a week in [A-Z][a-z]+ 20\d\d/.test(hire2) && /route fills [A-Z][a-z]{2} 20\d\d/.test(await p.$eval('#hire .fsum', e => e.textContent)), hire2.slice(hire2.indexOf('At this pace'), hire2.indexOf('At this pace') + 160));
  /* ---- follow-up emails: the switch, the card, the count ---- */
  ok('a quiet quote the script emailed says so on its card', /Follow-up email sent day 2 \(2026-11-10\)/.test((await p.textContent('#card-F1')).replace(/\s+/g, ' ')));
  ok('Insights counts them', /Follow-up emails\s*0 of 1/.test((await p.textContent('#insights')).replace(/\s+/g, ' ')));
  await p.click('#blastBtn'); await p.waitForTimeout(500);
  ok('the switch starts off and explains itself', !(await p.isChecked('#fu-auto-box')) && /Two days after a quote with no answer/.test(await p.textContent('#blastPanel')) && /1 emailed so far, 0 became customers/.test(await p.textContent('#fu-stat')));
  await p.click('#fu-auto-box'); await p.waitForTimeout(400);
  ok('ticking it writes the setting the script reads each morning', posts.some(x => x.action === 'lead' && x.lead && x.lead.type === 'CONFIG' && x.lead.name === 'fu_emails' && x.lead.notes === 'on' && x.key));
  /* ---- the welcome sequence: the switch, the card ---- */
  ok('a customer the script welcomed says so on his card, both emails, the second counted as the review ask', /Welcome emails sent day 1 \(2026-08-02\), day 30, with the review ask \(2026-09-01\)/.test((await p.textContent('#card-N1')).replace(/\s+/g, ' ')), (await p.textContent('#card-N1')).replace(/\s+/g, ' ').slice(0, 400));
  ok('the welcome switch starts off, explains the two emails and counts who got them', !(await p.isChecked('#we-auto-box')) && /The day after someone starts, a what-to-expect email/.test(await p.textContent('#blastPanel')) && /A month in, a how-are-we-doing with the Google review link/.test(await p.textContent('#blastPanel')) && (await p.textContent('#we-stat')).trim() === '1 customer welcomed so far.', await p.textContent('#we-stat'));
  await p.click('#we-auto-box'); await p.waitForTimeout(400);
  ok('ticking it writes the setting the 9am job reads', posts.some(x => x.action === 'lead' && x.lead && x.lead.type === 'CONFIG' && x.lead.name === 'welcome_emails' && x.lead.notes === 'on' && x.key));
  await p.click('#blastPanel button:has-text("Close")'); await p.waitForTimeout(200);
  /* ---- the price-move planner ---- */
  const ut = (await p.textContent('#undertable')).replace(/\s+/g, ' ');
  ok('Ned pays $75 against an $85 table, and sits on the left-on-the-table list with a box to tick', /Near Ned 1 dog weekly · 63376 [A-Za-z ]*\$75 → \$85 \+\$10/.test(ut) && (await p.$$('#undertable .pm-box[data-id="N1"]')).length === 1 && /Tick a customer to plan a price move/.test(ut), ut.slice(0, 300));
  await p.click('#undertable .pm-box[data-id="N1"]'); await p.waitForTimeout(300);
  const plan = (await p.textContent('#priceplan')).replace(/\s+/g, ' ');
  ok('ticking him opens the plan: the table price, thirty days out, and the email he would get', /Price move for 1 customer/.test(plan) && (await p.inputValue('#priceplan .pm-new[data-id="N1"]')) === '85' && (await p.inputValue('#pm-date')) === '2026-12-12' && /Hi Near, A quick note about your service, with plenty of notice\. Your price has been \$75 a month, and on December 12, 2026 it moves to \$85 a month\. Nothing else changes/.test(plan) && /— Corey/.test(plan), plan.slice(0, 500));
  await p.fill('#priceplan .pm-new[data-id="N1"]', '89'); await p.fill('#pm-date', '2027-01-01'); await p.type('#pm-reason', 'Fuel costs are up.'); await p.waitForTimeout(200);
  ok('changing the price, the date and the reason redraws the preview and keeps the cursor in the box', /it moves to \$89 a month\. Fuel costs are up\./.test(await p.textContent('#pm-preview')) && /January 1, 2027/.test(await p.textContent('#pm-preview')) && await p.evaluate(() => document.activeElement && document.activeElement.id === 'pm-reason'), await p.textContent('#pm-preview'));
  await p.click('#pm-send'); await p.waitForTimeout(600);
  ok('Send asks the script, signed, with who, the old and new price, the date and the reason', pricemoves.length === 1 && pricemoves[0].key && pricemoves[0].date === '2027-01-01' && pricemoves[0].reason === 'Fuel costs are up.' && JSON.stringify(pricemoves[0].items) === JSON.stringify([{ id:'N1', oldPrice: 75, newPrice: 89 }]), JSON.stringify(pricemoves));
  const nedAfter = (await p.textContent('#card-N1')).replace(/\s+/g, ' ');
  ok('his card now carries the move and the reminder to change it in Sweep&Go on the day', /Price moves to \$89\/mo on 2027-01-01 — notice sent\. Change it in Sweep&Go on the day/.test(nedAfter) && await p.evaluate(() => fuParse(leads.filter(l => l.id === 'N1')[0].crmnotes).pm === '89@2027-01-01'), nedAfter.slice(0, 400));
  ok('and the list says the notice went, with the box greyed so it is not sent twice', /notice sent, \$89 from 2027-01-01/.test((await p.textContent('#undertable')).replace(/\s+/g, ' ')) && await p.$eval('#undertable .pm-box[data-id="N1"]', e => e.disabled));
  ok('the toast counts it', /1 notice sent/.test(await p.textContent('#toast')), await p.textContent('#toast'));
  /* ---- month in review ---- */
  const [review] = await Promise.all([ctx.waitForEvent('page'), p.click('#billing button:has-text("Month in review")')]);
  await review.waitForLoadState(); await review.waitForTimeout(300);
  const rv = (await review.textContent('body')).replace(/\s+/g, ' ');
  ok('the review opens as its own page with the month, money, customers, work and what moved', /November 2026 in review/.test(rv) && /\$8,078\s*-1% vs Oct\s*billed/.test(rv) && /\$6,796\s*\+7% vs Oct\s*collected/.test(rv) && /active recurring customers/.test(rv) && /Work done, last 30 days\s*310\s*visits/.test(rv) && /What moved/.test(rv) && /Eddie Eow\s*\$190/.test(rv), rv.slice(0, 500));
  ok('and says in words that collections lag billing', /Collections are behind billing this month: \$1,282 invoiced and not yet in\. 16 card payments failed/.test(rv), rv.slice(rv.indexOf('What moved'), rv.indexOf('What moved') + 200));
  await review.close();
  ok('the Day plan shows Sweep&Go\'s own plan for today beside the estimate', /Sweep&Go’s plan for 2026-11-12 \(Jesse Duncan\): 20 jobs, 62 mi, 4h 10m with 1h 10m driving, \$540/.test(sched), sched.slice(sched.indexOf('Sweep&Go’s plan'), sched.indexOf('Sweep&Go’s plan') + 120));

  /* ---- the billing card ---- */
  ok('opening the panel fetched the billing fold, signed', posts.some(x => x.action === 'billing' && x.key));
  const bill = (await p.textContent('#billing')).replace(/\s+/g, ' ');
  ok('this month billed and collected, with last month beside each', /\$8,078\s*billed Nov · \$8,144 last month/.test(bill) && /\$6,796\s*collected Nov · \$6,332 last month/.test(bill), bill.slice(0, 400));
  ok('the year so far, and what is still unpaid', /\$16,222\s*billed 2026 · \$13,128 collected/.test(bill) && /\$3,866\s*invoiced this year, still unpaid/.test(bill), bill.slice(0, 500));
  ok('who owes what, with Draft explained', /Owed\s*2 customers · \$255/.test(bill) && /Eddie Eow 1 overdue, 1 draft · since 2026-10-05\s*\$190/.test(bill) && /Draft means Sweep&Go generated it and never sent it/.test(bill), bill.slice(bill.indexOf('Owed'), bill.indexOf('Owed') + 300));
  ok('cards declining are listed with the date and the amount', /Cards declining\s*1.*Eddie Eow failed 2026-11-08\s*\$95/.test(bill), bill.slice(bill.indexOf('Cards declining'), bill.indexOf('Cards declining') + 160));
  ok('somebody not in the tracker is listed without a link', /Nobody Known 1 failed/.test(bill) && (await p.$$('#billing a:has-text("Nobody Known")')).length === 0);
  await p.click('#billing button:has-text("On their card")'); await p.waitForTimeout(400);
  const owed = posts.find(x => x.action === 'update' && x.id === 'E1' && /\[OW:190@2026-10-05\]/.test(x.notes));
  ok('one tap puts the amount and the date on their card', !!owed, JSON.stringify(posts.filter(x => x.id === 'E1').slice(-1)));
  ok('and the card shows it', /\$190 behind on payment since/.test((await p.textContent('#card-E1')).replace(/\s+/g, ' ')));
  ok('the closed heading carries the month', /\$8,078 billed · \$6,796 in · \$255 owed/.test(await p.$eval('#billing .fsum', e => e.textContent)), await p.$eval('#billing .fsum', e => e.textContent));
  /* ---- for the accountant ---- */
  const dl1p = p.waitForEvent('download');
  await p.click('#billing button:has-text("For the accountant")');
  const dl1 = await dl1p, dl2 = await p.waitForEvent('download');
  const readDl = async (d) => { const fs2 = require('fs'); return fs2.readFileSync(await d.path(), 'utf8'); };
  ok('one tap asks the script, signed, and saves two files: the months, and every invoice and payment', posts.some(x => x.action === 'billingcsv' && x.key) && dl1.suggestedFilename() === 'clpps-billing-2026-by-month.csv' && dl2.suggestedFilename() === 'clpps-billing-2026-every-invoice-and-payment.csv', dl1.suggestedFilename() + ' ' + dl2.suggestedFilename());
  ok('with the script\'s rows in them, untouched', /^month,billed,one_time,collected,unpaid,tips,failed_payments,customers_invoiced\n2026-11,8078,0,6796,2154,40,16,86\n$/.test(await readDl(dl1)) && /^kind,number,date,client\ninvoice,1,2026-11-02,Dana Deo\npayment,,2026-11-02,Dana Deo\n$/.test(await readDl(dl2)));
  await p.click('#importBtn'); await p.waitForTimeout(300);
  ok('the import panel says the uploads are a one-off now', /Connected to Sweep&Go\. Customers, service days, prices and billing sync every night/.test(await p.textContent('#sg-auto')));
  /* ---- the automatic sign-up switch ---- */
  ok('the switch starts off', !(await p.isChecked('#sg-auto-box')));
  await p.click('#sg-auto-box'); await p.waitForTimeout(400);
  const cfgPost = posts.find(x => x.action === 'lead' && x.lead && x.lead.type === 'CONFIG' && x.lead.name === 'sg_auto_create');
  ok('ticking it writes the setting, signed, so the script can act on acceptances', cfgPost && cfgPost.lead.notes === 'on' && cfgPost.key, JSON.stringify(cfgPost));
  /* ---- sign-up from the card ---- */
  const ann = (await p.textContent('#card-A1')).replace(/\s+/g, ' ');
  ok('an accepted quote not yet in Sweep&Go offers the sign-up, and says how they heard', /AUTHORIZED the quoted price/.test(ann) && /Sign them up in Sweep&Go/.test(ann) && /How they heard of us: A friend or neighbor/.test(ann), ann.slice(0, 300));
  await p.click('#sgc-A1'); await p.waitForTimeout(500);
  ok('the script is asked, signed', sgcreates.length === 1 && sgcreates[0].id === 'A1' && sgcreates[0].key);
  const after = (await p.textContent('#card-A1')).replace(/\s+/g, ' ');
  ok('created: the card closes, stamps the date, and reminds you to set the price and the day in Sweep&Go', await p.evaluate(() => { const l = leads.filter(x => x.id === 'A1')[0]; return l.status === 'closed' && /^\d{4}-\d{2}-\d{2}$/.test(fuParse(l.crmnotes).sgc) && fuParse(l.crmnotes).qp === '85'; }) && /signed up in Sweep&Go 2026-11-12/.test(after) && /In Sweep&Go: set their price to \$85\/mo and assign their day/.test(after), after.slice(0, 300));
  ok('and says so in the toast', /is in Sweep&Go - now set their price to \$85 there/.test(await p.textContent('#toast')));
  /* ---- weather ---- */
  await p.evaluate(() => { schedDay = 'thu'; render(); }); await p.waitForTimeout(300);
  const dp = (await p.textContent('#dayplan')).replace(/\s+/g, ' ');
  ok('each day in the plan shows its rain chance and temperatures', /Thu today\s*☔ 60% 41–55°/.test(dp), dp.slice(0, 200));
  const deo = (await p.textContent('#deo')).replace(/\s+/g, ' ');
  ok('the Deodorize card reads the lows against the 50° line', /Lows this week 36–47°F, stay off\./.test(deo), deo.slice(0, 300));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
