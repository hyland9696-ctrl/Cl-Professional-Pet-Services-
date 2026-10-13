/* The city landing pages.

   A search for "pooper scooper St. Peters MO" returned three competitors
   and not us, although the page exists. Part of the reason was on the page:
   no city page linked to any other, so each had one inbound link, from the
   home footer. These check that every city page is reachable, consistent,
   and says something true and specific. */
const { ROOT, ORIGIN, launch, reporter, stubNetwork, loadSiteScript } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();
const { execFileSync } = require('child_process');

// the city list is owned by the generator; read it from there
const gen = fs.readFileSync(path.join(ROOT, 'tools', 'city-pages.py'), 'utf8');
// a name may be single- or double-quoted: "O'Fallon" has an apostrophe in it,
// and the first version of this regex stopped at it and silently skipped that city
const CITIES = [...gen.matchAll(/\('([a-z-]+)',\s*(?:"([^"]+)"|'([^']+)'),\s*'([A-Z]{2})',\s*'(\d{5})'/g)]
  .map(m => ({ slug: m[1], name: m[2] || m[3], state: m[4], zip: m[5] }));
ok('the generator lists all fifteen cities (O\'Fallon included)', CITIES.length === 15 && CITIES.some(c => c.slug === 'ofallon'), CITIES.map(c => c.slug).join(' '));

ok('the generator says every page is in step with the list', (() => {
  try { execFileSync('python3', [path.join(ROOT, 'tools', 'city-pages.py'), '--check'], { stdio: 'pipe' }); return true; }
  catch (e) { console.log('      ' + String(e.stdout || e.message).trim().replace(/\n/g, '\n      ')); return false; }
})());

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sandbox = { window: {} }; sandbox.global = sandbox;
new Function('window', fs.readFileSync(path.join(ROOT, 'pricing.js'), 'utf8') + ';this.q = clppsQuote;').call(sandbox, sandbox.window);
const quote = sandbox.q;

(async () => {
  const b = await launch();
  for (const c of CITIES){
    const file = path.join(ROOT, c.slug, 'index.html');
    const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    ok(c.slug + ': page exists', !!html);
    if (!html) continue;
    ok(c.slug + ': canonical is its own URL', html.includes('rel="canonical" href="https://www.clpropetservices.com/' + c.slug + '/"'));
    ok(c.slug + ': in the sitemap', sitemap.includes('https://www.clpropetservices.com/' + c.slug + '/</loc>'));
    ok(c.slug + ': linked from the home footer', home.includes('href="/' + c.slug + '/"'));
    ok(c.slug + ': not noindex', !/noindex/.test(html));
    ok(c.slug + ': the business address is St. Peters, the city is the area served',
       html.includes('"addressLocality":"St. Peters","addressRegion":"MO"') &&
       html.includes('"areaServed":{"@type":"City","name":"' + c.name + ', ' + c.state + '"}'));
    const others = CITIES.filter(x => x.slug !== c.slug).map(x => 'href="/' + x.slug + '/"');
    ok(c.slug + ': links to every other city', others.every(h => html.includes(h)),
       others.filter(h => !html.includes(h)).join(' '));
    ok(c.slug + ': title names the city', new RegExp('<title>Pooper Scooper ' + c.name.replace('.', '\\.')).test(html));

    // in the browser: the price line is live and matches the engine
    const p = await b.newPage({ viewport:{ width:390, height:844 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    stubNetwork(p, {});
    await p.goto(ORIGIN + '/' + c.slug + '/'); await p.waitForTimeout(500);
    const line = ((await p.textContent('#city-price')) || '').replace(/\s+/g, ' ');
    const one = quote({ zip: c.zip, dogs: 1, freq: 'weekly' }), two = quote({ zip: c.zip, dogs: 2, freq: 'weekly' });
    if (one.manual){
      ok(c.slug + ': says it is priced by hand (no table price leaks)', /by hand/.test(line) && !/\$\d/.test(line), line);
    } else {
      ok(c.slug + ': the price line matches the engine ($' + one.service + ' / $' + two.service + ')',
         line.includes('$' + one.service + ' a month') && line.includes('$' + two.service), line);
    }
    ok(c.slug + ': the strip of other cities is on the page', await p.isVisible('.areas'));
    ok(c.slug + ': no page errors', errs.length === 0, errs.join('; '));
    await p.close();
  }

  // the five new ones say something that could only be about them
  for (const [slug, must] of [['lake-st-louis', /Wyndgate|Hawk Ridge/], ['wildwood', /Babler|horse/],
                              ['dardenne-prairie', /Bryan Road|Highway N/], ['creve-coeur', /63141|Olive/], ['ballwin', /Vlasis|Manchester/]]){
    const html = fs.readFileSync(path.join(ROOT, slug, 'index.html'), 'utf8');
    ok(slug + ': has copy that is actually about ' + slug, must.test(html));
    ok(slug + ': does not still claim to be headquartered there', !/headquartered right here in/.test(html));
  }
  // big-lot towns are honest about the quarter-acre rule up front
  for (const slug of ['lake-st-louis', 'wildwood']){
    const html = fs.readFileSync(path.join(ROOT, slug, 'index.html'), 'utf8');
    ok(slug + ': says up front that bigger lots get a hand-built quote', /quarter acre/.test(html));
  }
  await b.close();
  done();
})();
