/* The email blast. Jesse: "send out a seasonal promotion to their email to
   try and get them interested." One message, one email per person from the
   business account, everyone stamped so a re-run only reaches the missed. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

/* ---- the backend's pure parts ---- */
{
  const gs = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8');
  ok('code.txt is byte-identical to apps-script.gs', gs === fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'code.txt'), 'utf8'));
  const fill = new Function(gs + '\nreturn fillBlast_;')();
  ok('the backend fills first name, price and plan', fill('Hi {first}, {price} for {plan}', { first: 'Dana', price: '$85/mo', plan: 'weekly' }) === 'Hi Dana, $85/mo for weekly');
  ok('and has words for the blanks', fill('Hi {first}, {price} for {plan}', {}) === 'Hi there, your quoted price for your plan');
  ok('blast and quota need the key', /action === 'blast'[^]*?bad pin/.test(gs) && /action === 'quota'[^]*?bad pin/.test(gs));
  ok('a batch is capped and the message clipped', /BLAST_MAX = 60/.test(gs) && /slice\(0, BLAST_MAX\)/.test(gs) && /clip_\(body\.body, BLAST_BODY_MAX\)/.test(gs));
  ok('every send is stamped on the lead and goes through the office mailbox, reply-to the office', /\[EM:' \+ tag \+ '@/.test(gs) && /sendCustomerMail_\(\{ to: email, subject: fillBlast_/.test(gs) && /replyTo: o\.replyTo \|\| NOTIFY_CC/.test(gs) && /address: o\.replyTo \|\| c\.from/.test(gs));
}

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  const now = new Date().toISOString();
  const rows = [
    { id:'q1', type:'ENQUIRY', name:'Quoted Quinn', phone:'6363750001', email:'quinn@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: now },
    { id:'q2', type:'ENQUIRY', name:'Called Cal', phone:'6363750002', email:'cal@gmail.com', zip:'63376', dogs:'2', service:'every other week', price:'$75/mo', status:'called', crmnotes:'[QA:w] ', created: now },
    { id:'q3', type:'ENQUIRY', name:'No Email Ned', phone:'6363750003', email:'', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: now },
    { id:'q4', type:'ENQUIRY', name:'Dup Dora', phone:'6363750004', email:'Quinn@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: now },
    { id:'q5', type:'ENQUIRY', name:'Opted Out Olive', phone:'6363750005', email:'olive@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called', crmnotes:'[NOEM:1] [QA:w] ', created: now },
    { id:'q6', type:'ENQUIRY', name:'Already Al', phone:'6363750006', email:'al@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'called', crmnotes:'[EM:fall2026@2026-11-01] [QA:w] ', created: now },
    { id:'q7', type:'ENQUIRY', name:'Team Tess', phone:'6363750007', email:'tess@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[TM:1] [QA:w] ', created: now },
    { id:'n1', type:'DECLINED', name:'Said No Sam', phone:'6363750008', email:'sam@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:d] too much', created: now },
    { id:'a1', type:'ENQUIRY', name:'Active Ann', phone:'6363750009', email:'ann@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'closed', crmnotes:'[CD:2026-06-01] [QA:a] ', created: now },
    { id:'g1', type:'ENQUIRY', name:'Gone Gus', phone:'6363750010', email:'gus@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'cancelled', crmnotes:'[CD:2026-01-01] [CX:2026-08-01] [CXR:moved] [QA:a] ', created: now },
    { id:'g2', type:'ENQUIRY', name:'Nonpay Nick', phone:'6363750011', email:'nick@gmail.com', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'cancelled', crmnotes:'[CD:2026-01-01] [CX:2026-08-01] [CXR:nonpay] [QA:a] ', created: now },
  ];
  const posts = [];
  stubNetwork(p, {});
  await p.route('**/script.google.com/**', r => {
    let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (body.action) posts.push(body);
    if (body.action === 'quota') return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, remaining: 97 }) });
    if (body.action === 'blast'){
      // the backend sends all but one, whose address bounces
      const sent = body.to.filter(x => x.id !== 'q2').map(x => x.id), failed = body.to.filter(x => x.id === 'q2').map(x => ({ id: x.id, error: 'Invalid email' }));
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, sent, failed, remaining: 97 - sent.length, tag: body.tag }) });
    }
    return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
  });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
  await p.click('#blastBtn'); await p.waitForTimeout(600);
  ok('the panel asks the backend how many emails are left today', posts.some(x => x.action === 'quota' && x.key) && /send 97 more today/.test(await p.textContent('#bl-quota')));
  const who = (await p.textContent('#bl-who')).replace(/\s+/g, ' ');
  ok('the groups show who has an email: quoted 4 (Quinn, Cal, Dora, Olive, Al minus... counts those with an email)', /Quoted, not signed up yet .*· 5 with an email/.test(who) && /Said no .*· 1 with an email/.test(who) && /Active customers .*· 1 with an email/.test(who) && /Former customers .*· 1 with an email/.test(who), who);
  ok('the team phone\'s test lead is not counted anywhere', !/6 with an email/.test(who));
  ok('nothing can be sent before the message is written', await p.$eval('#bl-send', e => e.disabled));

  await p.click('button:has-text("Seasonal promotion")'); await p.waitForTimeout(300);
  ok('the preset fills the name, subject and body', (await p.inputValue('#bl-tag')) === 'fall2026' && /leaves are coming/.test(await p.inputValue('#bl-subject')) && /\{price\}/.test(await p.inputValue('#bl-body')));
  const pv = await p.textContent('#bl-preview');
  ok('the preview is the first person\'s actual email, filled in, with the legal footer', /To: quinn@gmail\.com/.test(pv) && /Subject: Quoted, your yard price is still good/.test(pv) && /Your price of \$85\/mo for weekly still stands/.test(pv) && /Reply STOP/.test(pv) && /St\. Peters, MO/.test(pv), pv.slice(0, 300));
  const status = await p.textContent('#bl-status');
  ok('it says who is left out and why', /1 with no email/.test(status) && /1 asked not to be emailed/.test(status) && /1 already got “fall2026”/.test(status) && /1 duplicate address/.test(status), status);
  ok('the button counts the real audience: Quinn, Cal, Sam', /Send to 3 people/.test(await p.textContent('#bl-send')), await p.textContent('#bl-send'));

  // widen to active customers too
  await p.$$eval('#bl-who input', els => els[2].click()); await p.waitForTimeout(200);
  ok('ticking Active customers adds Ann', /Send to 4 people/.test(await p.textContent('#bl-send')));
  await p.click('#bl-send'); await p.waitForTimeout(1200);
  const blast = posts.find(x => x.action === 'blast');
  ok('one signed post carries the message once and the people as small records', blast && blast.key && blast.tag === 'fall2026' && /\{first\}/.test(blast.subject) && /Reply STOP/.test(blast.body) && blast.to.length === 4 && blast.to.every(r => r.id && r.email && r.first), blast && JSON.stringify(blast.to));
  ok('each person\'s record has their price and plan words', blast.to.some(r => r.id === 'q2' && r.price === '$75/mo' && r.plan === 'every other week'));
  const out = (await p.textContent('#bl-out')).replace(/\s+/g, ' ');
  ok('the result says what went and what did not', /3 emails sent as “fall2026”/.test(out) && /1 not sent: Called \(Invalid email\)/.test(out), out);
  const quinn = await p.evaluate(() => fuParse(leads.filter(l => l.id === 'q1')[0].crmnotes).em);
  ok('the sent ones are stamped on the phone too', /^fall2026@\d{4}-\d{2}-\d{2}$/.test(quinn), quinn);
  await p.waitForTimeout(300);
  ok('and would not be picked again for the same promotion', /Send to 1 person/.test(await p.textContent('#bl-send')) && /4 already got “fall2026”/.test(await p.textContent('#bl-status')), await p.textContent('#bl-status'));
  ok('the card shows what they were sent', /emailed: fall2026 on \d{4}-\d{2}-\d{2}/.test(await p.textContent('#card-q1')));

  /* ---- the opt-out, from the card ---- */
  await p.evaluate(() => openMore('a1')); await p.waitForTimeout(200);
  await p.click('#card-a1 .noem-box'); await p.waitForTimeout(400);
  const noem = posts.find(x => x.action === 'update' && x.id === 'a1' && /\[NOEM:1\]/.test(x.notes));
  ok('No marketing emails writes the marker', !!noem, JSON.stringify(posts.filter(x => x.id === 'a1').slice(-1)));
  await p.click('button:has-text("Referral ask")'); await p.waitForTimeout(300);
  ok('the referral preset goes to active customers only, and Ann is now left out', /Send to 0 people/.test(await p.textContent('#bl-send')) && /1 asked not to be emailed/.test(await p.textContent('#bl-status')), await p.textContent('#bl-status'));
  ok('the win-back preset skips accounts closed over money', (await p.click('button:has-text("Win-back")'), await p.waitForTimeout(300), /Send to 1 person/.test(await p.textContent('#bl-send'))) && /To: gus@gmail\.com/.test(await p.textContent('#bl-preview')));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
