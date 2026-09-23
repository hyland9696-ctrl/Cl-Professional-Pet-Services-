/* The validation as a customer and the office actually meet it. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();
const wire = (p, posts) => stubNetwork(p, { posts: posts });

async function fill(p, phone, email){
  await p.fill('#qf2-name', 'Test Person');
  await p.fill('#qf2-phone', phone);
  await p.fill('#qf2-email', email);
  await p.fill('#qf2-addr', '1 Test Lane');
}

(async () => {
  const b = await launch();

  /* ---- a fake number cannot get a price ---- */
  {
    const posts = [];
    const p = await b.newPage({ viewport:{ width:430, height:1500 } });
    wire(p, posts);
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
    await p.fill('#q-zip','63376'); await p.waitForTimeout(400);
    await fill(p, '1234567890', 'x@gmail.com');
    await p.click('#q-see-btn'); await p.waitForTimeout(500);
    const err = (await p.textContent('#q-formerr')).replace(/\s+/g,' ').trim();
    ok('a made-up number is turned away', /area code isn|isn’t a real/i.test(err), err);
    ok('and nothing is filed for them', posts.filter(l => l.type === 'ENQUIRY').length === 0);
    ok('they never reach the price step', !(await p.isVisible('#qp2')));

    // fix it and they sail through
    await p.fill('#qf2-phone', '6363754342');
    await p.click('#q-see-btn'); await p.waitForTimeout(700);
    ok('a real number goes straight through', await p.isVisible('#qp2'));
    ok('and is filed', posts.filter(l => l.type === 'ENQUIRY').length === 1);
    await p.close();
  }

  /* ---- an email typo offers the fix, one tap ---- */
  {
    const posts = [];
    const p = await b.newPage({ viewport:{ width:430, height:1500 } });
    wire(p, posts);
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
    await p.fill('#q-zip','63376'); await p.waitForTimeout(400);
    await fill(p, '6363754342', 'jesse@gmial.com');
    await p.click('#q-see-btn'); await p.waitForTimeout(500);
    const err = (await p.textContent('#q-formerr')).replace(/\s+/g,' ').trim();
    ok('a mistyped domain is spotted', /Did you mean/i.test(err), err);
    ok('and the right address is offered', /jesse@gmail\.com/.test(err), err);
    ok('with a button rather than a telling-off', await p.isVisible('.zip-msg .fixmail'));

    await p.click('.zip-msg .fixmail'); await p.waitForTimeout(300);
    ok('tapping it corrects the field',
       (await p.inputValue('#qf2-email')) === 'jesse@gmail.com', await p.inputValue('#qf2-email'));
    await p.click('#q-see-btn'); await p.waitForTimeout(700);
    ok('and then they get their price', await p.isVisible('#qp2'));
    const lead = posts.filter(l => l.type === 'ENQUIRY')[0];
    ok('the corrected address is what gets filed',
       lead && lead.email === 'jesse@gmail.com', lead && lead.email);
    await p.close();
  }

  /* ---- a throwaway inbox is refused ---- */
  {
    const p = await b.newPage({ viewport:{ width:430, height:1500 } });
    wire(p, []);
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
    await p.fill('#q-zip','63376'); await p.waitForTimeout(400);
    await fill(p, '6363754342', 'someone@mailinator.com');
    await p.click('#q-see-btn'); await p.waitForTimeout(500);
    ok('a burner address is refused',
       /throwaway/i.test(await p.textContent('#q-formerr')), await p.textContent('#q-formerr'));
    await p.close();
  }

  /* ---- and a 555 number STILL gets a price, because it might be real ---- */
  {
    const p = await b.newPage({ viewport:{ width:430, height:1500 } });
    wire(p, []);
    await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
    await p.fill('#q-zip','63376'); await p.waitForTimeout(400);
    await fill(p, '6365551234', 'someone@gmail.com');
    await p.click('#q-see-btn'); await p.waitForTimeout(700);
    ok('a doubtful-but-possible number is NOT blocked', await p.isVisible('#qp2'));
    await p.close();
  }

  /* ---- what the office sees ---- */
  {
    const now = new Date().toISOString();
    const rows = [
      { id:'c1', type:'ENQUIRY', name:'Fake Number Fran', phone:'1234567890',
        email:'fran@gmail.com', zip:'63376', dogs:'2', service:'weekly',
        price:'$91/mo', crmnotes:'[QA:w] ', created:now, status:'new' },
      { id:'c2', type:'ENQUIRY', name:'Five Five Five', phone:'(636) 555-1234',
        email:'five@gmail.com', zip:'63376', dogs:'1', service:'weekly',
        price:'$85/mo', crmnotes:'[QA:w] ', created:now, status:'new' },
      { id:'c3', type:'ENQUIRY', name:'Typo Tina', phone:'6363754342',
        email:'tina@gmial.com', zip:'63376', dogs:'1', service:'weekly',
        price:'$85/mo', crmnotes:'[QA:w] ', created:now, status:'new' },
      { id:'c4', type:'ENQUIRY', name:'Perfectly Fine Pat', phone:'6363754342',
        email:'pat@gmail.com', zip:'63376', dogs:'1', service:'weekly',
        price:'$85/mo', crmnotes:'[QA:w] ', created:now, status:'new' },
    ];
    const p = await b.newPage({ viewport:{ width:1100, height:1800 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    stubNetwork(p, { leads: rows });
    await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1100);
    const card = async id => (await p.textContent('#card-' + id)).replace(/\s+/g,' ');

    const fran = await card('c1');
    ok('an impossible number is called out before anyone dials',
       /Check before you call/.test(fran) && /cannot be a real one/.test(fran), fran.slice(0,220));
    const five = await card('c2');
    ok('a 555 number gets the softer warning',
       /Worth a glance/.test(five) && /555/.test(five), five.slice(0,220));
    ok('and is not called impossible', !/Check before you call/.test(five));
    const tina = await card('c3');
    ok('a mistyped email is flagged with the likely fix',
       /mistyped/.test(tina) && /tina@gmail\.com/.test(tina), tina.slice(0,220));
    const pat = await card('c4');
    ok('and a clean lead says nothing at all',
       !/Check before you call/.test(pat) && !/Worth a glance/.test(pat), pat.slice(0,220));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await p.close();
  }

  await b.close();
  done();
})();
