/* ============================================================
   CLPPS LEAD SOURCE — single source of truth for "where did
   this visitor come from?". Loaded by the public site
   (index.html) and by every city page via city-view.js.

   Yard signs: each city's signs carry their own QR code
   pointing at a short path (/stp, /ofa, ...). That path tags
   the visit and forwards to the city's own page, so a scan in
   St. Peters reads "Yard sign QR (St. Peters)".

   Add a city here AND create its short path folder.
   ============================================================ */

var CLPPS_SIGN_CITIES = {
  stp: { city: 'St. Peters',      page: '/st-peters/' },
  stc: { city: 'St. Charles',     page: '/st-charles/' },
  ofa: { city: "O'Fallon",        page: '/ofallon/' },
  wnz: { city: 'Wentzville',      page: '/wentzville/' },
  cot: { city: 'Cottleville',     page: '/cottleville/' },
  flo: { city: 'Florissant',      page: '/florissant/' },
  che: { city: 'Chesterfield',    page: '/chesterfield/' },
  stl: { city: 'St. Louis',       page: '/st-louis/' },
  pac: { city: 'Pacific',         page: '/pacific/' },
  bel: { city: 'Belleville, IL',  page: '/belleville-il/' }
};
var CLPPS_SIGN_LABEL = 'Yard sign QR';

/* Storage that never throws. A browser with site data blocked (private
   windows, some locked-down phones) used to take the whole tracking
   block down with it, so those visitors landed with no source at all. */
function clppsStore(key, val){
  try {
    if (arguments.length > 1){ sessionStorage.setItem(key, val); return val; }
    return sessionStorage.getItem(key);
  } catch (e) { return null; }
}

function clppsParam(k, search){
  var s = search || location.search;
  var m = s.match(new RegExp('[?&]' + k + '=([^&]*)'));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

/* The label a yard sign scan should carry, or '' if this is not one. */
function clppsSignSource(code){
  var c = String(code || '').toLowerCase().trim();
  var hit = CLPPS_SIGN_CITIES[c];
  return hit ? CLPPS_SIGN_LABEL + ' (' + hit.city + ')' : '';
}

/* Where did this visit come from? Cached for the whole browser session,
   so the answer does not change when they click through to another page. */
function clppsLeadSource(){
  var cached = clppsStore('lead_src');
  if (cached) return cached;
  var src = '';
  var utm = clppsParam('utm_source').toLowerCase();

  if (clppsParam('gclid')) src = 'Google Ads';
  else if (clppsParam('fbclid')) src = 'Meta Ads';
  else if (utm){
    if (utm.indexOf('yardsign') >= 0 || utm.indexOf('yard-sign') >= 0 ||
        utm.indexOf('yard_sign') >= 0 || utm === 'qr'){
      // utm_campaign carries the city code; without it we still know it
      // was a sign, just not which town.
      src = clppsSignSource(clppsParam('utm_campaign')) || CLPPS_SIGN_LABEL;
    }
    else if (utm.indexOf('face') >= 0 || utm === 'fb' || utm.indexOf('meta') >= 0 || utm.indexOf('insta') >= 0) src = 'Meta Ads';
    else if (utm.indexOf('goog') >= 0) src = 'Google Ads';
    else src = clppsParam('utm_source');
  } else {
    var r = '';
    try { r = document.referrer ? new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, '') : ''; } catch (e) {}
    if (r.indexOf('google') >= 0) src = 'Google (organic)';
    else if (r.indexOf('facebook') >= 0 || r.indexOf('instagram') >= 0 || r === 'fb.me') src = 'Meta (organic)';
    else if (r.indexOf('nextdoor') >= 0) src = 'Nextdoor';
    else if (r.indexOf('bing') >= 0 || r.indexOf('duckduckgo') >= 0) src = 'Other search';
    else if (r && r.indexOf('clpropetservices') < 0) src = r;
    else src = 'Direct';
  }
  clppsStore('lead_src', src);
  return src;
}

/* A short id for this visit, so several page views can be tied together. */
function clppsVisitId(){
  var s = clppsStore('v_sid');
  if (s) return s;
  s = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
  clppsStore('v_sid', s);
  return s;
}
