/* What the history is for, now that it goes back to 2024.

   This month against the same month a year ago; what each price change
   did to the close rate in the month after it; and reviews gained each
   month against review requests sent. Fixed clock: 31 October 2026. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const NOW = new Date('2026-10-31T15:00:00Z');
const iso = (d) => new Date(d + 'T12:00:00Z').toISOString();

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1600 } });
  const p = await ctx.newPage();
  await p.clock.install({ time: NOW });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let seq = 0;
  const cust = (cd) => ({ id:'c' + (++seq), type:'ENQUIRY', name:'Cust ' + seq, phone:'636375' + String(5000 + seq), zip:'63376', address: seq + ' Elm St, St. Peters, Missouri 63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[CD:' + cd + '] [QA:a] ', created: iso(cd) });
  const quote = (day, won) => ({ id:'q' + (++seq), type:'ENQUIRY', name:'Quote ' + seq, phone:'636375' + String(5000 + seq), zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status: won ? 'closed' : 'lost', crmnotes: won ? '[CD:' + day + '] [QA:a] ' : '[QA:d] price', created: iso(day) });
  const rows = [
    // October 2025: 2 new customers; October 2026: 3. 2026 so far: 3 + Jan 2026's 1 = 4; by Oct 2025: 2 + Mar 2025's 1 = 3
    cust('2025-03-10'), cust('2025-10-05'), cust('2025-10-20'),
    cust('2026-01-15'), cust('2026-10-02'), cust('2026-10-14'), cust('2026-10-28'),
    // a one-time job this month: not a recurring customer
    { id:'o1', type:'ENQUIRY', name:'Once', phone:'6363759999', zip:'63376', dogs:'1', service:'one-time', price:'$95 one-time', status:'closed', crmnotes:'[CD:2026-10-10] [QA:a] ', created: iso('2026-10-10') },
    // around the 2026-10-11 price change (dated below): 30 days before, 2 of 6 won; 20 days after, 5 of 6 won
    quote('2026-09-15', false), quote('2026-09-18', false), quote('2026-09-22', true), quote('2026-09-28', false), quote('2026-10-03', true), quote('2026-10-08', false),
    quote('2026-10-12', true), quote('2026-10-15', true), quote('2026-10-18', false), quote('2026-10-22', true), quote('2026-10-25', true), quote('2026-10-29', true),
    // review requests and the counts saved over time
    { id:'r1', type:'ENQUIRY', name:'Asked A', phone:'6363758001', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-08-01] [RV:2026-09-12] [QA:a] ', created: iso('2026-08-01') },
    { id:'r2', type:'ENQUIRY', name:'Asked B', phone:'6363758002', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-08-01] [RV:2026-09-20] [QA:a] ', created: iso('2026-08-01') },
    { id:'r3', type:'ENQUIRY', name:'Asked C', phone:'6363758003', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-09-01] [RV:2026-10-05] [QA:a] ', created: iso('2026-09-01') },
    { id:'k1', type:'CONFIG', name:'review_count', notes:'28', status:'config', crmnotes:'', created: iso('2026-08-20') },
    { id:'k2', type:'CONFIG', name:'review_count', notes:'31', status:'config', crmnotes:'', created: iso('2026-09-28') },
    { id:'k3', type:'CONFIG', name:'review_count', notes:'32', status:'config', crmnotes:'', created: iso('2026-10-20') },
    { id:'k4', type:'CONFIG', name:'review_rating', notes:'5.0', status:'config', crmnotes:'', created: iso('2026-10-20') },
  ];
  stubNetwork(p, { leads: rows });
  // a price change dated 20 days ago, on top of the real ones in pricing.js
  await p.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { try { CLPPS_PRICING.changes.push({ date: '2026-10-11', what: 'TEST: St. Peters to Core' }); } catch (e) {} }); });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
  await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', 'open'); } catch (e) {} });
  await p.click('#numbersBtn'); await p.waitForTimeout(1200);

  /* ---- this month against last year ---- */
  const season = (await p.textContent('#season')).replace(/\s+/g, ' ');
  // October 2026: 3 plain customers + the 6 won quotes = 9; October 2025: 2
  ok('new customers this month, with last year beside it', /9\s*new customers Oct\s*2 in Oct 2025 \+350%/.test(season), season.slice(0, 200));
  // quotes created in October 2026: 3 customers + 8 quote rows = 11; October 2025: the 2 customers
  ok('quotes this month against last October', /11\s*quotes Oct\s*2 in Oct 2025 \+450%/.test(season), season.slice(0, 300));
  // 2026 so far: Jan 1 + Aug 2 + Sep 2 + Oct 9 = 14; by October 2025: Mar 1 + Oct 2 = 3
  ok('year to date against the same point last year', /14\s*new customers 2026 so far\s*3 by Oct 2025 \+367%/.test(season), season.slice(0, 400));
  ok('twelve months of paired bars', (await p.$$('#season div[title]')).length === 24);
  ok('the one-time job is not a new recurring customer', !/10\s*new customers Oct/.test(season));

  /* ---- price changes ---- */
  const log = (await p.textContent('#pricelog')).replace(/\s+/g, ' ');
  // before 11 Oct: 2 of 6 quote rows + the customer of 2 Oct = 3 of 7; after: 5 of 6 + the customers of 14 and 28 Oct = 7 of 8
  ok('the test change shows before and after, and the verdict', /TEST: St\. Peters to Core.*closing more.*30 days before: 3 of 7 \(43%\).*20 days after: 7 of 8 \(88%\)/.test(log), log.slice(log.indexOf('TEST'), log.indexOf('TEST') + 200));
  ok('the real changes from the price list are listed', /Illinois priced off the table/.test(log) && /Franklin County towns moved to Value/.test(log));
  ok('a change with too few quotes around it says so rather than guessing', /Monthly \(once-a-month\) plan retired.*too few quotes to say/.test(log));

  /* ---- reviews gained ---- */
  const rv = (await p.textContent('#rv-trend')).replace(/\s+/g, ' ');
  // table cells run together in textContent
  ok('September: two asked, three gained (28 to 31)', /Sep 2026\s*2\s*\+3/.test(rv), rv.slice(0, 300));
  ok('October: one asked, one gained (31 to 32)', /Oct 2026\s*1\s*\+1/.test(rv), rv.slice(0, 300));
  ok('a month with no count saved says not updated', /Jul 2026\s*—\s*not updated/.test(rv), rv.slice(0, 300));
  ok('and the current Google total is shown', /32 on Google now/.test(rv));

  /* ---- the revenue card folds now, with the math on its own button ---- */
  ok('the revenue card is foldable', await p.$eval('#revenue', e => e.classList.contains('fold')));
  await p.$eval('#revenue button', e => e.scrollIntoView({ block: 'center' }));
  await p.click('#revenue button:has-text("the math")'); await p.waitForTimeout(200);
  ok('the math opens from its button', await p.$eval('#rev-detail', e => e.style.display === 'block'));
  await p.$eval('#revenue', e => e.scrollIntoView({ block: 'center' }));
  await p.click('#revenue > div:first-child'); await p.waitForTimeout(200);
  ok('tapping the revenue heading folds the card', await p.$eval('#revenue', e => e.classList.contains('folded')));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
