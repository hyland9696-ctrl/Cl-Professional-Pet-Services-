/* Team phones.

   Corey: "some of the traffic for the website today was me." Anyone on the
   team who opens the site to check something is a visitor, and any form
   they send is a lead, and every figure drifts a little. A phone marked as
   a team phone sends no page views, and a form from it lands as a labelled
   test lead that never reaches the numbers. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

async function fillQuote(p, who){
  await p.fill('#q-zip', '63376'); await p.waitForTimeout(400);
  await p.fill('#qf2-name', who); await p.fill('#qf2-phone', '6363754342');
  await p.fill('#qf2-email', 't@gmail.com'); await p.fill('#qf2-addr', '1 Test Lane');
  await p.click('#q-see-btn'); await p.waitForTimeout(700);
}

(async () => {
  const b = await launch();

  /* ---- a normal phone: everything as before ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const posts = [], mails = [];
    stubNetwork(p, { posts, mails });
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
    await fillQuote(p, 'Real Rhonda');
    ok('a normal phone sends page views', posts.some(l => l && l.type === 'VIEW'));
    ok('a normal phone sends a price view', posts.some(l => l && l.type === 'QVIEW'));
    const lead = posts.find(l => l && l.type === 'ENQUIRY');
    ok('a normal lead carries no test label and is not silent', lead && !/\[TM:1\]/.test(lead.crmnotes) && !lead.silent, lead && lead.crmnotes);
    const mail = mails.find(m => /QUOTE REQUEST/.test(m._subject));
    ok('and the office email is the normal one', mail && !/TEST/.test(mail._subject), mail && mail._subject);
    ok('Reply on the office email goes to the customer, not the form service', mail && mail._replyto === 't@gmail.com', mail && mail._replyto);
    await ctx.close();
  }

  /* ---- ?team=1 marks the phone; from then on it is not a visitor ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const posts = [], mails = [];
    stubNetwork(p, { posts, mails });
    await p.goto(ORIGIN + '/?team=1'); await p.waitForTimeout(700);
    ok('?team=1 sets the flag', (await p.evaluate(() => localStorage.getItem('clpps_team'))) === '1');
    ok('no page view is sent from a team phone', !posts.some(l => l && l.type === 'VIEW'), JSON.stringify(posts.map(l => l && l.type)));

    // a later visit, no parameter - the flag must persist
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
    await fillQuote(p, 'Corey Testing');
    ok('still no page view on the next visit', !posts.some(l => l && l.type === 'VIEW'));
    ok('no price view either', !posts.some(l => l && l.type === 'QVIEW'));
    const lead = posts.find(l => l && l.type === 'ENQUIRY');
    ok('the form still goes through - that is the point of testing', !!lead);
    ok('but labelled as a test', lead && /^\[TM:1\] /.test(lead.crmnotes), lead && lead.crmnotes);
    ok('and silent, so nobody\'s phone buzzes', lead && lead.silent === 1);
    const mail = mails.find(m => /QUOTE REQUEST/.test(m._subject));
    ok('the office email still arrives, but says it is a test', mail && /^\[TEST - team phone\]/.test(mail._subject), mail && mail._subject);

    // a city page from the same phone
    const c = await ctx.newPage();
    const cposts = [];
    stubNetwork(c, { posts: cposts });
    await c.goto(ORIGIN + '/st-peters/'); await c.waitForTimeout(600);
    ok('a city page sends no view from a team phone', !cposts.some(l => l && l.type === 'VIEW'));
    await c.close();

    // ?team=0 undoes it
    await p.goto(ORIGIN + '/?team=0'); await p.waitForTimeout(700);
    ok('?team=0 clears the flag', (await p.evaluate(() => localStorage.getItem('clpps_team'))) === null);
    ok('and the phone is a visitor again', posts.some(l => l && l.type === 'VIEW'));
    await ctx.close();
  }

  /* ---- the tracker keeps test leads apart from real ones ---- */
  {
    const ctx = await b.newContext({ viewport:{ width:430, height:1400 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const posts = [];
    const now = new Date().toISOString();
    const rows = [
      { id:'r1', type:'ENQUIRY', name:'Real Rhonda', phone:'6363754342', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', created: now },
      { id:'t1', type:'ENQUIRY', name:'Corey Testing', phone:'6363754342', zip:'63376', dogs:'1', service:'weekly', price:'$85/mo', status:'new', crmnotes:'[TM:1] [QA:w] ', created: now },
      { id:'t2', type:'ACTIVATE', name:'Jesse Test', phone:'6363754342', zip:'63376', dogs:'2', service:'weekly', price:'$91/mo', status:'new', crmnotes:'[TM:1] [SRC:Meta Ads] [IC:w] [QA:a] ', created: now },
    ];
    // the tracker posts whole bodies ({action, id, status}), not {lead};
    // the later-registered route wins in Playwright, so this one goes last
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => {
      if (r.request().method() === 'POST'){ try { posts.push(JSON.parse(r.request().postData())); } catch (e) {} }
      return r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, leads: rows }) });
    });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
    const names = await p.$$eval('#list .card .who', els => els.map(e => e.textContent.trim()));
    ok('the real lead is in the list', names.includes('Real Rhonda'), names.join(' | '));
    ok('the test leads are not', !names.includes('Corey Testing') && !names.includes('Jesse Test'), names.join(' | '));
    const stats = (await p.textContent('#stats')).replace(/\s+/g, ' ');
    ok('the summary counts one lead, not three', /1 INTERESTED/i.test(stats) || /1\s*Interested/i.test(stats), stats);
    const ins = (await p.textContent('#insights')).replace(/\s+/g, ' ');
    ok('the test activation is not in the close rate', !/100% of 2|Meta Ads 100%/.test(ins));
    const btn = (await p.textContent('#testBtn')).trim();
    ok('the toolbar button shows how many test leads there are', /Test leads \(2\)/.test(btn), btn);
    await p.click('#testBtn'); await p.waitForTimeout(400);
    const panel = (await p.textContent('#test-body')).replace(/\s+/g, ' ');
    ok('the panel lists them', /Corey Testing/.test(panel) && /Jesse Test/.test(panel));
    ok('and says this phone is currently a visitor', /counted as a visitor/.test(panel));
    await p.click('#test-body button.copybtn'); await p.waitForTimeout(300);   // the first button is the toggle
    ok('the toggle marks this phone as a team phone', (await p.evaluate(() => localStorage.getItem('clpps_team'))) === '1');
    ok('and the panel says so', /team phone/.test((await p.textContent('#test-body')).replace(/\s+/g, ' ')));
    await p.click('#test-body button:has-text("Remove")'); await p.waitForTimeout(300);
    ok('removing a test lead tells the sheet', posts.some(x => x && x.action === 'update' && x.status === 'deleted'));
    ok('and it leaves the panel', !/Corey Testing/.test((await p.textContent('#test-body')).replace(/\s+/g, ' ')) || !/Jesse Test/.test((await p.textContent('#test-body')).replace(/\s+/g, ' ')));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  await b.close();
  done();
})();
