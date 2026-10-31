/* Territory: where the customers are, where the quotes convert, where
   nobody buys, and the streets with neighbours already. Made-up leads
   spread across the metro. The map library cannot load here (no network),
   so the drawn map is what is checked; the street map is an extra. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport:{ width:430, height:1600 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const now = new Date().toISOString();
  // every made-up person gets their own phone number, or the tracker folds
  // them into one card as the same person (which is right, and not the point here)
  let seq = 0;
  const L = (id, name, zip, addr, status, extra) => Object.assign({ id, type:'ENQUIRY', name, phone:'636375' + String(4100 + (++seq)), zip, address: addr, dogs:'1', service:'weekly', price:'$85/mo', status, crmnotes:'[QA:w] ', created: now }, extra || {});
  const rows = [
    // St. Peters: five customers, two of them neighbours on Mill Race
    L('a1', 'Amy A', '63376', '6 Mill Race, St. Peters, Missouri 63376', 'closed', { crmnotes:'[CD:2026-05-01] [QA:a] ' }),
    L('a2', 'Ben B', '63376', '8 Mill Race, St. Peters, Missouri 63376', 'closed', { crmnotes:'[CD:2026-05-01] [QA:a] ' }),
    L('a3', 'Cat C', '63376', '100 Scenic Drive, St. Peters, Missouri 63376', 'closed', { crmnotes:'[CD:2026-05-01] [QA:a] ', price:'$91/mo' }),
    L('a4', 'Dan D', '63376', '40 Julie Ln, St. Peters, Missouri 63376', 'closed', { crmnotes:'[CD:2026-05-01] [QA:a] ' }),
    L('a5', 'Eve E', '63376', '1294 Poseidon Ct, St. Peters, Missouri 63376', 'closed', { crmnotes:'[CD:2026-05-01] [QA:a] ' }),
    L('a6', 'Fay F', '63376', '2 Elm St, St. Peters, Missouri 63376', 'lost', { crmnotes:'[QA:d] price' }),
    // O'Fallon next door: two customers
    L('b1', 'Gus G', '63366', '1513 Byron Pl, O\'Fallon, Missouri 63366', 'closed', { crmnotes:'[CD:2026-06-01] [QA:a] ' }),
    L('b2', 'Hal H', '63366', '205 Tyndale Dr, O\'Fallon, Missouri 63366', 'closed', { crmnotes:'[CD:2026-06-01] [QA:a] ' }),
    // Chesterfield: three quotes, two won
    L('c1', 'Ida I', '63017', '290 Villar Dr, Chesterfield, MO 63017, USA', 'closed', { crmnotes:'[CD:2026-07-01] [QA:a] ' }),
    L('c2', 'Jo J', '63017', '12 Oak Ln, Chesterfield, MO 63017, USA', 'closed', { crmnotes:'[CD:2026-07-01] [QA:a] ' }),
    L('c3', 'Kim K', '63017', '14 Oak Ln, Chesterfield, MO 63017, USA', 'new'),
    // Alton: four quotes, nobody signed up: a dead zone
    L('d1', 'Lee L', '62002', '1 River Rd, Alton, IL 62002, USA', 'new'),
    L('d2', 'Max M', '62002', '2 River Rd, Alton, IL 62002, USA', 'lost', { crmnotes:'[QA:d] too far' }),
    L('d3', 'Ned N', '62002', '3 Hill St, Alton, IL 62002, USA', 'new'),
    L('d4', 'Oz O', '62002', '4 Hill St, Alton, IL 62002, USA', 'called'),
    // Florissant: people only looked at a price
    { id:'q1', type:'QVIEW', name:'weekly / 1 dog(s)', zip:'63031', price:'$77/mo', yard:'s1', created: now },
    { id:'q2', type:'QVIEW', name:'weekly / 1 dog(s)', zip:'63031', price:'$77/mo', yard:'s2', created: now },
    { id:'q3', type:'QVIEW', name:'weekly / 2 dog(s)', zip:'63031', price:'$82/mo', yard:'s3', created: now },
  ];
  stubNetwork(p, { leads: rows });
  await p.goto(ORIGIN + '/hq-8k3v51/'); await p.waitForTimeout(1200);
  await p.click('button:has-text("Territory")'); await p.waitForTimeout(900);

  ok('the Territory card is open and in view', await p.$eval('#numbers', e => e.style.display !== 'none') && await p.$eval('#territory', e => e.getBoundingClientRect().top < 120));
  const dots = await p.$$eval('#terr-map .terr-dot', els => els.map(e => ({ zip: e.getAttribute('data-zip'), r: parseFloat(e.querySelector('circle').getAttribute('r')), fill: e.querySelector('circle').getAttribute('fill'), n: (e.querySelector('text') || {}).textContent })));
  ok('the drawn map has a bubble for every ZIP with activity', dots.length === 5, dots.map(d => d.zip).join(','));
  const sp = dots.find(d => d.zip === '63376'), al = dots.find(d => d.zip === '62002'), fl = dots.find(d => d.zip === '63031'), ch = dots.find(d => d.zip === '63017');
  ok('St. Peters is the biggest bubble and shows its five customers', sp && sp.n === '5' && dots.every(d => d.r <= sp.r), JSON.stringify(sp));
  ok('St. Peters is green: five of six quotes won', sp.fill === '#188663');
  ok('Alton is red: four quotes, none won', al && al.fill === '#c0392b' && !al.n, JSON.stringify(al));
  ok('Florissant, where people only looked, is red too', fl && fl.fill === '#c0392b');
  ok('Chesterfield at two of three is green', ch && ch.fill === '#188663' && ch.n === '2');
  ok('the rivers are drawn so it reads as the metro', (await p.$$('#terr-map polyline')).length === 2);
  ok('the biggest areas are labelled by town', /St\. Peters/.test(await p.textContent('#terr-map svg')));

  const body = (await p.textContent('#terr-body')).replace(/\s+/g, ' ');
  ok('the summary counts customers and ZIPs', /9 customers across 3 ZIP codes/.test(body), body.slice(0, 120));
  const strong = body.split('Strongholds')[1].split('Where the quotes convert')[0];
  ok('St. Peters leads the strongholds, with O\'Fallon counted as nearby', /^.*St\. Peters 63376[^\n]*5 \+2 nearby/.test(strong.replace(/\s+/g, ' ')), strong.slice(0, 200));
  ok('with its monthly revenue', /\$431\/mo/.test(strong), strong.slice(0, 200));
  const conv = body.split('Where the quotes convert')[1].split('Dead zones')[0];
  ok('the conversion list puts St. Peters (83%) first and Alton (0%) last', conv.indexOf('St. Peters') < conv.indexOf('Chesterfield') && conv.indexOf('Chesterfield') < conv.indexOf('Alton') && /83% of 6/.test(conv), conv.slice(0, 300));
  const dead = body.split('Dead zones')[1].split('Neighbours')[0];
  ok('Alton and Florissant are the dead zones', /Alton 62002/.test(dead) && /4 quotes/.test(dead) && /Florissant 63031/.test(dead) && /3 price looks/.test(dead), dead.slice(0, 300));
  ok('St. Peters is not a dead zone', !/St\. Peters/.test(dead));
  const nb = body.split('Neighbours')[1];
  ok('Mill Race shows as a street with two customers', /Mill Race.*St\. Peters 63376.*2 customers.*Amy A, Ben B/.test(nb), nb.slice(0, 200));
  ok('Oak Lane does not: one customer and one open quote', !/Oak Ln/.test(nb));
  ok('the legend explains the colours', /half or more of quotes won/.test(await p.textContent('#terr-legend')));
  ok('a bubble has a tooltip with the numbers', /5 customers · \$431\/mo · 83% of 6 quotes won/.test(await p.$eval('#terr-map .terr-dot[data-zip="63376"] title', e => e.textContent)));
  ok('no page errors', errs.length === 0, errs.join('; '));
  await ctx.close(); await b.close();
  done();
})();
