/* The lead tracker as it is used: on a phone, to see who to call.

   Jesse: "take a look at our leads page and see what you can do to improve
   it." Measured first: the first lead sat 1998px down a 430px-wide phone -
   two full screens of dashboards above it - and every card was 555px tall
   with twelve buttons, whatever state the lead was in.

   Everything here is checked against a fixed clock, because one of the
   fixes depends on the day of the month and a test that passes on the 2nd
   and fails on the 15th is not a test. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

/* A month of data, relative to a frozen "now". */
const NOW = new Date('2026-10-02T12:00:00');
const day = n => { const d = new Date(NOW); d.setDate(d.getDate() + n); return d.toISOString(); };
const key = n => day(n).slice(0, 10);
const mk = key(0).slice(0, 7);
let n = 0;
const L = o => Object.assign({ id: 'L' + (++n), type:'ENQUIRY', zip:'63376', dogs:'1', service:'weekly',
  price:'$85/mo, weekly service, 1 dog', status:'new', crmnotes:'[QA:w] ', created: day(0) }, o);
const ROWS = [
  L({ name:'New Nora', phone:'6363754301', email:'n@gmail.com',
      address:'1064 Wyndgate Ridge Dr, Lake St Louis, MO 63367', zip:'63367',
      honored:'2027-03-30T05:00:00.000Z', crmnotes:'[SRC:Google (organic)] [QA:w] ' }),
  L({ name:'Called Carl', phone:'6363754302', email:'c@gmail.com', status:'called',
      crmnotes:'[FU:' + key(2) + '] [ATT:1@' + key(-1) + '] [QA:w] ', created: day(-2) }),
  L({ name:'Accepted Ann', phone:'6363754303', email:'a@gmail.com', type:'ACTIVATE',
      crmnotes:'[IC:w] [QA:a] ', created: day(-1) }),
  L({ name:'Closed Chris', phone:'6363754304', email:'ch@gmail.com', type:'ACTIVATE', status:'closed',
      crmnotes:'[CD:' + key(-3) + '] [SD:' + key(-1) + '] [SRC:Meta Ads] [QA:a] ', created: day(-6) }),
  L({ name:'Manual Mia', phone:'6363754306', email:'m@gmail.com', manual:'YES',
      price:'custom, to be quoted', yard:'OVER 1/4 acre (manual review)', crmnotes:'[QA:w] [MR:yard] ', created: day(-1) }),
  L({ name:'Passed Pat', phone:'6363754305', email:'p@gmail.com', status:'lost',
      crmnotes:'[SRC:Google Ads] [QA:w] went elsewhere', created: day(-8) }),
];
// traffic so the dashboards have something to draw, and this month's spend
for (let d = 0; d < 14; d++) for (let i = 0; i < 5; i++)
  ROWS.push({ id:'v'+d+'_'+i, type:'VIEW', name:'Home', yard:'s'+d+i, service:'Meta Ads', created: day(-d) });
ROWS.push({ id:'sp1', type:'SPEND', zip: mk, name:'Meta Ads', price:'$220', created: day(-1) });
ROWS.push({ id:'sp2', type:'SPEND', zip: mk, name:'Google Ads', price:'$180', created: day(-1) });

async function open(b, at, opts){
  const p = await b.newPage(Object.assign({ viewport:{ width:430, height:932 } }, opts || {}));
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: at });
  stubNetwork(p, { leads: ROWS });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
  return { p, errs };
}
const txt = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ');
/* Is this text on screen inside the card? Looks at TEXT NODES, not leaf
   elements: "Follow up on:" is a bare text node sitting next to an input
   inside a div that has children, so a leaf-element search never sees it.
   (The first version of this helper got that wrong and blamed the page.) */
const visibleIn = (p, cardId, text) => p.evaluate(([id, t]) => {
  const c = document.getElementById('card-' + id);
  return Array.from(c.querySelectorAll('*')).some(el => {
    const own = Array.from(el.childNodes).some(nd => nd.nodeType === 3 && nd.textContent.indexOf(t) >= 0);
    if (!own) return false;
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0;
  });
}, [cardId, text]);

