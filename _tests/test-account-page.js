/* The customer's own page, /account/?t=<signed link>: what they see when
   they owe and when they are paid up, the photos from their visits, their
   referral link, and what a bad or missing link says. The script's answer
   is stubbed here; test-sweepandgo-sync.js checks the script side. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

const ACCOUNT = {
  ok: true, first: 'Eddie', status: 'active', back: '', plan: 'weekly', dogs: '2', price: '$95/mo', days: 'Thursday', since: '2025-05-01',
  visits: [
    { date: '2026-11-12', status: 'completed', skip: '', start: '09:12', minutes: 9, tech: 'Jesse' },
    { date: '2026-11-05', status: 'skipped', skip: 'Gate locked', start: '', minutes: 0, tech: '' },
  ],
  photos: { '2026-11-12': 'https://img.sweepandgo.test/eddie.jpg' },
  open: [ { number: '768-5-1', date: '2026-10-05', amount: 95, total: 95, status: 'failed', period: '2026-10-05', periodEnd: '2026-11-04', lateFee: 9.5, lateWhy: '10% of the invoice for each month past due' } ], openTotal: 95, lateFees: 9.5,
  paid: [ { date: '2026-09-05', amount: 95, how: 'credit_card' } ],
  payLink: 'https://clpps.sweepandgo.com/portal', refLink: 'https://clpropetservices.com/?ref=eddie-x1y', refUsed: 2,
};

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  stubNetwork(p, {});
  let answer = ACCOUNT; const asked = [];
  await p.route('**/script.google.com/**', r => { asked.push(r.request().url()); r.fulfill({ contentType: 'application/json', body: JSON.stringify(answer) }); });
  await p.route('**/img.sweepandgo.test/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1a3fe0000000049454e44ae426082', 'hex') }));

  await p.goto(ORIGIN + '/account/?t=E1.abc123'); await p.waitForTimeout(600);
  const txt = (await p.textContent('#app')).replace(/\s+/g, ' ');
  ok('the page asks the script with the code from the link, and nothing else', asked.length === 1 && /action=account&t=E1\.abc123$/.test(asked[0]), asked.join());
  ok('it greets them, with their plan, price, day and how long they have been with us', /Hi Eddie/.test(txt) && /Active/.test(txt) && /Plan\s*weekly · 2 dogs/.test(txt) && /Price\s*\$95\/mo/.test(txt) && /Service day\s*Thursday/.test(txt) && /With us since\s*May 1, 2025/.test(txt), txt.slice(0, 300));
  ok('what is open, invoice by invoice, with why, and a Pay now button to the portal', /Open on your account\s*\$104\.50/.test(txt) && /Late fee\s*10% of the invoice for each month past due\s*\$9\.50/.test(txt) && /Total due\s*\$104\.50/.test(txt) && /Terms of Service/.test(txt) && /Invoice 768-5-1\s*issued Oct 5, 2026 · service Oct 5 to Nov 4/.test(txt) && /card declined/.test(txt) && (await p.getAttribute('a.btn:has-text("Pay now")', 'href')) === 'https://clpps.sweepandgo.com/portal', txt.slice(txt.indexOf('Balance'), txt.indexOf('Balance') + 250));
  ok('visits newest first, the tech and minutes, the skip with its reason, the photo beside its visit', /Nov 12\s*Cleaned at 09:12 by Jesse, 9 min/.test(txt) && /Nov 5\s*Skipped: Gate locked/.test(txt) && (await p.$$('.visit img')).length === 1);
  await p.click('.visit img'); await p.waitForTimeout(150);
  ok('a tap on the photo opens it large', await p.isVisible('#big'));
  await p.click('#big'); await p.waitForTimeout(100);
  ok('payments received are listed', /Payments received\s*Sep 5, 2026\s*\$95\.00 card/.test(txt));
  ok('their own referral link, with how many times it has been used', /https:\/\/clpropetservices\.com\/\?ref=eddie-x1y/.test(txt) && /Used 2 times so far/.test(txt) && await p.isVisible('button:has-text("Share my link")'));
  ok('the page fits a phone: nothing wider than the screen', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  ok('it is kept out of search engines', (await p.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow');

  answer = Object.assign({}, ACCOUNT, { open: [], openTotal: 0 });
  await p.goto(ORIGIN + '/account/?t=E1.abc123'); await p.waitForTimeout(500);
  ok('paid up: says so, and offers the portal for card changes instead', /\$0\.00, all paid up/.test(await p.textContent('#app')) && await p.isVisible('a.btn:has-text("Update card or billing")'));

  answer = Object.assign({}, ACCOUNT, { status: 'closed', open: [], openTotal: 0 });
  await p.goto(ORIGIN + '/account/?t=E1.abc123'); await p.waitForTimeout(500);
  ok('a former customer gets a restart button instead of the referral link', /Want us back\?/.test(await p.textContent('#app')) && !(await p.isVisible('button:has-text("Share my link")')));

  answer = Object.assign({}, ACCOUNT, { payLink: 'javascript:alert(1)', photos: { '2026-11-12': 'http://not-https.test/x.jpg' } });
  await p.goto(ORIGIN + '/account/?t=E1.abc123'); await p.waitForTimeout(500);
  ok('only https links are used: a bad pay link or photo address is dropped', !(await p.isVisible('a.btn:has-text("Pay now")')) && (await p.$$('.visit img')).length === 0);

  answer = { ok: false, error: 'not found' };
  await p.goto(ORIGIN + '/account/?t=E1.wrong'); await p.waitForTimeout(500);
  ok('a wrong link says so and gives the office number', /We could not find that account/.test(await p.textContent('#app')) && /\(636\) 375-4342/.test(await p.textContent('#app')));
  await p.goto(ORIGIN + '/account/'); await p.waitForTimeout(300);
  ok('no code at all says so without asking anything', /missing its code/.test(await p.textContent('#app')));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
