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
    const ins = (await p.textContent('#insights')).replace(/\s+/g, ' ');
    ok('the rewards-owed list fills itself from the link', /Dana Deo referred Gina Guest \(their link\)/.test(ins), ins.slice(ins.indexOf('Referral rewards'), ins.indexOf('Referral rewards') + 200));
    await p.click('#card-G1 [onclick^="editLead"]'); await p.waitForTimeout(300);
    ok('Edit shows the referrer worked out from the link', (await p.inputValue('#m-ref')) === 'Dana Deo');
    await p.click('button:has-text("Cancel")'); await p.waitForTimeout(200);

    /* ---- the Schedule card ---- */
    const sched = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
    ok('placed on a day: three of four active recurring customers', /3 of 4 placed on a day/.test(sched), sched.slice(0, 200));
    ok('Tuesday: two stops, three dogs, the money, two towns', /Tue\s*2 stops · 3 dogs · \$246\/mo · 2 towns/.test(sched), sched);
    ok('Monday: Gina', /Mon\s*1 stop · 1 dog · \$85\/mo · 1 town/.test(sched));
    ok('the unplaced one is named', /No day set\s*1.*Fran Fence/.test(sched));
    ok('every-other-week is marked on the stop', /Eddie Eow 1 dog · Every other week · \$95/.test(sched) || /Eddie Eow 1 dog · every other week · \$95/i.test(sched), sched.slice(sched.indexOf('Eddie'), sched.indexOf('Eddie') + 60));
    ok('a one-day list starts folded', await p.$eval('#schedule [data-fold="sched-tue"]', e => e.classList.contains('folded')));
    // set Fran's day from her card
    await p.selectOption('#card-F1 .day-sel', 'wed'); await p.waitForTimeout(400);
    const dayPost = posts.find(x => x.action === 'update' && x.id === 'F1' && /\[DAY:wed\]/.test(x.notes));
    ok('picking a day saves it on the card', !!dayPost, JSON.stringify(posts.filter(x => x.id === 'F1').slice(-1)));
    const sched2 = (await p.textContent('#schedule')).replace(/\s+/g, ' ');
    ok('and the Schedule card follows', /4 of 4 placed/.test(sched2) && /Wed\s*1 stop/.test(sched2) && !/No day set/.test(sched2), sched2.slice(0, 200));

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
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  await b.close();
  done();
})();
