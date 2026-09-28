/* The order leads appear in.

   Jesse: "can you make them in date order so the most recent is at the top
   when I clicked called"

   They were sorted by urgency, not date - anything overdue or awaiting an
   authorization was hoisted to the top whatever its date. Under "Called"
   that is most of the list, because a called lead usually has a follow-up
   booked, so months-old leads sat above this morning's and the order
   looked arbitrary.

   These fix the order in place and make sure the thing the old sort was
   protecting - an overdue follow-up going unnoticed - is still covered. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const day = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};
const dayKey = n => day(n).slice(0, 10);

/* Deliberately built so date order and urgency order DISAGREE: the oldest
   lead is the one with the overdue follow-up, so if the old sort were
   still in place it would be sitting at the top. */
const LEADS = [
  { id:'L1', type:'ENQUIRY', name:'Oldest Olive', phone:'6363754301', email:'o@gmail.com',
    zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called',
    crmnotes:'[FU:' + dayKey(-3) + '] [QA:w] rang, chasing', created: day(-30) },
  { id:'L2', type:'ENQUIRY', name:'Middle Mary', phone:'6363754302', email:'m@gmail.com',
    zip:'63376', dogs:'2', service:'weekly', price:'$91/mo', status:'called',
    crmnotes:'[QA:w] ', created: day(-10) },
  { id:'L3', type:'ENQUIRY', name:'Newest Nora', phone:'6363754303', email:'n@gmail.com',
    zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called',
    crmnotes:'[QA:w] ', created: day(-1) },
  { id:'L4', type:'ENQUIRY', name:'Brand New Bob', phone:'6363754304', email:'b@gmail.com',
    zip:'63376', dogs:'3', service:'weekly', price:'$97/mo', status:'new',
    crmnotes:'[QA:w] ', created: day(0) },
  { id:'L5', type:'ENQUIRY', name:'Closed Chris', phone:'6363754305', email:'c@gmail.com',
    zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed',
    // an overdue date on a finished lead must NOT count as work outstanding
    crmnotes:'[FU:' + dayKey(-5) + '] [CD:' + dayKey(-4) + '] [QA:a] ', created: day(-20) },
  { id:'L6', type:'ENQUIRY', name:'No Date Nigel', phone:'6363754306', email:'x@gmail.com',
    zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called',
    crmnotes:'[QA:w] ', created: '' },
];

(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport:{ width:1100, height:2400 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  stubNetwork(p, { leads: LEADS });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);

  const shown = () => p.$$eval('#list .card .who', els => els.map(e => e.textContent.trim()));
  /* Click by the filter the chip sets, not by its text. has-text is a
     substring match, so "Interested" also matches "Not interested" - which
     is how this test first reported a bug that was its own. */
  const chip = key => p.evaluate(k => {
    const b = Array.from(document.querySelectorAll('#chips button'))
      .find(x => (x.getAttribute('onclick') || '').indexOf("filter='" + k + "'") >= 0);
    if (!b) throw new Error('no chip for filter ' + k);
    b.click();
  }, key);

  /* ---- the thing actually asked for ---- */
  await chip('called'); await p.waitForTimeout(400);
  let order = await shown();
  ok('under Called, the most recent is at the top',
     order[0] === 'Newest Nora', order.join(' | '));
  ok('and the rest run newest to oldest',
     order.slice(0, 3).join() === ['Newest Nora','Middle Mary','Oldest Olive'].join(),
     order.join(' | '));
  ok('an overdue follow-up no longer jumps the queue',
     order.indexOf('Oldest Olive') > order.indexOf('Newest Nora'), order.join(' | '));
  ok('a lead with no usable date sinks to the bottom, not the top',
     order[order.length - 1] === 'No Date Nigel', order.join(' | '));

  /* ---- and the same everywhere else ---- */
  await chip('all'); await p.waitForTimeout(400);
  order = await shown();
  ok('All is newest first too',
     order.slice(0, 2).join() === ['Brand New Bob','Newest Nora'].join(), order.join(' | '));
  const dated = order.filter(n => n !== 'No Date Nigel');
  const want = ['Brand New Bob','Newest Nora','Middle Mary','Closed Chris','Oldest Olive'];
  ok('every dated lead is in date order across the whole list',
     dated.join() === want.join(), dated.join(' | '));

  await chip('interested'); await p.waitForTimeout(400);
  order = await shown();
  ok('Interested is newest first', order[0] === 'Brand New Bob', order.join(' | '));

  /* ---- what the old sort was protecting must still be reachable ---- */
  const chips = await p.$$eval('#chips button', els => els.map(e => e.textContent.trim()));
  ok('there is a Follow-up due chip', chips.some(c => /Follow-up due/.test(c)), chips.join(' | '));
  ok('and it counts only the one that is really outstanding',
     chips.some(c => /Follow-up due \(1\)/.test(c)), chips.join(' | '));

  await chip('followup'); await p.waitForTimeout(400);
  order = await shown();
  ok('it shows the overdue lead', order.indexOf('Oldest Olive') >= 0, order.join(' | '));
  ok('and nothing else', order.length === 1, order.join(' | '));
  ok('a closed lead with an old follow-up date is not counted as work',
     order.indexOf('Closed Chris') < 0, order.join(' | '));

  /* ---- the card still says so itself, which is why burying it is safe ---- */
  const card = (await p.textContent('#card-L1')).replace(/\s+/g, ' ');
  ok('the overdue lead still shouts on its own card', /Follow-up due/.test(card), card.slice(0, 160));

  ok('no page errors', errs.length === 0, errs.join('; '));
  await b.close();
  done();
})();
