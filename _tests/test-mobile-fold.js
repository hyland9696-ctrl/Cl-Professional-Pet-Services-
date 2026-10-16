/* The first screen on a phone.

   At 390x844 the home page used to open on the logo, two rows of menu and
   the photo, with the headline, the rating and the quote button a screen
   and a half down. A visitor from an ad was not asked to do anything until
   they scrolled. These hold the fold to a standard, and check the bar that
   follows them down the page once the hero's own button is gone. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport:{ width:390, height:844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  stubNetwork(p, {});
  await p.goto(ORIGIN + '/'); await p.waitForTimeout(900);

  const box = (sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, visible: r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; });
  const h1 = await box('h1'), slogan = await box('.hero-slogan'), proof = await box('.hero-proof'), btn = await box('.hero-btns .btn-primary'), img = await box('.hero-img');
  ok('the headline is on the first screen', h1.visible && h1.bottom <= 844, JSON.stringify(h1));
  ok('the slogan is on the first screen', slogan.visible && slogan.bottom <= 844, JSON.stringify(slogan));
  ok('the Google rating and "licensed & insured" are on the first screen', proof.visible && proof.bottom <= 844 && /5\.0 on Google/.test(await p.textContent('.hero-proof')), JSON.stringify(proof));
  ok('the quote button is on the first screen, whole', btn.visible && btn.bottom <= 844, JSON.stringify(btn));
  ok('the button sits under the headline, above the long paragraph', btn.top > slogan.bottom && btn.top < (await box('.hero-lead')).top);
  ok('the photo is shorter on a phone (16:9, not 4:3)', img.h < 240 && img.h > 150, String(img.h));
  ok('the hero image is still the first thing fetched', await p.$eval('.hero-img img', e => e.getAttribute('fetchpriority') === 'high'));

  // the sticky bar: not at the top, there once the hero button has gone, gone on the quote tab
  const stickyShown = () => p.evaluate(() => getComputedStyle(document.getElementById('sticky-cta')).display !== 'none');
  ok('no sticky bar at the top of the page', !(await stickyShown()));
  await p.evaluate(() => window.scrollTo(0, 1200)); await p.waitForTimeout(400);
  ok('the sticky bar appears once the hero button has scrolled away', await stickyShown());
  const bar = await box('#sticky-cta');
  ok('it sits at the bottom of the screen, within reach of a thumb', bar.bottom >= 840 && bar.h >= 56, JSON.stringify(bar));
  const fab = await box('.fab');
  ok('the call button moves up out of its way', fab.bottom < bar.top, JSON.stringify([fab, bar]));
  await p.click('#sticky-cta button'); await p.waitForTimeout(500);
  ok('tapping it opens the quote page', await p.$eval('#page-quote', e => e.classList.contains('active')));
  ok('and the bar is gone on the quote page', !(await stickyShown()));
  await p.evaluate(() => window.scrollTo(0, 1200)); await p.waitForTimeout(300);
  ok('and stays gone there however far they scroll', !(await stickyShown()));

  // the live review count reaches the new line too
  const n = await p.$$eval('[data-review-rating]', els => els.length);
  ok('both rating badges on the home page are wired to the live count', n === 2, String(n));
  ok('no page errors', errs.length === 0, errs.join('; '));

  // wide screens: nothing changes
  const d = await b.newPage({ viewport:{ width:1280, height:800 } });
  stubNetwork(d, {});
  await d.goto(ORIGIN + '/'); await d.waitForTimeout(600);
  await d.evaluate(() => window.scrollTo(0, 1500)); await d.waitForTimeout(300);
  ok('no sticky bar on a desktop', !(await d.evaluate(() => getComputedStyle(document.getElementById('sticky-cta')).display !== 'none')));
  ok('the desktop hero keeps its two columns', await d.$eval('.hero', e => getComputedStyle(e).gridTemplateColumns.split(' ').length === 2));
  await d.close();
  await b.close();
  done();
})();
