/* What Meta is told, and when.

   Corey's ads optimise on whatever event the site sends, so the events
   have to mean one thing each and fire once. A fake pixel records every
   call; nothing reaches Facebook. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

/* The pixel snippet queues calls until fbevents.js loads; our stand-in
   drains that queue into a list and records everything after. */
const RECORDER = 'var q=(window.fbq&&window.fbq.queue)||[];window.__fb=[];' +
  'window.fbq=function(){window.__fb.push([].slice.call(arguments));};' +
  'q.forEach(function(a){window.__fb.push([].slice.call(a));});';
async function wire(p){
  stubNetwork(p, {});
  await p.route('**/connect.facebook.net/**', r => r.fulfill({ contentType:'application/javascript', body: RECORDER }));
}
const events = (p) => p.evaluate(() => (window.__fb || []).map(a => a[0] === 'init' ? 'init' : a[1] + (a[0] === 'trackCustom' ? '*' : '')));
const paramsOf = (p, name) => p.evaluate(n => ((window.__fb || []).find(a => a[1] === n) || [])[2], name);

async function toPrice(p, who){
  await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
  await p.fill('#q-zip', '63376'); await p.waitForTimeout(400);
  await p.fill('#qf2-name', who); await p.fill('#qf2-phone', '6363754342');
  await p.fill('#qf2-email', 'px@gmail.com'); await p.fill('#qf2-addr', '1 Test Lane');
  await p.click('#q-see-btn'); await p.waitForTimeout(800);
}

(async () => {
  const b = await launch();

  /* ---- the main path: quote requested, then activated ---- */
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await wire(p);
    await toPrice(p, 'Pixel Pat');
    let ev = await events(p);
    ok('the pixel is initialised and sends PageView', ev[0] === 'init' && ev.includes('PageView'), ev.join(','));
    ok('seeing a price sends ViewContent', ev.includes('ViewContent'), ev.join(','));
    ok('handing over name and phone sends CompleteRegistration', ev.includes('CompleteRegistration'), ev.join(','));
    const cr = await paramsOf(p, 'CompleteRegistration');
    ok('with the price as its value (1 dog weekly, Standard ZIP: $85)', cr && cr.value === 85 && cr.currency === 'USD' && cr.status === 'priced', JSON.stringify(cr));
    ok('and no Lead yet - nothing has been agreed to', !ev.includes('Lead'), ev.join(','));

    // changing their answers re-shows a price but must not re-register them
    await p.evaluate(() => { qSet('freq', 'biweekly', document.querySelector('[data-v="biweekly"]')); document.getElementById('q-see-btn').click(); });
    await p.waitForTimeout(600);
    ev = await events(p);
    ok('CompleteRegistration fires once per visit, whatever they change', ev.filter(e => e === 'CompleteRegistration').length === 1, ev.join(','));

    await p.check('#qf2-tos');
    await p.click('#q-yes-btn'); await p.waitForTimeout(800);
    ev = await events(p);
    ok('activating sends Lead, once', ev.filter(e => e === 'Lead').length === 1, ev.join(','));
    ok('no page errors', errs.length === 0, errs.join('; '));
    await p.close();
  }

  /* ---- the other answer: a decline is a custom event, never a Lead ---- */
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    await wire(p);
    await toPrice(p, 'Pixel Nope');
    await p.click('#q-no-btn'); await p.waitForTimeout(300);
    await p.selectOption('#q-why', { index: 1 });
    await p.click('#q-no-send'); await p.waitForTimeout(800);
    const ev = await events(p);
    ok('a decline sends the custom QuoteDeclined', ev.includes('QuoteDeclined*'), ev.join(','));
    ok('and never a Lead', !ev.includes('Lead'), ev.join(','));
    ok('CompleteRegistration still fired for the form itself', ev.includes('CompleteRegistration'));
    await p.close();
  }

  /* ---- a team phone still fires the pixel: Meta is Corey's to filter ---- */
  {
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    await wire(p);
    await p.goto(ORIGIN + '/?team=1'); await p.waitForTimeout(600);
    const ev = await events(p);
    ok('PageView fires on a team phone (the pixel is not the tracker)', ev.includes('PageView'), ev.join(','));
    await p.close();
  }

  await b.close();
  done();
})();
