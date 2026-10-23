/* Importing the customer list from Sweep&Go.

   The tracker began in September 2026; the business began in 2024. The
   import reads Sweep&Go's three exports on the phone and writes every
   active subscription in as a closed customer with its real start date
   and price. Made-up customers here, in the exact shape of the exports. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ok, done } = reporter();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
const RES = path.join(dir, 'res.csv'), COM = path.join(dir, 'com.csv'), CLI = path.join(dir, 'cli.csv');
fs.writeFileSync(RES, [
  'Status,Revenue,Revenue Type,Tip,Billing Option,Billing Interval,End of Billing Period,Client Name,Start Date,End Date,Subs. Name,Termination Reason,Termination Comment,Address',
  '"Active","78.00","monthly","No data","Prepaid Fixed","Monthly","2026-11-01","Old Olive","2024-03-01","No data","Regular Plan - 2d-1xW","No data","No data","12 Elm St, St. Peters, Missouri 63376"',
  '"Active","17.00","per cleanup","No data","Postpaid Per Cleanup","Monthly","2026-11-01","Visit Vince","2024-03-03","No data","Regular Plan - 1d-1xW","No data","No data","9 Oak Dr., O\'Fallon, Missouri 63366"',
  '"Active","91.00","monthly","No data","Prepaid Fixed","Monthly","2026-11-01","Spray Sue","2026-02-04","No data","Regular Plan - 3d-1xW","No data","No data","5 Pine Ct, Wentzville, Missouri 63385"',
  '"Active","30.00","monthly","No data","Prepaid Fixed","Monthly","2026-11-01","Spray Sue","2026-06-05","No data","Deodorizing and Sanitizing Spray","No data","No data","5 Pine Ct, Wentzville, Missouri 63385"',
  '"Active","37.50","monthly","No data","Prepaid Fixed","Monthly","2026-11-01","Dot .","2026-07-08","No data","Regular Plan - 1d-bW","No data","No data","751 Rider Dr, Hazelwood, Missouri 63042"',
  '"Paused","30.00","monthly","No data","Prepaid Fixed","Monthly","2026-11-01","Pause Pete","2026-02-27","No data","Regular Plan - 1d-bW","No data","No data","624 Maran Dr, St. Charles, Missouri 63301"',
  '"Terminated","65.00","monthly","No data","Prepaid Fixed","Monthly","2026-05-01","Gone Gail","2025-01-10","2026-04-30","Regular Plan - 1d-1xW","Moved","No data","3 Ash Ln, Cottleville, Missouri 63304"',
  '"Active","82.00","monthly","No data","Prepaid Fixed","Monthly","2026-11-01","Stefany Freeman","2026-10-20","No data","Regular Plan - 1d-1xW","No data","No data","806 Lynn Haven Ln, Hazelwood, Missouri 63042"',
  '',
  '"Total:","8"',
  '"Cleanup Subscriptions:","7"',
].join('\n'));
fs.writeFileSync(COM, [
  ',,,,,,,,,,,,,Address',
  '"Active","60.00","per cleanup","No data","Postpaid Per Cleanup","Monthly","2026-10-28","Greens HOA - 14995 Green Cir","2024-11-18","No data","Pet waste stations (3)","No data","No data","662 Office Pkwy, Creve Coeur, Missouri 63141"',
  '',
  '"Total:","1"',
].join('\n'));
fs.writeFileSync(CLI, [
  '"First Name","Last Name","Email","Status","Cell Phone Number","Home Phone Number","Address","City","State","Zip Code","Referral Source","Referral Source Details","SMS Messaging Consent","Created At"',
  '"Old","Olive","olive@gmail.com","Active","(636) 555 - 0101","No data","12 Elm St","St. Peters","Missouri","63376","Search Engine","No data","Yes","2024-03-01"',
  '"Visit","Vince","vince@gmail.com","Active","No data","(636) 555 - 0102","9 Oak Dr.","O\'Fallon","Missouri","63366","Social Media","No data","Yes","2024-03-03"',
  '"Spray","Sue","sue@gmail.com","Active","(636) 555 - 0103","No data","5 Pine Ct","Wentzville","Missouri","63385","Referred By Family Or Friend","No data","Yes","2026-02-04"',
  '"Dot",".","dot@gmail.com","Active","(636) 555 - 0104","No data","751 Rider Dr","Hazelwood","Missouri","63042","Other","No data","Yes","2026-07-08"',
  '"Pause","Pete","pete@gmail.com","Active","(636) 555 - 0105","No data","624 Maran Dr","St. Charles","Missouri","63301","No data","No data","No","2026-02-27"',
  '"Gone","Gail","gail@gmail.com","Active","(636) 555 - 0106","No data","3 Ash Ln","Cottleville","Missouri","63304","Search Engine","No data","Yes","2025-01-10"',
  '"Stefany","Freeman","stefany.d.freeman@gmail.com","Active","(949) 390 - 4971","No data","806 Lynn Haven Ln","Hazelwood","Missouri","63042","Search Engine","No data","Yes","2026-10-20"',
  '"Never","Started","never@gmail.com","Active","(636) 555 - 0107","No data","1 Nowhere Rd","St. Peters","Missouri","63376","Search Engine","No data","Yes","2026-09-01"',
].join('\n'));

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1600 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const posts = [];
  const now = new Date().toISOString();
  // Stefany is already in the tracker from the website, status called, with a note
  const rows = [{ id:'p9493904971', type:'ACTIVATE', name:'Stefany Freeman', phone:'19493904971', email:'stefany.d.freeman@gmail.com', zip:'63042', dogs:'1', service:'weekly', price:'$107/mo', status:'called', crmnotes:'[ATT:1@2026-10-20] [SID:c] [SRC:Meta Ads] [QA:a] gate 4471', created: now }];
  stubNetwork(p, {});
  await p.route('**/script.google.com/**', r => {
    if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} }
    return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
  });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
  await p.click('#importBtn'); await p.waitForTimeout(300);
  await p.setInputFiles('#sg-res', RES); await p.setInputFiles('#sg-com', COM); await p.setInputFiles('#sg-cli', CLI);
  await p.click('button:has-text("Preview")'); await p.waitForTimeout(800);
  const out = (await p.textContent('#sg-out')).replace(/\s+/g, ' ');
  ok('the preview counts rows, clients and customers', /9 subscription rows, 8 clients → 8 customers/.test(out), out.slice(0, 160));
  ok('new versus already-here', /7 new to the tracker · 🔄 1 already here/.test(out), out.slice(0, 200));
  ok('the client with no plan is listed, not imported', /1 in the client list with no active plan/.test(out) && /Never Started/.test(out));
  ok('only the commercial account is missing a phone (it is not in the client list)', /1 had no phone[^:]*: Greens HOA/.test(out), out.slice(0, 400));
  await p.click('#sg-go');
  // snapshot as soon as the import says Done: a moment later the page
  // reloads and re-pushes rows the fake sheet "never saw", which a real
  // sheet would not do
  await p.waitForFunction(() => /^Done/.test(document.getElementById('sg-go').textContent), null, { timeout: 15000 });
  const sent = posts.filter(x => x.action === 'lead' && x.lead && x.lead.silent === 1).map(x => x.lead);
  await p.waitForTimeout(1800);
  ok('eight rows are written, all silent', sent.length === 8, String(sent.length));
  const by = {}; sent.forEach(l => { by[l.name] = l; });

  const olive = by['Old Olive'];
  ok('a plain monthly customer: closed, $78/mo, 2 dogs weekly, since 2024-03-01, id from the phone',
     olive && olive.status === 'closed' && olive.price === '$78/mo' && olive.dogs === '2' && olive.service === 'weekly' && /\[CD:2024-03-01\]/.test(olive.crmnotes) && olive.id === 'p6365550101' && olive.created.slice(0, 10) === '2024-03-01',
     olive && JSON.stringify(olive));
  ok('their referral source maps to the tracker\'s names', /\[SRC:Google \(organic\)\]/.test(olive.crmnotes) && /\[SRC:Meta \(organic\)\]/.test(by['Visit Vince'].crmnotes) && /\[SRC:Referral\]/.test(by['Spray Sue'].crmnotes));
  ok('phone, email, zip and address come from the client list', olive.phone === '6365550101' && olive.email === 'olive@gmail.com' && olive.zip === '63376' && /12 Elm St/.test(olive.address));
  const vince = by['Visit Vince'];
  ok('per-visit billing is turned into a monthly figure ($17 x 52/12 = $74)', vince && /^\$74\/mo/.test(vince.price) && /billed \$17 per visit/.test(vince.price) && vince.phone === '6365550102', vince && vince.price);
  const sue = by['Spray Sue'];
  ok('the deodorize add-on row folds into the customer: $91 + $30 = $121, every other visit', sue && sue.price === '$121/mo (includes $30 deodorize)' && /every other visit/.test(sue.deodorize), sue && (sue.price + ' / ' + sue.deodorize));
  const dot = by['Dot'];
  ok('a client named "Dot ." joins and loses the dot; every other week', dot && dot.service === 'every other week' && dot.zip === '63042', dot && JSON.stringify([dot.service, dot.zip]));
  ok('a paused subscription is still a customer, with a note', by['Pause Pete'] && by['Pause Pete'].status === 'closed' && /paused in Sweep&Go/.test(by['Pause Pete'].crmnotes));
  const gail = by['Gone Gail'];
  ok('a terminated subscription comes in cancelled with its end date and reason', gail && gail.status === 'cancelled' && /\[CX:2026-04-30\]/.test(gail.crmnotes) && /\[CXR:Moved\]/.test(gail.crmnotes), gail && gail.crmnotes);
  const hoa = by['Greens HOA - 14995 Green Cir'];
  ok('the commercial file, with its blank header, imports as a commercial customer at $60/mo', hoa && hoa.type === 'COMMERCIAL' && hoa.service === 'commercial' && /^\$60\/mo/.test(hoa.price) && hoa.zip === '63141', hoa && JSON.stringify(hoa));
  const stef = by['Stefany Freeman'];
  ok('Stefany is updated under her existing id, not added again', stef && stef.id === 'p9493904971');
  ok('she becomes closed with the Sweep&Go price and start date', stef.status === 'closed' && stef.price === '$82/mo' && /\[CD:2026-10-20\]/.test(stef.crmnotes));
  ok('and keeps the office\'s attempt, source and note', /\[ATT:1@2026-10-20\]/.test(stef.crmnotes) && /\[SRC:Meta Ads\]/.test(stef.crmnotes) && /gate 4471/.test(stef.crmnotes), stef.crmnotes);
  ok('every import row carries the import note', sent.every(l => /Imported from Sweep&Go \d{4}-\d{2}-\d{2}/.test(l.crmnotes)));
  ok('every import row is marked initial-clean-not-counted', sent.every(l => /\[IC:w\]/.test(l.crmnotes)));
  ok('the button reports done', /Done: 8 written/.test(await p.textContent('#sg-go')), await p.textContent('#sg-go'));
  const names = await p.$$eval('#list .card .who', els => els.map(e => e.textContent.trim()));
  ok('the new customers are on the page straight away', names.includes('Old Olive') && names.includes('Greens HOA - 14995 Green Cir'), names.join(' | '));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  fs.rmSync(dir, { recursive: true, force: true });
  done();
})();
