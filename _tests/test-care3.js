/* The batch Jesse picked from the "genius ideas" list, with no paid
   service behind any of it: a referral link for every customer, a text-us
   button on the site, one save offer before an account closes, a service
   day on each active card feeding a Schedule card, and a Deodorize card.
   Fixed clock: a Thursday in November 2026. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const NOW = new Date('2026-11-05T15:00:00Z');
const ago = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
// the tracker's code for a customer: first name letters + a short hash of the record id
const refCode = (l) => { const first = String(l.name).trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '').slice(0, 6); let h = 0; for (const ch of String(l.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return first + '-' + ('000' + (h % 46656).toString(36)).slice(-3); };

(async () => {
  const b = await launch();

  /* ---- the site: a referral link is remembered and lands on the quote; the text button ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const posts = [];
    stubNetwork(p, { posts });
    await p.goto(ORIGIN + '/?ref=Dana-1NX'); await p.waitForTimeout(500);
    ok('the referral code is remembered for the visit, lower-cased', await p.evaluate(() => sessionStorage.getItem('lead_ref')) === 'dana-1nx');
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);   // on to the quote without the tag, as a person would
    await p.fill('#q-zip', '63376'); await p.waitForTimeout(400);
    await p.fill('#qf2-name', 'Gina Guest'); await p.fill('#qf2-phone', '(636) 375-0104');
    await p.fill('#qf2-email', 'gina@gmail.com'); await p.fill('#qf2-addr', '12 Elm St');
    await p.click('#q-see-btn'); await p.waitForTimeout(700);
    const lead = posts.find(l => l && l.type === 'ENQUIRY');
    ok('the quote row carries the referral code', lead && /\[RF:dana-1nx\]/.test(lead.crmnotes), lead && lead.crmnotes);
    // the text-us button: on a phone, beside the call button, and the call button stays first
    const fabs = await p.$$eval('.fab', els => els.map(e => ({ href: e.getAttribute('href'), shown: getComputedStyle(e).display !== 'none' })));
    ok('two floating buttons on a phone: call, then text', fabs.length === 2 && /^tel:/.test(fabs[0].href) && /^sms:\+16363754342/.test(fabs[1].href) && fabs[1].shown, JSON.stringify(fabs));
    ok('the text opens with a message started for them', /quote%20for%20pet%20waste/.test(fabs[1].href));
    await ctx.close();
    const d = await b.newPage({ viewport:{ width:1280, height:900 } });
    stubNetwork(d, {});
    await d.goto(ORIGIN + '/'); await d.waitForTimeout(400);
    ok('on a desktop the text button stays out of the way', await d.$eval('.fab-text', e => getComputedStyle(e).display === 'none'));
    await d.close();
  }

  /* ---- the tracker ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1600 } });
    const p = await ctx.newPage();
    await p.clock.install({ time: NOW });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const posts = [];
    const dana = { id:'D1', type:'ENQUIRY', name:'Dana Deo', phone:'6363750001', zip:'63376', address:'1 Oak St, St. Peters, MO 63376', dogs:'2', service:'weekly', deodorize:'every visit ($15/treatment)', price:'$151/mo (includes $60 deodorize)', status:'closed', crmnotes:'[CD:2026-06-01] [QA:a] [DAY:tue] ', created: ago(24 * 160) };
    const code = refCode(dana);
    ok('the code is the first name and a hash of the id, never the phone', code === 'dana-1nx', code);
    const rows = [
      dana,
      { id:'E1', type:'ENQUIRY', name:'Eddie Eow', phone:'6363750002', zip:'63366', address:'2 Pine St, O\'Fallon, MO 63366', dogs:'1', service:'every other week', deodorize:'no', price:'$95/mo', status:'closed', crmnotes:'[CD:2026-07-01] [QA:a] [DAY:tue] ', created: ago(24 * 130) },
      { id:'F1', type:'ENQUIRY', name:'Fran Fence', phone:'6363750003', zip:'63376', address:'3 Ash St, St. Peters, MO 63376', dogs:'1', service:'weekly', deodorize:'no', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-08-01] [QA:a] ', created: ago(24 * 100) },
      // came through Dana's link, and is a customer now: Dana is owed her reward
      { id:'G1', type:'ENQUIRY', name:'Gina Guest', phone:'6363750004', zip:'63376', address:'4 Elm St, St. Peters, MO 63376', dogs:'1', service:'weekly', deodorize:'no', price:'$85/mo', status:'closed', crmnotes:'[RF:' + code + '] [CD:2026-10-20] [QA:a] [DAY:mon] ', created: ago(24 * 20) },
      // a link that matches nobody
      { id:'H1', type:'ENQUIRY', name:'Hal Hmm', phone:'6363750005', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[RF:nobody-zzz] [QA:w] ', created: ago(3) },
      { id:'W1', type:'ENQUIRY', name:'Waiting Wanda', phone:'6363750006', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', deodorize:'WANTS IT WHEN THE SEASON REOPENS: every visit ($15/treatment)', status:'called', crmnotes:'[QA:w] [T1:' + ago(20) + '] ', created: ago(30) },
      { id:'v1', type:'VIEW', name:'home', zip:'', yard:'s1', service:'Direct', notes:'how=none', created: ago(0.2) },
    ];
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} }
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    const t = async (id) => (await p.textContent('#card-' + id)).replace(/\s+/g, ' ');

    /* ---- referral links ---- */
    ok('an active customer\'s card shows their own link', (await t('D1')).indexOf('clpropetservices.com/?ref=' + code) > 0, (await t('D1')).slice(0, 300));
    ok('and how often it has been used', /used 1 time/.test(await t('D1')));
    ok('the link can be texted to them, and that logs the text', await p.$eval('#card-D1 a[href^="sms:"][onclick^="textLead"]', e => /ref=dana-1nx/.test(decodeURIComponent(e.getAttribute('href')))));
    ok('the quote that came through the link names the referrer', /Referred by Dana Deo \(used their link\)/.test(await t('G1')), await t('G1'));
    ok('and says the reward is owed', /owes them a free deodorize/.test(await t('G1')));
    ok('a code that matches nobody asks for the name', /referral link \(nobody-zzz\) that matches nobody/.test(await t('H1')));
    ok('a lead that is not a customer has no link of its own', !/Their referral link/.test(await t('H1')));
    await p.evaluate(() => { try { localStorage.setItem('clpps_numbers', 'open'); } catch (e) {} });
    await p.click('#numbersBtn'); await p.waitForTimeout(1200);
    ok('the numbers cards start closed', await p.$eval('#schedule', e => e.classList.contains('folded')) && await p.$eval('#deo', e => e.classList.contains('folded')));
    ok('each with its line: Deodorize', /1 have it · \$60\/mo/.test(await p.$eval('#deo .fsum', e => e.textContent)), await p.$eval('#deo .fsum', e => e.textContent));
    await p.evaluate(() => foldAll(true)); await p.waitForTimeout(200);
    const ins = (await p.textContent('#insights')).replace(/\s+/g, ' ');
    ok('the rewards-owed list fills itself from the link', /Dana Deo referred Gina Guest \(their link\)/.test(ins), ins.slice(ins.indexOf('Referral rewards'), ins.indexOf('Referral rewards') + 200));
    await p.click('#card-G1 [onclick^="editLead"]'); await p.waitForTimeout(300);
    ok('Edit shows the referrer worked out from the link', (await p.inputValue('#m-ref')) === 'Dana Deo');
    await p.click('button:has-text("Cancel")'); await p.waitForTimeout(200);

    /* ---- the Schedule card ---- */
    const sched = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
    ok('placed on a day: three of four active recurring customers', /3 of 4 placed on a day/.test(sched), sched.slice(0, 200));
    ok('Tuesday: two stops, three dogs, the money, the miles', /Tue\s*2 stops · 3 dogs · \$246\/mo · ~\d+ mi/.test(sched), sched);
    ok('the day lists the stops in route order, from the start and back', /Shortest order from St\. Peters and back, ~\d+ mi straight-line.*1\s*~Dana Deo.*2\s*~Eddie Eow/.test(sched), sched.slice(sched.indexOf('Tue'), sched.indexOf('Tue') + 300));
    /* ---- the routes block ---- */
    ok('the routes block sums the week and offers the start address', /Routes\s*~\d+ mi a week/.test(sched) && /Start and finish: the middle of St\. Peters\s*Set the start address/.test(sched), sched.slice(0, 400));
    ok('it says how many homes are only placed at the ZIP centre, with a button to pin them', /0 homes pinned to the street, 3 placed at the ZIP centre\.\s*Pin the homes/.test(sched));
    ok('no move is suggested when none saves a mile', /No single move would save a mile a week/.test(sched));
    /* ---- the day plan ---- */
    // Thursday 5 Nov 2026: no stops today, so the plan opens on the first day with stops (Mon)
    ok('the day plan sums the week: hours, road miles, money', /Day plan\s*\d+h?\s?\d*m? · ~\d+ road mi · \$\d+ a week/.test(sched), sched.slice(sched.indexOf('Day plan'), sched.indexOf('Day plan') + 120));
    ok('one line a day, with stops, dogs, miles, hours and what the visits bring', /Mon\s*1\s*1\s*~\d+\s*\d+m?h?.*\$20/.test(sched) && /Tue\s*2\s*3\s*~\d+/.test(sched), sched.slice(sched.indexOf('Day Stops'), sched.indexOf('Day Stops') + 200));
    await p.click('#dayplan button:has-text("Tue")'); await p.waitForTimeout(400);
    const dp = (await p.textContent('#dayplan')).replace(/\s+/g, ' ');
    ok('the chosen day: stops and dogs, road miles and driving time, hours with start and finish, money', /2\s*stops · 3 dogs/.test(dp) && /~\d+\s*road miles · \d+m driving/.test(dp) && /8:00am → \d+:\d\dam/.test(dp) && /\$79\s*this day/.test(dp), dp.slice(0, 400));
    // Dana: 2 dogs weekly $151 incl $60 deo -> $35 a visit; Eddie: eow $95 -> $44 a visit (rounded: 35 + 44 = 79? no: 151/4.33 = 34.9, 95/2.165 = 43.9 -> 78.8)
    ok('each stop has an arrival time, its minutes and its value', /1\. ~Dana Deo 1 Oak St · 2 dogs · deo\s*13 min · \$35/.test(dp) && /2\. ~Eddie Eow 2 Pine St · 1 dog · every other week\s*\+8\.\d mi · 8 min · \$44/i.test(dp), dp.slice(dp.indexOf('1. '), dp.indexOf('1. ') + 200));
    ok('and the way home', /mi back, home by \d+:\d\dam/.test(dp));
    ok('the assumptions can be changed', /Assumptions: 25 mph on the road, 8 min a stop \+ 3 min per extra dog, start 08:00/.test(dp));
    await p.$eval('#dayplan [data-fold="sched-assume"]', e => e.classList.remove('folded'));
    await p.fill('#as-base', '12'); await p.fill('#as-start', '07:30'); await p.click('#dayplan button:has-text("Save")'); await p.waitForTimeout(400);
    const dp2 = (await p.textContent('#dayplan')).replace(/\s+/g, ' ');
    ok('and the plan follows them', /7:30am →/.test(dp2) && /1\. ~Dana Deo.*17 min/.test(dp2) && /Assumptions: 25 mph on the road, 12 min a stop/.test(dp2), dp2.slice(0, 300));
    ok('the daily brief opens with today\'s route when there is one', await p.evaluate(() => { const was = fuParse(leads.filter(l => l.id === 'E1')[0].crmnotes); const m = fuParse(leads.filter(l => l.id === 'E1')[0].crmnotes); m.day = 'thu'; leads.filter(l => l.id === 'E1')[0].crmnotes = fuCompose(m); routeTouched(); const b = briefText_(); leads.filter(l => l.id === 'E1')[0].crmnotes = fuCompose(was); routeTouched(); return /TODAY\u2019S ROUTE — 1 stops, 1 dogs, ~\d+ road mi, about .* in visits\n  1\. \d+:\d\dam Eddie Eow — 2 Pine St — 1 dog/.test(b); }));
    /* ---- the best day for a customer who has none ---- */
    const fran = await t('F1');
    ok('a customer with no day gets a recommendation on the card', /Best day: Mon \(your St\. Peters run|Best day: Mon \(next to Gina/.test(fran), fran.slice(fran.indexOf('Best day'), fran.indexOf('Best day') + 160));
    ok('with the next best named', /next best Tue, adds ~\d/.test(fran));
    ok('and the plan line says no day is set', /no day set/.test(fran));
    await p.click('#card-F1 button:has-text("Put them on Mon")'); await p.waitForTimeout(400);
    ok('one tap puts them on that day', posts.some(x => x.action === 'update' && x.id === 'F1' && /\[DAY:mon\]/.test(x.notes)) && !/Best day/.test(await t('F1')) && /📅 Mon/.test(await t('F1')), (await t('F1')).slice(0, 200));
    const sched1 = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
    ok('the Schedule card follows: four of four', /4 of 4 placed/.test(sched1) && /Mon\s*2 stops/.test(sched1), sched1.slice(0, 200));
    ok('Monday: Gina', /Mon\s*1 stop · 1 dog · \$85\/mo · 1 town/.test(sched));
    ok('the unplaced one is named', /No day set\s*1.*Fran Fence/.test(sched));
    ok('every-other-week is marked on the stop', /Eddie Eow 1 dog · Every other week · \$95/.test(sched) || /Eddie Eow 1 dog · every other week · \$95/i.test(sched), sched.slice(sched.indexOf('Eddie'), sched.indexOf('Eddie') + 60));
    ok('a one-day list starts folded', await p.$eval('#schedule [data-fold="sched-tue"]', e => e.classList.contains('folded')));
    // change Fran's day from the dropdown, which sits under More
    ok('the day dropdown and the referral link are under More, off the card face', await p.$eval('#more-F1', e => e.style.display === 'none' && /Service day/.test(e.textContent) && /Their referral link/.test(e.textContent)));
    await p.evaluate(() => openMore('F1')); await p.waitForTimeout(200);
    await p.selectOption('#card-F1 .day-sel', 'wed'); await p.waitForTimeout(400);
    const dayPost = posts.find(x => x.action === 'update' && x.id === 'F1' && /\[DAY:wed\]/.test(x.notes));
    ok('picking a day saves it on the card', !!dayPost, JSON.stringify(posts.filter(x => x.id === 'F1').slice(-1)));
    const sched2 = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
    ok('and the Schedule card follows', /4 of 4 placed/.test(sched2) && /Wed\s*1 stop/.test(sched2) && !/No day set/.test(sched2), sched2.slice(0, 200));
    ok('the closed Schedule heading would read the same', /4 of 4 on a day · ~\d+ mi\/wk/.test(await p.$eval('#schedule .fsum', e => e.textContent)), await p.$eval('#schedule .fsum', e => e.textContent));

    /* ---- the Deodorize card ---- */
    const deo = (await p.textContent('#deo')).replace(/\s+/g, ' ');
    ok('who has it, as a share of active customers', /1\s*have it · 25% of 4/.test(deo), deo.slice(0, 300));
    ok('what it brings in', /\$60\s*a month · \$720\/yr/.test(deo));
    ok('who is waiting for the season', /1\s*waiting on the season/.test(deo) && /Waiting Wanda/.test(deo));
    ok('who is active without it', /3\s*active, no deo/.test(deo) && /Fran Fence/.test(deo) && /Eddie Eow/.test(deo));
    ok('the season state is shown', /season (ON|OFF)/.test(deo));
    ok('the waiting list starts open, the others folded', await p.$eval('#deo [data-fold="deo-later"]', e => !e.classList.contains('folded')) && await p.$eval('#deo [data-fold="deo-on"]', e => e.classList.contains('folded')));

    /* ---- the save offer before an account closes ---- */
    await p.$eval('#card-F1', e => e.scrollIntoView({ block: 'center' }));
    await p.click('#card-F1 button.b-cancelled'); await p.waitForTimeout(400);
    ok('tapping Account closed does not close it yet', !posts.some(x => x.action === 'update' && x.id === 'F1' && x.status === 'cancelled') && /ACTIVE · ON SCHEDULE/.test(await t('F1')));
    const sv = await p.$eval('#save-F1', e => e.textContent.replace(/\s+/g, ' '));
    ok('it shows the offer: a month at half price, since every other week costs them more here', /next month at half price \(\$43 instead of \$85\)/.test(sv), sv);
    ok('with the text ready', await p.$eval('#save-F1 a[href^="sms:"]', e => /half price \(\$43 instead of \$85\)/.test(decodeURIComponent(e.getAttribute('href')))));
    await p.click('#save-F1 button:has-text("Keep them active")'); await p.waitForTimeout(300);
    ok('Keep them active takes the offer away and changes nothing', (await p.$('#save-F1')) === null && !posts.some(x => x.id === 'F1' && x.status));
    await p.click('#card-F1 button.b-cancelled'); await p.waitForTimeout(300);
    await p.click('#save-F1 button:has-text("Offered, they still want out")'); await p.waitForTimeout(400);
    const closed = posts.find(x => x.action === 'update' && x.id === 'F1' && x.status === 'cancelled');
    ok('the second tap closes the account and records that the offer was made', closed && /\[SV:2026-11-05\]/.test(closed.notes) && /\[CX:2026-11-05\]/.test(closed.notes), closed && closed.notes);
    ok('the closed card says the offer was made', /Save offer made 2026-11-05/.test(await t('F1')) && /ACCOUNT CLOSED/.test(await t('F1')));
    // Eddie: text the offer, and he stays active until he answers
    await p.$eval('#card-E1', e => e.scrollIntoView({ block: 'center' }));
    await p.click('#card-E1 button.b-cancelled'); await p.waitForTimeout(300);
    await p.$eval('#save-E1 a[href^="sms:"]', e => { e.setAttribute('href', '#'); e.click(); }); await p.waitForTimeout(400);
    const texted = posts.find(x => x.action === 'update' && x.id === 'E1' && /\[SV:2026-11-05\]/.test(x.notes));
    ok('texting the offer records it and leaves them active', texted && !texted.status && /ACTIVE · ON SCHEDULE/.test(await t('E1')) && /Save offer made 2026-11-05 — still active/.test(await t('E1')), await t('E1'));
    await p.click('#card-E1 button.b-cancelled'); await p.waitForTimeout(400);
    ok('once the offer is on record, Account closed closes it straight away', posts.some(x => x.action === 'update' && x.id === 'E1' && x.status === 'cancelled'));
    ok('a closed account is off the Schedule and the Deodorize counts', /2 of 2 placed/.test((await p.textContent('#schedule')).replace(/\s+/g, ' ')), (await p.textContent('#schedule')).replace(/\s+/g, ' ').slice(0, 120));
    /* ---- service days from the Master Schedule export ---- */
    const csv = '"Client Name","Client Address","City","State","Zip Code","Subscription Name","Subscription Status","Service Days","Assigned To","Cleanup Frequency","Number Of Dogs"\n' +
      '"Dana Deo","1 Oak St","St. Peters","Missouri","63376","2d-1xW","active","Thursday","Jesse Duncan","Once A Week","2"\n' +
      '"Dana Deo","1 Oak St","St. Peters","Missouri","63376","bW","active","Thursday","Jesse Duncan","Bi Weekly","0"\n' +      // the deodorize add-on row
      '"Gina G.","4 Elm St.","Saint Peters","Missouri","63376","1d-2xW","active","Tuesday, Friday","Jesse Duncan","Two Times A Week","1"\n' +   // name spelled differently: matched by the house
      '"Eddie Eow","2 Pine St","O\'Fallon","Missouri","63366","1d-bW","active","Tuesday","Jesse Duncan","Bi Weekly","1"\n' +               // already right
      '"Old Oscar","9 Gone Rd","Troy","Missouri","63379","1d-1xW","cancelled","Monday","Jesse Duncan","Once A Week","1"\n' +                 // not active: skipped
      '"Nobody Known","77 Mystery Ln","Troy","Missouri","63379","1d-1xW","active","Monday","Jesse Duncan","Once A Week","1"\n';
    const plan = await p.evaluate((c) => { const pl = sgDaysPlan(c, leads); return { n: pl.rows.length, set: pl.set.map(x => [x.l.name, x.r.days, x.was]), same: pl.same.map(x => x.l.name), un: pl.unmatched.map(r => r.name) }; }, csv);
    ok('the add-on row and the cancelled row are not counted', plan.n === 4, JSON.stringify(plan));
    ok('a name spelled differently is matched by the house number and street, with both days', plan.set.some(x => x[0] === 'Gina Guest' && x[1] === 'tue,fri' && x[2] === 'mon'), JSON.stringify(plan.set));
    ok('a day that is already right is left alone', plan.same.indexOf('Eddie Eow') >= 0 && !plan.set.some(x => x[0] === 'Eddie Eow'));
    ok('someone not in the tracker is listed, not added', plan.un.length === 1 && plan.un[0] === 'Nobody Known');
    ok('Dana moves from Tue to Thu', plan.set.some(x => x[0] === 'Dana Deo' && x[1] === 'thu' && x[2] === 'tue'));
    ok('day text reads two days in week order', await p.evaluate(() => dayParse('Friday, tuesday') === 'tue,fri' && dayText('tue,fri') === 'Tue, Fri' && dayParse('Thu') === 'thu' && dayParse('someday') === ''));
    // through the panel: pick the file, preview, set
    await p.click('#importBtn'); await p.waitForTimeout(300);
    await p.setInputFiles('#sg-sched', { name: 'Master_Schedule.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await p.click('button:has-text("Preview days")'); await p.waitForTimeout(500);
    const dout = (await p.textContent('#sg-days-out')).replace(/\s+/g, ' ');
    ok('the preview says what it will do', /4 customers on the schedule → 2 to set, 1 already right/.test(dout), dout.slice(0, 200));
    ok('and names the one it could not find', /1 on the schedule but not in the tracker.*Nobody Known/.test(dout));
    await p.click('#sg-days-go'); await p.waitForTimeout(800);
    const ginaPost = posts.find(x => x.action === 'update' && x.id === 'G1' && /\[DAY:tue,fri\]/.test(x.notes));
    ok('setting the days writes each customer\'s notes', !!ginaPost && posts.some(x => x.action === 'update' && x.id === 'D1' && /\[DAY:thu\]/.test(x.notes)), JSON.stringify(posts.filter(x => x.id === 'G1').slice(-1)));
    const sched3 = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
    ok('a twice-a-week customer is on both days of the Schedule', /Tue\s*1 stop/.test(sched3) && /Fri\s*1 stop/.test(sched3) && /Thu\s*1 stop/.test(sched3), sched3.slice(0, 300));
    ok('and their card shows both days', /Tue, Fri \(twice a week\)/.test(await t('G1')));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  await b.close();
  done();
})();
