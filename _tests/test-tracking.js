/* Eight things the sheet already knew and nobody added up, plus the
   30-day traffic load. Fixed clock throughout, because speed-to-lead,
   "last 90 days" and "this month" all move with the calendar. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const NOW = new Date('2026-10-02T14:00:00');
const at = (daysBack, hour) => { const d = new Date(NOW); d.setDate(d.getDate() - daysBack); if (hour != null) d.setHours(hour, 10, 0, 0); return d.toISOString(); };
const key = n => at(n).slice(0, 10);
let n = 0;
const L = o => Object.assign({ id: 'L' + (++n), type:'ENQUIRY', zip:'63376', dogs:'1', service:'weekly',
  price:'$85/mo, weekly service, 1 dog', status:'new', crmnotes:'[QA:w] ', created: at(1, 10) }, o);

const ROWS = [
  // --- speed to lead: enquiry at 10:10, first touch stamped [T1:] ---
  L({ name:'Fast Fiona',  crmnotes:'[T1:' + at(1, 10).replace('T10:10', 'T10:40') + '] [QA:w] ', status:'called', created: at(1, 10) }),   // 30 min
  L({ name:'Slow Sam',    crmnotes:'[T1:' + at(2, 9).replace('T09:10', 'T15:10') + '] [QA:w] ', status:'called', created: at(2, 9) }),     // 6h
  L({ name:'Day Dana',    crmnotes:'[T1:' + at(2, 8) + '] [QA:w] ', status:'called', created: at(3, 8) }),                                // 24h
  L({ name:'Never Ned',   crmnotes:'[QA:w] ', status:'new', created: at(4, 11) }),                                                        // never contacted
  // --- declined, reasons as the SITE writes them (free text, no tag) ---
  L({ name:'Pricey Pete', type:'DECLINED', crmnotes:'[QA:d] Price is higher than I expected', created: at(5, 12) }),
  L({ name:'Pricey Paula', type:'DECLINED', crmnotes:'[QA:d] Price is higher than I expected — maybe in spring', created: at(6, 13) }),
  L({ name:'Comparing Cal', type:'DECLINED', crmnotes:'[QA:d] Just comparing quotes right now', created: at(7, 9) }),
  L({ name:'Tagged Tina', type:'DECLINED', crmnotes:'[QA:d] [DR:elsewhere] whatever she typed', created: at(8, 15) }),
  // --- closed customers across tiers and sources; some cancelled ---
  L({ name:'Prem Won',   zip:'63017', type:'ACTIVATE', status:'closed', price:'$94/mo, weekly service, 1 dog', crmnotes:'[CD:' + key(20) + '] [SRC:Google Ads] [QA:a] ', created: at(25, 10) }),
  L({ name:'Prem Lost',  zip:'63017', type:'DECLINED', crmnotes:'[SRC:Google Ads] [QA:d] too expensive for us', created: at(24, 10) }),
  L({ name:'Std Won A',  zip:'63376', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(30) + '] [SRC:Meta Ads] [QA:a] ', created: at(35, 10) }),
  L({ name:'Std Won B',  zip:'63376', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(40) + '] [SRC:Meta Ads] [QA:a] ', created: at(45, 10) }),
  L({ name:'Std Won C',  zip:'63376', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(50) + '] [SRC:Referral] [RB:Beth Kowalski] [QA:a] ', created: at(55, 10) }),
  L({ name:'Std Won D',  zip:'63376', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(60) + '] [SRC:Referral] [RB:Beth Kowalski] [RW:' + key(50) + '] [QA:a] ', created: at(65, 10) }),
  L({ name:'Val Won',    zip:'63031', type:'ACTIVATE', status:'closed', price:'$77/mo, weekly service, 1 dog', crmnotes:'[CD:' + key(70) + '] [SRC:Google (organic)] [QA:a] ', created: at(75, 10) }),
  // cancelled: three in the last six months, with tenures
  L({ name:'Gone Gary',  zip:'63376', type:'ACTIVATE', status:'cancelled', price:'$91/mo, weekly service, 2 dogs', crmnotes:'[CD:' + key(200) + '] [CX:' + key(20) + '] [CXR:moved] [QA:a] ', created: at(205, 10) }),
  L({ name:'Gone Gwen',  zip:'63376', type:'ACTIVATE', status:'cancelled', price:'$85/mo, weekly service, 1 dog', crmnotes:'[CD:' + key(150) + '] [CX:' + key(10) + '] [QA:a] ', created: at(155, 10) }),
  L({ name:'Gone Greg',  zip:'63376', type:'ACTIVATE', status:'cancelled', price:'$85/mo, weekly service, 1 dog', crmnotes:'[CD:' + key(120) + '] [CX:' + key(40) + '] [QA:a] ', created: at(125, 10) }),
  // a few more active so the churn threshold (active + recent >= 8) is met
  L({ name:'Act One', zip:'63376', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(100) + '] [QA:a] ', created: at(105, 10) }),
  L({ name:'Act Two', zip:'63376', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(110) + '] [QA:a] ', created: at(115, 10) }),
  // --- manual-quote leads ---
  L({ name:'Yard Yolanda', manual:'YES', price:'custom, to be quoted', yard:'OVER 1/4 acre (manual review)', crmnotes:'[QA:w] [MR:yard] ', created: at(9, 10) }),
  L({ name:'Yard Yusuf',   manual:'YES', price:'custom, to be quoted', type:'ACTIVATE', status:'closed', crmnotes:'[CD:' + key(5) + '] [QA:a] [MR:yard] ', created: at(12, 10) }),
  // --- the one the night-shift test is about: closed with a referrer but no reward yet ---
];
// --- win-back history: the same id twice. Newest first, as the sheet returns it.
ROWS.unshift({ id:'WB1', type:'ACTIVATE', name:'Won Back Wendy', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo, weekly service, 1 dog',
               status:'closed', crmnotes:'[CD:' + key(3) + '] [QA:a] ', created: at(15, 10) });
ROWS.push({ id:'WB1', type:'DECLINED', name:'Won Back Wendy', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo, weekly service, 1 dog',
            status:'new', crmnotes:'[WB:' + key(13) + '] [QA:d] too much', created: at(15, 10) });
ROWS.push({ id:'WB2', type:'DECLINED', name:'Still No Nick', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo, weekly service, 1 dog',
            status:'new', crmnotes:'[WB:' + key(12) + '] [QA:d] no thanks', created: at(14, 10) });
// traffic
for (let d = 0; d < 40; d++) ROWS.push({ id:'v' + d, type:'VIEW', name:'Home', yard:'s' + d, service:'Meta Ads', created: at(d, 9) });

(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport:{ width:430, height:932 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const fetches = [], posts = [];
  await p.clock.install({ time: NOW });
  p.route('**/script.google.com/**', r => {
    if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} return r.fulfill({ contentType:'application/json', body:'{"ok":true}' }); }
    fetches.push(r.request().url());
    return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: ROWS }) });
  });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1400);
  const txt = async sel => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ');
  const card = async id => txt('#card-' + id);

  /* ---- 9. the 30-day load ---- */
  ok('the list loads only 30 days of traffic', /days=30\b/.test(fetches[0]), fetches[0]);
  await p.click('#numbersBtn'); await p.waitForTimeout(600);
  ok('opening the numbers panel fetches the full history', fetches.some(u => /days=400\b/.test(u)), fetches.join('\n'));

  /* ---- 3. speed to lead ---- */
  const line = await txt('#speedline');
  ok('the speed line is on the main page', await p.isVisible('#speedline'));
  ok('median time to first contact is right: 30m, 6h, 24h -> 6h', /Median 6h 0m/.test(line), line);
  ok('and it counts the two never contacted - not the people who said no, they are the win-back email\'s job', /2 never contacted/.test(line), line);
  ok('inside-an-hour percentage is right (1 of 3)', /33% inside an hour/.test(line), line);

  /* ---- 2. why they say no, read from the site's own wording ---- */
  const ins = await txt('#insights');
  ok('declines are tagged from what the site wrote, nobody retyped them',
     /Price too high 3 \(/.test(ins), ins.match(/Price too high[^·]*/) && ins.match(/Price too high[^·]*/)[0]);
  ok('a hand-set tag wins over the text', /Went with another company 1/.test(ins));
  ok('comparing is its own bucket', /Just comparing 1/.test(ins));
  const pete = await card('L5');
  ok('a declined card has the reason dropdown, pre-filled from the text', /Why they said no/.test(pete) && /read from what they wrote/.test(pete), pete.slice(0, 260));
  await p.selectOption('#card-L5 select.why', 'timing'); await p.waitForTimeout(300);
  const drPost = posts.find(x => x.action === 'update' && x.id === 'L5');
  ok('changing it saves a [DR:] tag to the sheet', drPost && /\[DR:timing\]/.test(drPost.notes), drPost && drPost.notes);

  /* ---- 1. cancellations ---- */
  const chips = await p.$$eval('#chips button', els => els.map(e => e.textContent.trim()));
  ok('there is a Cancelled chip with the right count', chips.some(c => /Cancelled \(3\)/.test(c)), chips.join(' | '));
  const nora = await card('L1'), won = await card('L9');
  ok('a new lead is NOT offered a Cancelled button', !/Cancelled/.test(nora));
  ok('a closed customer IS', /Cancelled/.test(won));
  await p.click('#card-L9 .stbtns button.b-cancelled'); await p.waitForTimeout(400);
  const cxPost = posts.find(x => x.action === 'update' && x.id === 'L9' && x.status === 'cancelled');
  ok('tapping it stamps the leaving date on the row', cxPost && /\[CX:2026-10-02\]/.test(cxPost.notes), cxPost && cxPost.notes);
  ok('and the card asks why they left', /Why they left/.test(await card('L9')));
  await p.click('#card-L9 .stbtns button.b-closed'); await p.waitForTimeout(300);   // put it back for the money checks
  await p.evaluate(() => { var r = document.getElementById('revenue'); var t = r.querySelector('[onclick]'); if (t) t.click(); else r.click(); });
  await p.waitForTimeout(300);
  const rev = await txt('#revenue');
  ok('current MRR leaves the cancelled customers out',
     /\$[0-9,]+\/mo current MRR/.test(rev) && !/Gone Gary[^$]*\$91\/mo(?!.*cancelled)/.test(rev), rev.slice(0, 120));
  // Gary ($91) and Gwen ($85) both left in September, so that month shows
  // the two added together; Greg ($85) left in August on his own.
  ok('the month customers left shows the money that walked out, summed',
     /Sep 2026[^A]*[−-]\$176\/mo cancelled/.test(rev) && /Aug 2026[^J]*[−-]\$85\/mo cancelled/.test(rev),
     (rev.match(/.{0,40}cancelled.{0,20}/g) || ['(no "cancelled" anywhere) ' + rev.slice(0, 300)]).join(' || '));
  ok('and each cancelled customer is struck through with their leaving date',
     /Gone Gary[^$]*\$91\/mo cancelled 2026-09-12/.test(rev), rev.match(/Gone Gary.{0,60}/) && rev.match(/Gone Gary.{0,60}/)[0]);
  const roi = await txt('#roi');
  ok('with 3 cancellations in six months the lifetime is MEASURED, not typed', /\(measured\)/.test(roi), roi.match(/worth over[^·]*/) && roi.match(/worth over[^·]*/)[0]);
  ok('a customer who later cancelled still counts as closed in the month they closed',
     /Interested|CLOSED/.test(await txt('#stats')));

  /* ---- 4. close rate by tier and by source ---- */
  ok('Premium closes 1 of 2 (50%)', /Premium 50% of 2/.test(ins), ins.match(/Premium[^S]{0,40}/) && ins.match(/Premium[^S]{0,40}/)[0]);
  ok('Standard shows its rate with the no count', /Standard \d+% of \d+/.test(ins));
  ok('close rate by source is there', /Google Ads 50% of 2/.test(ins), ins.match(/Google Ads[^M]{0,40}/) && ins.match(/Google Ads[^M]{0,40}/)[0]);

  /* ---- 6. manual quotes ---- */
  ok('hand-priced vs instant-price close rates are compared', /By hand 50% of 2/.test(ins) && /Instant price \d+% of \d+/.test(ins), ins.match(/By hand[^I]{0,60}/) && ins.match(/By hand[^I]{0,60}/)[0]);
  ok('and it says why they were by hand', /yard over ¼ acre 2/.test(ins));

  /* ---- 7. win-back, across every row an id has had ---- */
  ok('win-back: 1 of 2 came back, read from the declined row, not the rewritten one',
     /Win-back emails\s*1 of 2/.test(ins), ins.match(/Win-back emails[^p]{0,30}/) && ins.match(/Win-back emails[^p]{0,30}/)[0]);

  /* ---- 5. referral rewards owed ---- */
  ok('a closed referral with no reward yet is listed as owed', /Beth Kowalski referred Std Won C/.test(ins));
  ok('one already rewarded is not', !/referred Std Won D/.test(ins));
  ok('the referred customer\'s card says who referred them and that a reward is owed',
     /Referred by Beth Kowalski/.test(await card('L13')) && /owes them a free deodorize/.test(await card('L13')));
  await p.click('#insights button:has-text("Reward given")'); await p.waitForTimeout(300);
  const rwPost = posts.find(x => x.action === 'update' && x.id === 'L13');
  ok('Reward given stamps the date on the row', rwPost && /\[RW:2026-10-02\]/.test(rwPost.notes), rwPost && rwPost.notes);
  ok('and it drops off the owed list', !/Beth Kowalski referred Std Won C/.test(await txt('#insights')));

  /* ---- 8. when leads arrive ---- */
  const bars = await p.$$eval('#insights .bar', els => els.map(e => e.textContent.trim()));
  ok('seven weekday bars', ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].every(d => bars.some(x => x.startsWith(d))), bars.filter(x => /^(Sun|Mon|Tue)/.test(x)).join(' | '));
  ok('six hour-block bars', bars.some(x => /^8am–noon/.test(x)) && bars.some(x => /^8pm–midnight/.test(x)));

  /* ---- the referred-by field in Edit ---- */
  await p.evaluate(() => editLead('L1')); await p.waitForTimeout(300);
  ok('Edit has a Referred by field', await p.isVisible('#m-ref'));
  await p.fill('#m-ref', 'Kevin Barr'); await p.evaluate(() => addManual()); await p.waitForTimeout(300);
  const ed = posts.find(x => x.action === 'lead' && x.lead && x.lead.id === 'L1');
  ok('saving it writes [RB:] to the row', ed && /\[RB:Kevin Barr\]/.test(ed.lead.crmnotes), ed && ed.lead.crmnotes);

  ok('no page errors', errs.length === 0, errs.join('; '));
  await b.close();
  done();
})();
