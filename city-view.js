/* City landing page visit beacon. Needs lead-source.js loaded first.
   The page name comes from the URL, so this file is identical on every
   city page - there is nothing to keep in sync by hand. */
(function(){
  try {
    var slug = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || 'home';
    var pg = 'city-' + slug;
    if (clppsStore('v_' + pg)) return;          // once per session per page
    clppsStore('v_' + pg, '1');

    var ref = '';
    if (!clppsStore('v_ref_sent')){
      clppsStore('v_ref_sent', '1');
      try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : 'direct'; }
      catch (e) { ref = 'other'; }
      if (ref.indexOf('clpropetservices') >= 0) ref = '';
    }

    var lead = {
      id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      created: new Date().toISOString(),
      type: 'VIEW',
      name: pg,
      zip: ref,
      yard: clppsVisitId(),
      service: clppsLeadSource() || ''
    };
    fetch('https://script.google.com/macros/s/AKfycbzyQ1guq2GPodjaO0fM-qeO5tez3irnCqYPZpUKnc5Ine3x4DhVhZz5WNcDmZgJzdEsKg/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'lead', lead: lead })
    }).catch(function(){});
  } catch (e) {}
})();
