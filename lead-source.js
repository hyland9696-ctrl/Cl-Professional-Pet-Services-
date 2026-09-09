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
  /* code  = the short path printed on the sign. Kept to three letters so the
             QR stays at 29 modules; a longer path makes the printed squares
             smaller and harder to scan from a few feet away.
     campaign = what shows up in the tracker and in any utm link.
     NOTE: a code must never match a city landing page folder (ofallon,
     wentzville, chesterfield ...) or the redirect would point at itself. */
  stp: { campaign:'stpeters',     city:'St. Peters',     covers:'St. Peters, Cottleville, Weldon Spring', page:'/st-peters/'    },
  ofa: { campaign:'ofallon',      city:"O'Fallon",       covers:"O'Fallon, Dardenne Prairie",             page:'/ofallon/'      },
  stc: { campaign:'stcharles',    city:'St. Charles',    covers:'St. Charles',                            page:'/st-charles/'   },
  wnz: { campaign:'wentzville',   city:'Wentzville',     covers:'Wentzville',                             page:'/wentzville/'   },
  lsl: { campaign:'lakestlouis',  city:'Lake St. Louis', covers:'Lake St. Louis',                          page:'/'              },
  wld: { campaign:'wildwood',     city:'Wildwood',       covers:'Wildwood, Eureka',                       page:'/'              },
  che: { campaign:'chesterfield', city:'Chesterfield',   covers:'Chesterfield, Des Peres',                page:'/chesterfield/' }
};
/* Campaign names resolve too, so a utm_campaign=stpeters link tags correctly
   even though the printed path is /stp. */
var CLPPS_SIGN_ALIASES = (function(){
  var m = {};
  for (var k in CLPPS_SIGN_CITIES) m[CLPPS_SIGN_CITIES[k].campaign] = k;
  m.cot = 'stp';   // Cottleville folded into St. Peters
  return m;
})();
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
  if (!CLPPS_SIGN_CITIES[c] && CLPPS_SIGN_ALIASES[c]) c = CLPPS_SIGN_ALIASES[c];
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
