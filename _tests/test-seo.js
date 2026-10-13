/* On-page SEO, held to a standard.

   What a search engine sees of each public page: one H1 that says what and
   where, a title and description it will show whole, structured data that
   parses and agrees across pages, every page in the sitemap and linked,
   images described, and nothing blocking the first paint that need not. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

const SITE = 'https://www.clpropetservices.com';
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const inSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

// every index.html that is not deliberately hidden from search
const skip = new Set(['hq-8k3v51', 'brand', 'q', 'che', 'lsl', 'ofa', 'stc', 'stp', 'wld', 'wnz', 'contact', '_tests', 'node_modules', 'tools', 'images']);
const pages = ['index.html'].concat(fs.readdirSync(ROOT).filter(d => !skip.has(d) && !d.startsWith('.') &&
  fs.existsSync(path.join(ROOT, d, 'index.html'))).map(d => d + '/index.html'));
const urlOf = p => SITE + '/' + (p === 'index.html' ? '' : p.replace('index.html', ''));

const titles = new Map(), descs = new Map(), ids = new Set();
for (const p of pages){
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const name = p === 'index.html' ? 'home' : p.replace('/index.html', '');
  if (/noindex/.test(html)) continue;

  const h1 = html.match(/<h1[\s>]/g) || [];
  ok(name + ': exactly one H1', h1.length === 1, String(h1.length));
  const title = (html.match(/<title>([^<]*)/) || [, ''])[1];
  const desc = (html.match(/name="description" content="([^"]*)"/) || [, ''])[1];
  ok(name + ': title is 20-95 characters', title.length >= 20 && title.length <= 95, title.length + ' "' + title + '"');
  ok(name + ': description is 70-160 characters (Google shows about 155)', desc.length >= 70 && desc.length <= 160, desc.length + ' "' + desc.slice(0, 60) + '"');
  ok(name + ': title and description are unique', !titles.has(title) && !descs.has(desc), title);
  titles.set(title, name); descs.set(desc, name);
  ok(name + ': canonical is its own URL', html.includes('rel="canonical" href="' + urlOf(p) + '"'));
  ok(name + ': in the sitemap', inSitemap.includes(urlOf(p)), urlOf(p));
  const imgs = html.match(/<img[^>]*>/g) || [];
  ok(name + ': every image has alt text', imgs.every(i => /alt="[^"]+"/.test(i)), String(imgs.filter(i => !/alt="[^"]+"/.test(i)).length));
  ok(name + ': no empty "#" links', !/href="#"[\s>]/.test(html));

  // structured data: parses, and the business is the same entity everywhere
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let parsed = [];
  try { parsed = blocks.map(b => JSON.parse(b)); } catch (e) { parsed = null; }
  ok(name + ': structured data parses', !!parsed, parsed ? '' : 'JSON error');
  const businessPage = name !== 'accessibility';   // the accessibility statement is deliberately plain
  if (parsed && businessPage){
    const biz = parsed.find(b => b['@type'] === 'LocalBusiness');
    ok(name + ': has the business record', !!biz);
    if (biz){
      ids.add(biz['@id']);
      ok(name + ': business record is complete (address, geo, hours, phone, image, offers)',
         biz.address && biz.address.addressLocality === 'St. Peters' && biz.geo && biz.openingHoursSpecification && biz.telephone && biz.image && biz.hasOfferCatalog,
         Object.keys(biz).join(','));
      ok(name + ': offer prices come from the engine ($85 weekly)',
         JSON.stringify(biz).includes('"price": "85"') || JSON.stringify(biz).includes('"price":"85"'));
    }
    if (name !== 'home' && name !== 'service-areas' && name !== 'commercial'){
      ok(name + ': has breadcrumbs', parsed.some(b => b['@type'] === 'BreadcrumbList'));
      ok(name + ': area served is this city only', biz && Array.isArray(biz.areaServed) && biz.areaServed.length === 1, biz && JSON.stringify(biz.areaServed).slice(0, 80));
    }
  }
  // the scripts that need not block, and the two that must
  if (businessPage) ok(name + ': the pixel and the review script do not block the first paint',
     /<script defer src="\/meta-pixel\.js/.test(html) && /<script defer src="\/reviews\.js/.test(html));
  if (/src="\/pricing\.js/.test(html)) ok(name + ': pricing.js still blocks (the wizard reads it at parse time)', /<script src="\/pricing\.js/.test(html));
}
ok('every page agrees on which business this is (one @id)', ids.size === 1, [...ids].join(' | '));
for (const u of inSitemap){
  const rel = u.replace(SITE + '/', '');
  const f = rel ? rel + 'index.html' : 'index.html';
  ok('sitemap entry exists on disk: ' + (rel || '/'), fs.existsSync(path.join(ROOT, f)));
}

// the home page specifically
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const homeH1 = (home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1].replace(/<[^>]+>/g, '').replace(/&nbsp;|&amp;/g, m => m === '&amp;' ? '&' : ' ');
ok('home H1 says what we do and where', /Pet Waste Removal/.test(homeH1) && /St\.\s*Peters/.test(homeH1), homeH1);
ok('the slogan is still on the page, just not as the H1', /We deal with poop, so you don/.test(home) && !/<h1[^>]*>We deal with poop/.test(home));
ok('the old tab headings are H2s now', (home.match(/class="page-title"/g) || []).length === 6, String((home.match(/class="page-title"/g) || []).length));
ok('the hero image is fetched first, not lazily', /hero\.jpg"[^>]*fetchpriority="high"/.test(home) && !/hero\.jpg"[^>]*loading="lazy"/.test(home));
ok('the hero image is preloaded', /<link rel="preload" as="image" imagesrcset="\/images\/hero-800\.webp/.test(home));
ok('the FAQ structured data is still there', /"@type": "FAQPage"/.test(home));
ok('the footer links the hub and the commercial page', /href="\/service-areas\/"/.test(home) && /href="\/commercial\/"/.test(home));

// the hub page
const hub = fs.readFileSync(path.join(ROOT, 'service-areas', 'index.html'), 'utf8');
const cityLinks = [...hub.matchAll(/href="\/([a-z-]+)\/"><strong>/g)].map(m => m[1]);
ok('the hub links every city page', cityLinks.length === 15, cityLinks.join(' '));
ok('the hub lists the ZIP codes we serve, from the engine', /<code>63376<\/code>/.test(hub) && /<code>63141<\/code>/.test(hub));
ok('the hub keeps Illinois separate as priced by hand', /Illinois[^<]*priced by hand/.test(hub) && /<code>62234<\/code>/.test(hub));
ok('the hub is grouped by county', /<h2>St\. Charles County<\/h2>/.test(hub) && /<h2>St\. Louis County<\/h2>/.test(hub));

// every city page links to the hub
for (const d of fs.readdirSync(ROOT)){
  const f = path.join(ROOT, d, 'index.html');
  if (skip.has(d) || !fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  if (!/class="areas"/.test(html)) continue;
  ok(d + ': the Also-serving strip reaches the hub', /href="\/service-areas\/"/.test(html));
}

(async () => {
  const b = await launch();
  // deferring scripts must not have broken what they feed
  const p = await b.newPage({ viewport:{ width:390, height:844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  stubNetwork(p, {});
  await p.goto(ORIGIN + '/#quote'); await p.waitForTimeout(700);
  await p.fill('#q-zip', '63376'); await p.waitForTimeout(400);
  await p.fill('#qf2-name', 'Seo Test'); await p.fill('#qf2-phone', '6363754342');
  await p.fill('#qf2-email', 'seo@gmail.com'); await p.fill('#qf2-addr', '1 Test Lane');
  await p.click('#q-see-btn'); await p.waitForTimeout(700);
  ok('the quote wizard still prices after the script changes', /\$\d/.test(await p.textContent('#q-price')), await p.textContent('#q-price'));
  ok('the home page still shows exactly one H1 after using the tabs', (await p.$$('h1')).length === 1);
  await p.goto(ORIGIN + '/'); await p.waitForTimeout(500);
  const h1Visible = await p.$eval('h1', e => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden');
  ok('the H1 is visible text on the home tab, not hidden', h1Visible);
  ok('no page errors', errs.length === 0, errs.join('; '));
  await p.close();
  for (const pg of ['/service-areas/', '/commercial/']){
    const q = await b.newPage({ viewport:{ width:390, height:844 } });
    const e2 = []; q.on('pageerror', e => e2.push(e.message));
    stubNetwork(q, {});
    const resp = await q.goto(ORIGIN + pg); await q.waitForTimeout(500);
    ok(pg + ' serves', resp.status() === 200);
    ok(pg + ' renders its H1', (await q.$$('h1')).length === 1 && (await q.textContent('h1')).trim().length > 10);
    ok(pg + ' has no page errors', e2.length === 0, e2.join('; '));
    await q.close();
  }
  await b.close();
  done();
})();
