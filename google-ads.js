/* ============================================================
   GOOGLE ADS CONVERSION TRACKING  -  CL Professional Pet Services

   TO TURN ON: fill in the ID and the labels below, save, and that's it.
   Every page already loads this file.

   Where to find them:
     Google Ads -> Goals -> Conversions -> Summary -> click the action ->
     Tag setup -> "Install the tag yourself". The snippet shows
       send_to: 'AW-123456789/AbCdEfGhIjK'
     The part before the slash is the ID (the same for every action).
     The part after the slash is that action's label.

   Leave a label blank and that action is simply not sent. Until the ID
   is filled in, this file does nothing at all - no Google code loads
   and no data leaves the site.
   ============================================================ */

var GOOGLE_ADS_ID = "AW-16635325516";   // account 364-218-2125; labels confirmed by Corey's account inventory, 2026-11-20

var GOOGLE_ADS_LABELS = {
  quote:      "qTLGCLniwLwdEMzYq_w9",   // "Quote Lead (details submitted)": name and phone saved for a quote
  activated:  "aLcQCLziwLwdEMzYq_w9",   // "Booked Job (said yes)": a yes saved, on the site or the emailed quote. A request, not yet a confirmed subscription.
  declined:   "Gt8OCL_iwLwdEMzYq_w9",   // "Quote Declined": a no with its reason saved
  call:       "eMPqCMLiwLwdEMzYq_w9",   // "Phone Number Click": a tap on a phone number (not a connected call)
  text:       "",   // tapped the text-us button
  email:      "",   // tapped an email address
  commercial: ""    // sent the commercial / HOA form
};

/* ---- nothing below here needs editing ---- */
(function(){
  if (!/^AW-\d+$/.test(GOOGLE_ADS_ID)) return;
  // the Google tag, once per page
  var s = document.createElement('script'); s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GOOGLE_ADS_ID);
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GOOGLE_ADS_ID);

  // phone, text and email taps, anywhere on the site
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('a') : null; if (!el) return;
    var href = String(el.getAttribute('href') || '');
    if (href.indexOf('tel:') === 0) clppsAds('call');
    else if (href.indexOf('sms:') === 0) clppsAds('text');
    else if (href.indexOf('mailto:') === 0) clppsAds('email');
  }, true);
})();

/* An anonymous id for this visit, so Google can drop a repeat of the same
   conversion (a reload, a retry). Random, kept for the browser session,
   never built from a name, phone, email or address. */
window.clppsAdsVisit = function(){
  try { var v = sessionStorage.getItem('clpps_ads_tid'); if (!v){ v = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('clpps_ads_tid', v); } return v; }
  catch (e) { return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
};
/* One conversion, by name. Each name is sent once per page view at most, so
   a double tap or a re-render cannot count twice, and carries the visit id
   as its transaction id. Call it only after the thing it reports has been
   saved. Nothing about the customer is sent. Safe to call any time: it does
   nothing when the ID or that label is blank, or on a team phone. */
window.clppsAds = function(name, value, tid){
  try {
    if (!/^AW-\d+$/.test(GOOGLE_ADS_ID) || !window.gtag) return;
    if (typeof clppsIsTeam === 'function' && clppsIsTeam()) return;   // our own test quotes are not sales
    var label = GOOGLE_ADS_LABELS[name]; if (!label) return;
    window.clppsAdsSent = window.clppsAdsSent || {};
    if (window.clppsAdsSent[name]) return; window.clppsAdsSent[name] = 1;
    var p = { send_to: GOOGLE_ADS_ID + '/' + label };
    if (name !== 'call' && name !== 'text' && name !== 'email') p.transaction_id = String(tid || clppsAdsVisit()) + ':' + name;
    if (value > 0){ p.value = Math.round(value * 100) / 100; p.currency = 'USD'; }
    gtag('event', 'conversion', p);
  } catch (e) {}
};
