/* The Google rating and review count shown on every page.

   They used to be typed into sixteen files: "5.0 · 28 reviews". Corey
   noticed the number on the site was not the number on Google, and no
   website can read that number for itself without a paid Google key.

   So the pages ask the lead-tracker backend, which holds one copy. That
   copy is set either by hand in the tracker (Reviews → Link → rating and
   count) or, once a Places API key is pasted into the Apps Script, by a
   daily job that reads it from Google. Either way: one number, one place.

   The static figure in the page stays as the fallback, so with scripts
   off, on a bad connection, or before the backend is redeployed, the page
   still reads the way it always did. */
(function(){
  /* This file is loaded in <head>, before the badge exists. Everything
     below runs once the page has been parsed - otherwise the cached path,
     which is synchronous, would look for the badge, find nothing, and
     quietly leave the typed figure in place. (It did, the first time.) */
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  function run(){
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzyQ1guq2GPodjaO0fM-qeO5tez3irnCqYPZpUKnc5Ine3x4DhVhZz5WNcDmZgJzdEsKg/exec';
  var KEY = 'clpps_reviews', TTL = 24 * 3600 * 1000;

  function apply(d){
    var rating = parseFloat(d.rating), count = parseInt(d.count, 10);
    if (!(rating >= 1 && rating <= 5) || !(count >= 1)) return;
    var rTxt = rating.toFixed(1);
    var els = document.querySelectorAll('[data-review-rating]');
    for (var i = 0; i < els.length; i++) els[i].textContent = rTxt;
    els = document.querySelectorAll('[data-review-count]');
    for (var j = 0; j < els.length; j++) els[j].textContent = count + ' review' + (count === 1 ? '' : 's');
    // structured data too, so what Google reads matches what people see
    var ld = document.querySelectorAll('script[type="application/ld+json"]');
    for (var k = 0; k < ld.length; k++){
      try {
        var o = JSON.parse(ld[k].textContent);
        if (o && o.aggregateRating){
          o.aggregateRating.ratingValue = rTxt;
          o.aggregateRating.reviewCount = String(count);
          ld[k].textContent = JSON.stringify(o);
        }
      } catch (e) {}
    }
  }

  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (cached && cached.at && Date.now() - cached.at < TTL && cached.count){
    apply(cached);
    return;
  }
  try {
    fetch(ENDPOINT + '?action=public&_=' + Date.now(), { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d || !d.ok || !d.count) return;
        apply(d);
        try { localStorage.setItem(KEY, JSON.stringify({ rating: d.rating, count: d.count, at: Date.now() })); } catch (e) {}
      })
      .catch(function(){});
  } catch (e) {}
  }
})();
