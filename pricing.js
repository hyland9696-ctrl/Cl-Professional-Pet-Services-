/* ============================================================
   CLPPS PRICING — single source of truth.
   Loaded by the public quote wizard (index.html) and the staff
   phone-quote page (hq-8k3v51/quote/). Change numbers HERE only.

   Recurring:   weekly = base[dogs] × ZIP multiplier
                every other week = base[dogs] × ZIP multiplier × 0.82
                twice a week = the weekly price × 2
                monthly (one visit) = monthlyBase[dogs] × ZIP multiplier
                all rounded to the nearest whole dollar
   One-time:    flat $75, ZIP multiplier NOT applied
   Unlisted ZIP (inside the service area): priced as Value
   ============================================================ */

var CLPPS_PRICING = {
  base: { 1: 85, 2: 91, 3: 97, 4: 103 },     // weekly, $/month, Standard tier
  monthlyBase: { 1: 65, 2: 70, 3: 75, 4: 80 }, // one visit a month, Standard tier ($65 + $5/dog)
  tiers: { Value: 0.90, Core: 0.95, Standard: 1.00, Premium: 1.10 },
  eowFactor: 0.82,
  onetime: 75,          // flat, any dog count, no multiplier
  initialClean: 40,     // one-time, first invoice, recurring customers only
  deodorize: 15,        // per treatment
  maxDogs: 4,           // 5+ is a custom quote
  zips: {
    '63376':'Standard','63301':'Standard','63303':'Standard','63304':'Premium',
    '63366':'Standard','63368':'Standard','63385':'Premium','63367':'Premium',
    '63017':'Premium','63011':'Standard','63021':'Standard','63031':'Value',
    '63033':'Value','63034':'Standard','62025':'Premium','62026':'Standard',
    '62034':'Standard','62062':'Standard','62294':'Premium','62234':'Core',
    '62002':'Value','62010':'Core','62040':'Value','62035':'Premium',
    '62095':'Core','62249':'Premium','63090':'Standard','63084':'Standard',
    '63069':'Standard','63010':'Core','63028':'Standard','63383':'Standard',
    '63379':'Premium','62220':'Core','62269':'Standard','62236':'Premium'
  },
  // Metro ZIP prefixes we run routes in. Anything outside is "no route yet".
  areaPrefixes: ['630','631','633','620','622']
};

function clppsZipTier(zip){
  var z = String(zip || '').trim();
  return CLPPS_PRICING.zips[z] || 'Value';
}
function clppsInArea(zip){
  var z = String(zip || '').trim();
  return /^\d{5}$/.test(z) && CLPPS_PRICING.areaPrefixes.indexOf(z.substring(0, 3)) >= 0;
}
function clppsRound(v){ return Math.round(v + 1e-9); }

/* opts: { zip, dogs (1-4, or 5 = custom), freq: 'twiceweekly'|'weekly'|'biweekly'|'monthly'|'onetime',
           deo: 'none'|'every'|'eo', waiveInitial: bool }
   Returns the full breakdown, or { manual:true, reason } for custom quotes. */
function clppsQuote(opts){
  var P = CLPPS_PRICING;
  var dogs = parseInt(opts.dogs, 10) || 1;
  var freq = opts.freq || 'weekly';
  var deo  = opts.deo || 'none';
  var tier = clppsZipTier(opts.zip);
  var mult = P.tiers[tier];

  if (freq === 'onetime'){
    var deoOnce = deo !== 'none' ? P.deodorize : 0;
    var ot = P.onetime + deoOnce;
    return { manual:false, freq:freq, tier:tier, mult:1, dogs:dogs,
             base:P.onetime, service:P.onetime, deoAmt:deoOnce, deoMo:deoOnce, treatments: deoOnce ? 1 : 0,
             total:ot, per:'', first:ot, initial:0,
             agree:'$' + ot + ' one-time cleanup' + (deoOnce ? ' (includes $15 deodorize & sanitize)' : '') };
  }
  if (dogs > P.maxDogs){
    return { manual:true, reason:'5+ dogs', tier:tier, mult:mult, dogs:dogs, freq:freq };
  }
  var base, raw, service, visits;
  if (freq === 'monthly'){
    base = P.monthlyBase[dogs];
    raw = base * mult;
    service = clppsRound(raw);
    visits = 1;
  } else if (freq === 'twiceweekly'){
    base = P.base[dogs];
    raw = base * mult;
    service = clppsRound(raw) * 2;          // the customer's weekly price, doubled
    visits = 8;
  } else {
    base = P.base[dogs];
    raw = base * mult * (freq === 'biweekly' ? P.eowFactor : 1);
    service = clppsRound(raw);
    visits = freq === 'biweekly' ? 2 : 4;
  }
  var treatments = deo === 'every' ? visits : (deo === 'eo' ? Math.round(visits / 2) : 0);
  var deoMo = treatments * P.deodorize;
  var total = service + deoMo;
  var initial = opts.waiveInitial ? 0 : P.initialClean;
  var first = total + initial;
  var agree = '$' + total + '/mo' +
    (deoMo ? ' (includes ' + treatments + ' deodorize treatments at $15 each)' : '') +
    (initial ? ', with a first invoice of $' + first + ' including the one-time $' + initial + ' initial clean'
             : ', initial clean fee waived');
  return { manual:false, freq:freq, tier:tier, mult:mult, dogs:dogs,
           base:base, service:service, visits:visits, treatments:treatments, deoMo:deoMo,
           total:total, per:'/mo', initial:initial, first:first, agree:agree };
}