(async () => {
  const b = await launch();
  const { p, errs } = await open(b, NOW);

  /* ---- 1. the leads come first ---- */
  const firstCard = await p.evaluate(() => document.querySelector('#list .card').getBoundingClientRect().top + scrollY);
  ok('the first lead is within one phone screen of the top (was two screens down)',
     firstCard < 932, firstCard + 'px');
  ok('the dashboards are shut by default', !(await p.isVisible('#numbers')));
  ok('the summary row is still at the top', await p.isVisible('#stats'));
  ok('but the Traffic/revenue/spend button is there', await p.isVisible('#numbersBtn'));

  await p.click('#numbersBtn'); await p.waitForTimeout(300);
  ok('one tap opens them', await p.isVisible('#numbers') && await p.isVisible('#traffic'));
  ok('and the button says so to a screen reader',
     (await p.getAttribute('#numbersBtn', 'aria-expanded')) === 'true');
  await p.reload(); await p.waitForTimeout(1200);
  ok('the choice is remembered across a reload', await p.isVisible('#numbers'));
  await p.click('#numbersBtn'); await p.waitForTimeout(300);
  ok('and can be shut again', !(await p.isVisible('#numbers')));

  /* ---- 2. a card shows the controls for where its lead is ---- */
  const h = async id => p.evaluate(i => document.getElementById('card-' + i).getBoundingClientRect().height, id);
  const nora = await h('L1');
  ok('a new lead\'s card is shorter than the old 555px', nora < 480, nora + 'px');
  ok('a new lead can be chased: follow-up date showing', await visibleIn(p, 'L1', 'Follow up on'));
  ok('a web lead already shown a price is not pushed "Email quote" again', !(await visibleIn(p, 'L1', 'Email quote')));
  ok('but not booked yet: no First visit row', !(await visibleIn(p, 'L1', 'First visit')));
  ok('it has a More button for the rest', await p.isVisible('#morebtn-L1'));
  await p.click('#morebtn-L1'); await p.waitForTimeout(200);
  ok('More reveals the First visit row - nothing was removed', await visibleIn(p, 'L1', 'First visit'));
  ok('and Email quote is still there under More', await visibleIn(p, 'L1', 'Email quote'));
  ok('the hidden date input was in the page all along, so Save still finds it',
     await p.evaluate(() => !!document.getElementById('sd-L1')));

  ok('a lead we still owe a price DOES get Email quote up front', await visibleIn(p, 'L5', 'Email quote'));
  ok('an accepted lead shows First visit up front', await visibleIn(p, 'L3', 'First visit'));
  ok('and does not push a quote at somebody who already said yes', !(await visibleIn(p, 'L3', 'Email quote')));
  ok('a closed customer shows First visit', await visibleIn(p, 'L4', 'First visit'));
  ok('a closed customer is not offered +1 attempt', !(await visibleIn(p, 'L4', '+1 attempt')));
  ok('a passed lead is compact: no quote, no follow-up, no attempt',
     !(await visibleIn(p, 'L6', 'Email quote')) && !(await visibleIn(p, 'L6', 'Follow up on')) &&
     !(await visibleIn(p, 'L6', '+1 attempt')));
  const pat = await h('L6');
  ok('a passed lead\'s card is small', pat < 380, pat + 'px');
  ok('status buttons and notes are on every card regardless',
     await visibleIn(p, 'L6', 'Not interested') && await p.isVisible('#note-L6'));

  /* ---- 3. two bits of polish that looked sloppy on a real card ---- */
  const c1 = await txt(p, '#card-L1');
  ok('the ZIP is not printed twice after an address that already has it',
     !/63367, 63367/.test(c1), c1.match(/63367.{0,12}/) && c1.match(/63367.{0,12}/)[0]);
  ok('"honored until" is a date a person reads, not an ISO timestamp',
     /honored until Mar 30, 2027/.test(c1) && !/T05:00/.test(c1), c1.match(/honored until [^·]+/) && c1.match(/honored until [^·]+/)[0]);

  /* ---- 4. tap targets ---- */
  const small = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.chip, .copybtn, .stbtns button, .stbtns a, header button, .morebtn, #reviews button, .meta a').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 36) out.push(Math.round(r.height) + 'px ' + el.textContent.trim().slice(0, 20));
    });
    return out;
  });
  ok('no chip, toolbar, status, review button - or phone/email link - is under 36px tall', small.length === 0, small.slice(0, 6).join(' | '));

  ok('no page errors', errs.length === 0, errs.join('; '));
  await p.close();

  /* ---- 5. the ad-spend panel holds its verdict early in the month ---- */
  {
    const { p: e } = await open(b, NOW);                      // 2 October, nothing closed
    await e.click('#numbersBtn'); await e.waitForTimeout(300);
    const v = await e.getAttribute('#roi [data-verdict]', 'data-verdict');
    ok('on the 2nd with $400 spent and nothing closed, the box is grey "too early", not red 0.0x',
       v === 'too-early', v);
    const roi = await txt(e, '#roi');
    ok('and says so in words', /too early to judge/.test(roi) && !/0\.0× back|0\.0&times; back/.test(roi));
    ok('the amber "no ad-sourced customer" warning is not stacked on top of it',
       !/no ad-sourced customer/.test(roi));
    await e.close();
  }
  {
    const late = new Date('2026-10-20T12:00:00');
    const { p: e } = await open(b, late);                     // 20 October, still nothing closed
    await e.click('#numbersBtn'); await e.waitForTimeout(300);
    const v = await e.getAttribute('#roi [data-verdict]', 'data-verdict');
    ok('by the 20th with still nothing closed, it is allowed to be red', v === 'bad', v);
    ok('and the amber warning comes back', /no ad-sourced customer/.test(await txt(e, '#roi')));
    await e.close();
  }

  await b.close();
  done();
})();
