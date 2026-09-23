/* The prices themselves.

   This is the one that matters most: every other mistake on this site
   annoys somebody, a wrong number here charges a customer something
   nobody agreed to, or quietly undercuts the business on every job in a
   postcode. So the whole table is written out in full below rather than
   recomputed from the same formula the code uses - a test that repeats
   the code's arithmetic only proves the arithmetic is consistent with
   itself, not that it is right.

   These numbers were confirmed against the printed price sheet. If a
   change to pricing.js makes one of them fail, that is the test doing
   its job: either the change is wrong, or the sheet and this table need
   updating deliberately, in the same commit, with Corey's say-so. */
const { loadSiteScript, reporter } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

// pricing.js declares globals rather than exporting, so run it and grab them
const sandbox = { window: {} };
sandbox.global = sandbox;
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'pricing.js'), 'utf8') +
  ';this.out = { P: CLPPS_PRICING, quote: clppsQuote, tier: clppsZipTier,' +
  ' onetime: clppsOnetime, inArea: clppsInArea };').call(sandbox, sandbox.window);
const { P, quote, tier, onetime, inArea } = sandbox.out;

/* A Missouri ZIP for each tier. Missouri deliberately: Illinois no longer
   gets a table price at all, so an Illinois ZIP as a stand-in would make
   every cell in its tier read blank. */
const REP = { Value: '63031', Core: '63010', Standard: '63376', Premium: '63017' };
const isIL = z => (P.manualPrefixes || []).indexOf(String(z).slice(0, 3)) >= 0;

Object.keys(REP).forEach(t => {
  ok('the ' + t + ' stand-in ZIP is Missouri and on that tier',
     P.zips[REP[t]] === t && !isIL(REP[t]), REP[t] + ' = ' + P.zips[REP[t]]);
});

/* ---- every recurring price, $/month, 1 to 4 dogs ---- */
const TABLE = {
  Value:    { weekly: [77, 82, 87, 93],    biweekly: [87, 92, 97, 103],    twiceweekly: [139, 148, 157, 167] },
  Core:     { weekly: [81, 86, 92, 98],    biweekly: [91, 96, 102, 108],   twiceweekly: [146, 155, 166, 176] },
  Standard: { weekly: [85, 91, 97, 103],   biweekly: [95, 101, 107, 113],  twiceweekly: [153, 164, 175, 185] },
  Premium:  { weekly: [94, 100, 107, 113], biweekly: [104, 110, 117, 123], twiceweekly: [169, 180, 193, 203] },
};
const PLAN = { weekly: 'weekly', biweekly: 'every other week', twiceweekly: 'twice a week' };
let cells = 0, bad = 0;
Object.keys(TABLE).forEach(t => {
  Object.keys(TABLE[t]).forEach(freq => {
    TABLE[t][freq].forEach((want, i) => {
      cells++;
      const got = quote({ zip: REP[t], dogs: i + 1, freq: freq }).service;
      if (got !== want) { bad++; console.log('  ' + t + ' ' + PLAN[freq] + ' ' + (i+1) +
        ' dog: expected $' + want + ', engine says $' + got); }
    });
  });
});
ok('all ' + cells + ' recurring prices are what the price sheet says', bad === 0 && cells === 48);

/* ---- the rules those numbers are built from ---- */
ok('the Standard weekly base is untouched',
   [1,2,3,4].map(d => P.base[d]).join() === '85,91,97,103', JSON.stringify(P.base));
ok('the tier multipliers are untouched',
   P.tiers.Value === 0.90 && P.tiers.Core === 0.95 &&
   P.tiers.Standard === 1.00 && P.tiers.Premium === 1.10, JSON.stringify(P.tiers));
ok('every other week is the weekly price plus $10, every tier, every dog count',
   Object.keys(REP).every(t => [1,2,3,4].every(d =>
     quote({zip:REP[t],dogs:d,freq:'biweekly'}).service ===
     quote({zip:REP[t],dogs:d,freq:'weekly'}).service + P.eowPremium)));
ok('no recurring plan is ever quoted below the floor of $' + P.minRecurring,
   Object.keys(REP).every(t => ['weekly','biweekly','twiceweekly'].every(f =>
     [1,2,3,4].every(d => quote({zip:REP[t],dogs:d,freq:f}).service >= P.minRecurring))));

/* ---- one-time cleanups: flat, by time, no tier ---- */
const MINS = [30, 45, 60, 75, 90, 105, 120, 150, 180];
const ONE  = [75, 95, 115, 135, 155, 175, 195, 235, 275];
ok('the one-time ladder is unchanged',
   MINS.map(m => onetime(m).price).join() === ONE.join(),
   MINS.map(m => onetime(m).price).join());
ok('a one-time job ignores the ZIP tier entirely',
   Object.keys(REP).every(t => quote({ zip: REP[t], freq: 'onetime' }).service === P.onetime));
ok('part blocks round up - 35 minutes bills as 45', onetime(35).price === onetime(45).price);

/* ---- add-ons ---- */
ok('deodorize is still $' + P.deodorize + ' a treatment', P.deodorize === 15);
ok('the initial clean is still $' + P.initialClean + ' and still waived',
   P.initialClean === 40 && P.waiveInitialClean === true);

/* ---- what gets no automatic price, and why ---- */
ok('5 or more dogs is priced by hand',
   quote({ zip: '63376', dogs: 5, freq: 'weekly' }).manual === true);
ok('the retired monthly plan never guesses a number',
   quote({ zip: '63376', dogs: 1, freq: 'monthly' }).manual === true);
['62234', '62025', '62002', '62220'].forEach(z => {
  const r = quote({ zip: z, dogs: 1, freq: 'weekly' });
  ok(z + ' (Illinois) gets no table price', r.manual === true && r.reason === 'illinois');
  ok(z + ' is still inside the service area', inArea(z) === true);
});
ok('no Illinois plan leaks a number',
   ['weekly','biweekly','twiceweekly','onetime'].every(f =>
     quote({ zip: '62234', dogs: 2, freq: f }).service === undefined));

/* ---- ZIP decisions that were made deliberately and must not drift ----
   Each of these breaks the pattern around it for a recorded reason. The
   comment in pricing.js says why; this makes sure nobody "tidies" one
   away without meaning to. */
[['63005', 'Premium', 'a Franklin County ZIP, but it is Chesterfield/Wildwood at $198k'],
 ['63304', 'Premium', 'furthest-out territory - Premium pays for the drive, not the postcode'],
 ['63385', 'Premium', 'same reason'],
 ['63379', 'Premium', 'same reason'],
 ['63141', 'Premium', 'Creve Coeur, $133k'],
 ['63146', 'Standard', 'Creve Coeur west, $84k - NOT the same place as 63141'],
 ['63127', 'Premium', 'Sunset Hills - just under the income line, priced up on purpose'],
 ['63069', 'Value',   'Franklin County, moved down from Standard on request'],
 ['63084', 'Value',   'Franklin County'],
 ['63090', 'Value',   'Franklin County'],
].forEach(([z, t, why]) => ok(z + ' is still ' + t + ' (' + why + ')', tier(z) === t, tier(z)));

ok('an unlisted Missouri ZIP falls to Value, the floor',
   tier('63999') === 'Value', tier('63999'));
ok('a ZIP outside our route prefixes is out of area', inArea('33101') === false);

done();
