#!/usr/bin/env python3
"""The city landing pages, from one list.

Why this exists
---------------
A search for "pooper scooper St. Peters MO" returned three competitors and
not us, although our St. Peters page exists, is in the sitemap and is
canonical. Part of the reason was on the page: no city page linked to any
other, so each one had exactly one inbound link, from the home footer.
Five more pages built by hand would have been five more orphans, and the
sitemap and footer would have drifted the first time somebody forgot one.

So the city list lives here, once, and this script:

  * builds a page for any city in CITIES that has none yet, from the
    St. Peters page as a template plus the copy below;
  * rewrites the "Also serving" strip on EVERY city page, so each links to
    all the others (a marked block - hand-written copy is never touched);
  * adds a "weekly from $X/mo" line to every city page, computed in the
    browser from pricing.js for that city's ZIP, so a page can never quote
    a price the website would not;
  * corrects the structured data: the business address is St. Peters on
    every page, the city is the area SERVED;
  * keeps sitemap.xml and the home-page footer list in step.

Adding a city later is one entry in CITIES plus its copy in COPY, then:

    python3 tools/city-pages.py          # write everything
    python3 tools/city-pages.py --check  # exit 1 if anything is out of step
    python3 tools/stamp-assets.py        # the new pages load pricing.js

Copy for an existing page is never regenerated. Only the marked blocks are.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://www.clpropetservices.com'

# slug, display name, state, the ZIP the price line is computed from,
# the county line used in the hero, and whether lots there commonly run
# over a quarter acre (which changes what the price line promises).
CITIES = [
    ('st-peters',        'St. Peters',       'MO', '63376', 'St. Charles County', False),
    ('st-charles',       'St. Charles',      'MO', '63303', 'St. Charles County', False),
    ('ofallon',          "O'Fallon",         'MO', '63366', 'St. Charles County', False),
    ('wentzville',       'Wentzville',       'MO', '63385', 'St. Charles County', False),
    ('cottleville',      'Cottleville',      'MO', '63376', 'St. Charles County', False),
    ('dardenne-prairie', 'Dardenne Prairie', 'MO', '63368', 'St. Charles County', False),
    ('lake-st-louis',    'Lake St. Louis',   'MO', '63367', 'St. Charles County', True),
    ('florissant',       'Florissant',       'MO', '63031', 'St. Louis County',   False),
    ('creve-coeur',      'Creve Coeur',      'MO', '63141', 'St. Louis County',   False),
    ('chesterfield',     'Chesterfield',     'MO', '63017', 'St. Louis County',   True),
    ('wildwood',         'Wildwood',         'MO', '63038', 'St. Louis County',   True),
    ('ballwin',          'Ballwin',          'MO', '63011', 'St. Louis County',   False),
    ('st-louis',         'St. Louis',        'MO', '63105', 'St. Louis County',   False),
    ('pacific',          'Pacific',          'MO', '63069', 'Franklin County',    False),
    ('belleville-il',    'Belleville',       'IL', '62220', 'St. Clair County',   False),
]

# The hand-written part of a NEW page: two lead paragraphs that could only
# be about that city. Existing pages keep whatever they already say.
COPY = {
    'lake-st-louis': [
        "Lake St. Louis is the far end of our St. Charles County routes, and we are there every week anyway - the trucks run out Highway 40 to Wentzville and back, so the Meadows, Hawk Ridge and the subdivisions along Lake Saint Louis Boulevard are on the way, not out of it.",
        "Lots here run bigger than in St. Peters, especially on the lake side and out toward Wyndgate. The form below prices a yard up to a quarter acre instantly; for anything larger we look at it properly and send a real number within a business day, because the time on site is what we are actually pricing."
    ],
    'wildwood': [
        "Wildwood is horse country with a Town Center, and a yard here can be a quarter acre or ten. Our west-county route already runs Chesterfield and Ballwin, so the neighborhoods off Highway 100 and Manchester, out toward Babler State Park, are a short leg further rather than a special trip.",
        "Because so many Wildwood lots are well over a quarter acre, the honest thing to say up front is that most Wildwood yards get a hand-built quote. Fill in the form and we look at the lot and send a real price within a business day - no table, no guessing."
    ],
    'dardenne-prairie': [
        "Dardenne Prairie sits between O'Fallon and Lake St. Louis, and our trucks cross it on the way to both. The subdivisions off Bryan Road, Hanley Road and Highway N are already on weekly routes, which is why we can price them the same as our home base in St. Peters.",
        "Newer houses, fenced yards, young dogs with energy to burn - Dardenne Prairie is almost exactly what a weekly scoop was invented for. Most yards here are under a quarter acre, so the price you see online is the price."
    ],
    'creve-coeur': [
        "Creve Coeur is where our St. Louis County route meets the city: the neighborhoods between Olive Boulevard and Ladue Road, around Creve Coeur Park and along Lindbergh, with the kind of established, tree-lined yards that collect more than a new subdivision ever does.",
        "Both halves of Creve Coeur are on our list - the 63141 side and the 63146 side - and the form knows which is which, so the number it shows is the number we charge. Mature yards with privacy fences are our bread and butter."
    ],
    'ballwin': [
        "Ballwin and Manchester are the backbone of our west-county route - the long-settled neighborhoods off Manchester Road, Clayton Road and Holloway, around Vlasis Park, where yards are big enough to need help and fenced enough to keep a dog in all day.",
        "We price Ballwin the same as St. Peters, and the online form shows that number instantly for any yard up to a quarter acre. Already have a scooper? Compare the price and the photo proof; we think it holds up."
    ],
}

AREAS_START, AREAS_END = '<!-- areas:start -->', '<!-- areas:end -->'
SCHEMA_START, SCHEMA_END = '<!-- schema:start -->', '<!-- schema:end -->'

# Pages that are not cities but belong in the sitemap and the footer.
EXTRA_PAGES = [('service-areas', 'Service areas'), ('commercial', 'Commercial & HOA')]


def engine_prices():
    """Standard-tier, one-dog figures from pricing.js, for the offer catalogue.
    Shelled out to node because the price list is JavaScript on purpose - it
    is the one file the website quotes from."""
    import json, subprocess
    js = ("global.window=global;" + (ROOT / 'pricing.js').read_text() +
          ";const q=f=>clppsQuote({zip:'63376',dogs:1,freq:f}).service;"
          "console.log(JSON.stringify({weekly:q('weekly'),biweekly:q('biweekly'),twice:q('twiceweekly'),"
          "onetime:CLPPS_PRICING.onetime,deo:CLPPS_PRICING.deodorize}))")
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def business_schema(page_url, area_name=None, area_state='MO'):
    """One LocalBusiness, identical on every page (same @id, so search engines
    merge them), with only areaServed narrowed on a city page. The business
    ADDRESS is St. Peters everywhere - a city page used to claim an address in
    its own city, which is a different, and wrong, thing."""
    P = engine_prices()
    offers = [
        ('Weekly pooper scooper service', 'Same day every week; full-yard sweep, waste hauled away, photo proof.', P['weekly'], 'MONTH'),
        ('Every-other-week pooper scooper service', 'Steady upkeep for lighter loads.', P['biweekly'], 'MONTH'),
        ('Twice-a-week pooper scooper service', 'For busy yards that stay spotless.', P['twice'], 'MONTH'),
        ('One-time yard cleanup', 'Spring cleanups, move-outs, party prep. Priced by time on site.', P['onetime'], None),
        ('Deodorize & sanitize treatment', 'Pet-safe odor treatment, per visit.', P['deo'], None),
    ]
    cities_served = [{"@type": "City", "name": "%s, %s" % (n, st)} for _, n, st, *_ in CITIES]
    counties = ["St. Charles County, MO", "St. Louis County, MO", "St. Louis City, MO", "Franklin County, MO",
                "Jefferson County, MO", "Warren County, MO", "Lincoln County, MO", "Madison County, IL", "St. Clair County, IL", "Monroe County, IL"]
    return {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": SITE + "/#business",
        "name": "CL Professional Pet Services LLC",
        "alternateName": "CLPPS",
        "description": "Locally owned pooper scooper and pet waste removal service based in St. Peters, MO, serving St. Charles County, St. Louis County and the wider St. Louis metro.",
        "url": page_url,
        "telephone": "+1-636-375-4342",
        "email": "info@clpropetservices.com",
        "image": SITE + "/images/share-card.jpg",
        "logo": SITE + "/images/logo.png",
        "address": {"@type": "PostalAddress", "addressLocality": "St. Peters", "addressRegion": "MO", "postalCode": "63376", "addressCountry": "US"},
        "geo": {"@type": "GeoCoordinates", "latitude": 38.7878, "longitude": -90.6290},
        "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
                                       "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                                       "opens": "06:00", "closes": "16:00"}],
        "priceRange": "$$",
        "sameAs": ["https://www.facebook.com/clpps1"],
        "areaServed": ([{"@type": "City", "name": "%s, %s" % (area_name, area_state)}] if area_name else counties + cities_served),
        "aggregateRating": {"@type": "AggregateRating", "ratingValue": "5.0", "reviewCount": "28"},
        "hasOfferCatalog": {
            "@type": "OfferCatalog", "name": "Pet waste removal plans",
            "itemListElement": [{
                "@type": "Offer",
                "itemOffered": {"@type": "Service", "name": nm, "description": d, "areaServed": "St. Louis metro, MO"},
                "priceSpecification": dict({"@type": "UnitPriceSpecification", "price": str(price), "priceCurrency": "USD",
                                            "description": "from, 1 dog, Standard ZIP tier"},
                                           **({"unitCode": "MON"} if unit == 'MONTH' else {}))
            } for nm, d, price, unit in offers]
        },
    }


def schema_block(page_url, area_name=None, area_state='MO', crumbs=None):
    import json
    blocks = [business_schema(page_url, area_name, area_state)]
    if crumbs:
        blocks.append({"@context": "https://schema.org", "@type": "BreadcrumbList",
                       "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]})
    return (SCHEMA_START + '\n' +
            '\n'.join('<script type="application/ld+json">%s</script>' % json.dumps(b, ensure_ascii=False) for b in blocks) +
            '\n' + SCHEMA_END)


def description_for(name, state):
    """Keyword first, a promise, a phone number - and never longer than Google
    will show. A long town name drops the word 'online' rather than the end."""
    for extra in ('online ', ''):
        d = ("Pooper scooper service in %s, %s: weekly, every-other-week and one-time pet waste removal, with photo proof. "
             "Instant %squote or call (636) 375-4342." % (name, state, extra))
        if len(d) <= 160:
            return d
    raise SystemExit('description too long for ' + name)

PRICE_START, PRICE_END = '<!-- price:start -->', '<!-- price:end -->'


def city(slug):
    for c in CITIES:
        if c[0] == slug:
            return c
    raise SystemExit('unknown city ' + slug)


def areas_block(this_slug):
    links = []
    for slug, name, state, *_ in CITIES:
        if slug == this_slug:
            continue
        label = name + (' IL' if state == 'IL' else '')
        links.append('<a href="/%s/">%s</a>' % (slug, label))
    links.append('<a href="/service-areas/"><strong>All areas &amp; ZIP codes</strong></a>')
    return (AREAS_START +
            '\n  <h2>Also serving</h2>\n'
            '  <p class="areas">' + ' &middot; '.join(links) + '</p>\n  ' + AREAS_END)


def js(text):
    """Text going inside a single-quoted JavaScript string. O'Fallon has an
    apostrophe in it, and the first version of this file wrote it straight
    in - the script died on 'Fallon and the page showed the static sentence
    instead of the live price."""
    return text.replace('\\', '\\\\').replace("'", "\\'")


def price_block(slug, name, state, zip_, county, big_lots):
    # Static text first so the line is readable with scripts off and by
    # crawlers; the script then replaces it with the live figure.
    fallback = ('Illinois yards are priced by hand - send the form and you will have a real quote within one business day.'
                if state == 'IL' else
                'Weekly service here starts around $85 a month for one dog. See the exact figure for your yard in the form.')
    note = (' Many lots here are over a quarter acre; those get a hand-built quote within a business day rather than a table price.'
            if big_lots else '')
    return (PRICE_START +
            '\n  <p class="price" id="city-price" data-zip="%s">%s%s</p>\n' % (zip_, fallback, note) +
            '''  <script>
  /* The price on this page comes from the same file the quote form uses, so
     the two can never disagree. If pricing.js is missing the static sentence
     above stays. */
  (function(){
    try {
      if (typeof clppsQuote !== 'function') return;
      var el = document.getElementById('city-price'), zip = el.getAttribute('data-zip');
      var one = clppsQuote({ zip: zip, dogs: 1, freq: 'weekly' });
      var two = clppsQuote({ zip: zip, dogs: 2, freq: 'weekly' });
      if (one.manual){
        el.textContent = 'We price %s by hand rather than off a table - send the form and you will have a real quote within one business day.';
        return;
      }
      el.innerHTML = 'Weekly service in %s is <strong>$' + one.service + ' a month</strong> for one dog and ' +
        '<strong>$' + two.service + '</strong> for two, with the initial clean ' +
        (one.initial ? 'at $' + one.initial + ' on the first invoice' : 'currently waived') + '.%s ' +
        'Every other week is the weekly price plus $10; twice a week is almost double. ' +
        '<a href="/#quote">See your exact price</a>.';
    } catch (e) {}
  })();
  </script>
  ''' % (js(name), js(name), js(note)) + PRICE_END)


def live_reviews(html):
    """The badge reads its rating and count from the backend (reviews.js),
    with the typed figure as the fallback. One number, one place."""
    html = re.sub(r'<div class="badge"><span class="sc">([\d.]+)</span><span class="st">([^<]*)</span><small>on Google<br>(\d+) reviews</small></div>',
                  r'<div class="badge"><span class="sc" data-review-rating>\1</span><span class="st">\2</span><small>on Google<br><span data-review-count>\3 reviews</span></small></div>',
                  html, count=1)
    if 'src="/reviews.js' not in html:
        html = html.replace('  <script src="/meta-pixel.js', '  <script src="/reviews.js"></script>\n  <script src="/meta-pixel.js', 1)
    return html


def ensure_pricing_script(html):
    """Every city page loads pricing.js so the price line can compute."""
    if 'src="/pricing.js' in html:
        return html
    return html.replace('  <script src="/meta-pixel.js', '  <script src="/pricing.js"></script>\n  <script src="/meta-pixel.js', 1)


def fix_schema(html, name, state, slug):
    """One shared business record, in a marked block the generator owns. The
    first time through, the page's original hand-written LocalBusiness block
    is replaced by the marker."""
    if SCHEMA_START not in html:
        html = re.sub(r'<script type="application/ld\+json">\s*\{[^<]*"LocalBusiness"[^<]*</script>',
                      SCHEMA_START + '\n' + SCHEMA_END, html, count=1)
        assert SCHEMA_START in html, 'no schema block to replace on ' + slug
    page_url = '%s/%s/' % (SITE, slug)
    crumbs = [('Home', SITE + '/'), ('Service areas', SITE + '/service-areas/'), (name, page_url)]
    block = schema_block(page_url, name, state, crumbs)
    a, b = html.index(SCHEMA_START), html.index(SCHEMA_END) + len(SCHEMA_END)
    return html[:a] + block + html[b:]


def tighten_description(html, name, state):
    return re.sub(r'(<meta name="description" content=")[^"]*(")',
                  lambda m: m.group(1) + description_for(name, state) + m.group(2), html, count=1)


def defer_scripts(html):
    """reviews.js waits for the DOM itself and the pixel is self-contained, so
    neither needs to block the first paint. pricing.js stays blocking: the
    price line and the quote wizard read it at parse time."""
    for f in ('reviews.js', 'meta-pixel.js'):
        html = re.sub(r'<script src="/%s(\?v=[0-9a-f]+)?"></script>' % re.escape(f),
                      lambda m: '<script defer src="/%s%s"></script>' % (f, m.group(1) or ''), html, count=1)
    return html


def upsert_block(html, start, end, block, before_marker='<div class="btns" style="margin-top:26px;">'):
    if start in html and end in html:
        a, b = html.index(start), html.index(end) + len(end)
        return html[:a] + block + html[b:]
    assert before_marker in html, 'no place to put the block'
    return html.replace(before_marker, block + '\n  ' + before_marker, 1)


def style_additions(html):
    if '.areas{' in html:
        return html
    css = ('.areas{font-size:14px;color:#555;line-height:2;}\n'
           '.areas a{white-space:nowrap;}\n'
           '.price{font-size:16px;color:#1a1a1a;background:#F2F7F4;border-left:4px solid #188663;'
           'border-radius:0 10px 10px 0;padding:12px 16px;margin:14px 0 22px;}\n')
    return html.replace('.foot{', css + '.foot{', 1)


def new_page(slug, name, state, zip_, county, big_lots):
    tpl = (ROOT / 'st-peters' / 'index.html').read_text()
    p1, p2 = COPY[slug]
    h = tpl
    h = h.replace('St. Peters, MO', '%s, %s' % (name, state))
    h = h.replace('Pooper Scooper St. Peters', 'Pooper Scooper ' + name)
    h = h.replace('https://www.clpropetservices.com/st-peters/', '%s/%s/' % (SITE, slug))
    h = h.replace('pet waste removal in St. Peters, MO', 'pet waste removal in %s, %s' % (name, state))
    h = h.replace('Pet waste removal in St. Peters:', 'Pet waste removal in %s:' % name)
    h = h.replace('in St. Charles County.', 'in %s.' % county)
    h = h.replace('<span>St. Peters, MO</span>', '<span>%s, %s</span>' % (name, state))
    # the two hand-written paragraphs
    h = re.sub(r'<p class="lead">CL Professional Pet Services is headquartered[^<]*</p>\n  <p class="lead">[^<]*</p>',
               '<p class="lead">%s</p>\n  <p class="lead">%s</p>' % (p1, p2), h, count=1)
    h = h.replace('Get My St. Peters Price Online', 'Get My %s Price Online' % name)
    h = h.replace('Pooper scooper service options in St. Peters', 'Pooper scooper service options in ' + name)
    h = h.replace('What St. Peters-area customers say', 'What %s-area customers say' % name)
    # the brand line in the nav stays St. Peters: that is where the business is
    h = h.replace('<small>Pet Waste Management &middot; %s, %s</small>' % (name, state),
                  '<small>Pet Waste Management &middot; St. Peters, MO</small>')
    h = h.replace('&copy; 2026 CL Professional Pet Services LLC &middot; %s, %s' % (name, state),
                  '&copy; 2026 CL Professional Pet Services LLC &middot; St. Peters, MO')
    assert name in h and 'St. Peters, so' not in h, 'template substitution missed something for ' + slug
    return h


def update_sitemap():
    sm = (ROOT / 'sitemap.xml').read_text()
    changed = False
    for slug in [c[0] for c in CITIES] + [e[0] for e in EXTRA_PAGES]:
        loc = '%s/%s/' % (SITE, slug)
        if loc not in sm:
            entry = '  <url>\n    <loc>%s</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n' % loc
            sm = sm.replace('  <url><loc>%s/accessibility/' % SITE, entry + '  <url><loc>%s/accessibility/' % SITE, 1)
            changed = True
    return sm, changed


def footer_list():
    return ('Serving: ' + ' &middot; '.join(
        '<a href="/%s/">%s</a>' % (slug, name + (' IL' if state == 'IL' else ''))
        for slug, name, state, *_ in CITIES) +
        ' &middot; <a href="/service-areas/"><strong>All areas &amp; ZIP codes</strong></a> &middot; <a href="/commercial/">Commercial &amp; HOA</a>')


def shell(title, description, canonical_slug, body, extra_head=''):
    """The chrome every non-home page shares, lifted from the St. Peters page
    so the look is identical, with the body swapped."""
    tpl = (ROOT / 'st-peters' / 'index.html').read_text()
    head = tpl[:tpl.index('<body>')]
    head = re.sub(r'<title>[^<]*</title>', '<title>%s</title>' % title, head)
    head = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + description + m.group(2), head)
    head = head.replace('https://www.clpropetservices.com/st-peters/', '%s/%s/' % (SITE, canonical_slug))
    head = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="%s">' % title.split(' | CL')[0], head)
    head = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="%s">' % description, head)
    head = re.sub(SCHEMA_START + r'[\s\S]*?' + SCHEMA_END, lambda m: extra_head, head)
    nav = tpl[tpl.index('<nav>'):tpl.index('</nav>') + len('</nav>')]
    foot = tpl[tpl.index('<div class="foot">'):]
    return head + '<body>\n' + nav + '\n<div class="wrap">\n' + body + '\n</div>\n' + foot


def first_lead(slug):
    html = (ROOT / slug / 'index.html').read_text()
    m = re.search(r'<p class="lead">([^<]*)</p>', html)
    return m.group(1) if m else ''


def hub_page():
    import json, subprocess
    js = ("global.window=global;" + (ROOT / 'pricing.js').read_text() +
          ";const P=CLPPS_PRICING,il=z=>P.manualPrefixes.indexOf(z.slice(0,3))>=0;const by={};"
          "Object.keys(P.zips).sort().forEach(z=>{const k=il(z)?'Illinois':P.zips[z];(by[k]=by[k]||[]).push(z);});"
          "console.log(JSON.stringify(by))")
    tiers = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
    by_county = {}
    for slug, name, state, zip_, county, big in CITIES:
        by_county.setdefault(county, []).append((slug, name, state))
    order = ['St. Charles County', 'St. Louis County', 'Franklin County', 'St. Clair County']
    body = ['<h1>Pet Waste Removal Service Areas <span>across the St. Louis metro</span></h1>',
            '<p class="lead">We are based in St. Peters and run scheduled routes through St. Charles County, St. Louis County and into Franklin County, with hand-priced service across the river in Illinois. Every city below has its own page with local prices; every ZIP code we serve is listed underneath.</p>',
            '<div class="btns"><a class="cta big" href="/#quote">Get My Price Online</a><a class="btn2" href="tel:+16363754342">Call (636) 375-4342</a></div>']
    for county in order:
        if county not in by_county: continue
        body.append('<h2>%s</h2>' % county)
        for slug, name, state in by_county[county]:
            blurb = first_lead(slug)
            if len(blurb) > 190: blurb = blurb[:187].rsplit(' ', 1)[0] + '&hellip;'
            body.append('<div class="rev"><p><a href="/%s/"><strong>%s, %s</strong></a> &mdash; %s</p></div>' % (slug, name, state, blurb))
    body.append('<h2>Every ZIP code we serve</h2>')
    body.append('<p class="lead">Type any of these into the <a href="/#quote">quote form</a> and you will see your price on the spot. A Missouri ZIP that is not listed is still in our area if it starts 630, 631 or 633 - it is simply priced at the Value rate until it sends us enough work to look at properly.</p>')
    for key in ('Value', 'Core', 'Standard', 'Premium'):
        if tiers.get(key):
            body.append('<h3>%s tier</h3><p class="zips">%s</p>' % (key, ' '.join('<code>%s</code>' % z for z in tiers[key])))
    if tiers.get('Illinois'):
        body.append('<h3>Illinois &mdash; priced by hand</h3><p class="lead">We cross the river, but those routes are thin enough that a table price would more often be wrong than right. Send the form and we email a real quote within one business day.</p><p class="zips">%s</p>' % ' '.join('<code>%s</code>' % z for z in tiers['Illinois']))
    body.append('<div class="btns" style="margin-top:26px;"><a class="cta big" href="/#quote">See My Price in 60 Seconds</a></div>')
    extra = schema_block(SITE + '/service-areas/', crumbs=[('Home', SITE + '/'), ('Service areas', SITE + '/service-areas/')])
    html = shell('Service Areas &amp; ZIP Codes | Pooper Scooper St. Louis Metro | CL Professional Pet Services',
                 'Every city and ZIP code we cover for pooper scooper and pet waste removal across the St. Louis metro, with local prices. Call (636) 375-4342.',
                 'service-areas', '\n'.join(body), extra)
    return html.replace('.foot{', '.zips{line-height:2.2;}\n.zips code{background:#f2f7f4;border:1px solid #e4efe9;border-radius:6px;padding:3px 7px;font-size:13px;margin-right:4px;white-space:nowrap;}\n.rev p a{text-decoration:none;}\n.foot{', 1)


def commercial_page():
    body = ['<h1>Commercial &amp; Community Pet Waste Removal <span>St. Louis metro</span></h1>',
            '<p class="lead">HOAs, apartment communities, property managers, parks and businesses across St. Charles and St. Louis counties. Clean common areas keep residents happy, complaints down and property values up. No automated pricing here: commercial properties get a real conversation and a written proposal within one business day.</p>',
            '<div class="btns"><a class="cta big" href="/#commercial">Tell us about your property</a><a class="btn2" href="tel:+16363754342">Call (636) 375-4342</a></div>',
            '<h2>What we do for properties</h2>',
            '<ul class="svc">',
            '<li><strong>HOAs &amp; communities</strong> &mdash; scheduled cleanup of common grounds, walking trails and green spaces, with service logs your board can actually see</li>',
            '<li><strong>Apartments &amp; condos</strong> &mdash; pet-friendly properties stay pet-friendly when the grounds stay clean; visit frequency sized to your community</li>',
            '<li><strong>Pet waste stations</strong> &mdash; we install, stock and service them: bags refilled, bins emptied, hardware maintained on every visit</li>',
            '<li><strong>Parks, trails &amp; businesses</strong> &mdash; any grounds where dogs and people share space</li>',
            '<li><strong>Built around your property</strong> &mdash; custom schedules, simple monthly invoicing, licensed and insured crew, one point of contact who answers the phone</li>',
            '</ul>',
            '<h2>How it works</h2>',
            '<ul class="svc">',
            '<li><strong>Tell us about the property</strong> &mdash; size, number of stations, current arrangement, what is going wrong</li>',
            '<li><strong>We walk it</strong> &mdash; a real visit, a real conversation, and a written proposal within one business day</li>',
            '<li><strong>Scheduled service with proof</strong> &mdash; the same crew, the same days, photo confirmation and a log you can show the board</li>',
            '</ul>',
            '<p class="lead">Residential customers: your price is instant on the <a href="/#quote">quote form</a>.</p>',
            '<div class="btns" style="margin-top:26px;"><a class="cta big" href="/#commercial">Request a Commercial Proposal</a></div>']
    extra = schema_block(SITE + '/commercial/', crumbs=[('Home', SITE + '/'), ('Commercial & HOA', SITE + '/commercial/')])
    return shell('Commercial Pet Waste Removal | HOAs &amp; Apartments | CL Professional Pet Services',
                 'Pet waste removal and waste-station service for HOAs, apartments and property managers, St. Louis metro. Proposal in one business day. Call (636) 375-4342.',
                 'commercial', '\n'.join(body), extra)


def run(check=False):
    problems, wrote = [], []
    for slug, name, state, zip_, county, big in CITIES:
        path = ROOT / slug / 'index.html'
        if not path.exists():
            if check:
                problems.append('%s: no page' % slug); continue
            path.parent.mkdir(exist_ok=True)
            html = new_page(slug, name, state, zip_, county, big)
        else:
            html = path.read_text()
        out = html
        out = ensure_pricing_script(out)
        out = live_reviews(out)
        out = defer_scripts(out)
        out = style_additions(out)
        out = fix_schema(out, name, state, slug)
        out = tighten_description(out, name, state)
        out = upsert_block(out, PRICE_START, PRICE_END, price_block(slug, name, state, zip_, county, big),
                           before_marker='<h2>Pooper scooper service options')
        out = upsert_block(out, AREAS_START, AREAS_END, areas_block(slug))
        if out != html or not path.exists():
            if check:
                problems.append('%s: out of step' % slug)
            else:
                path.write_text(out); wrote.append(slug)
    home_p = ROOT / 'index.html'
    home = home_p.read_text()
    if SCHEMA_START in home:
        a, b = home.index(SCHEMA_START), home.index(SCHEMA_END) + len(SCHEMA_END)
        new_home = home[:a] + schema_block(SITE + '/') + home[b:]
        if new_home != home:
            if check: problems.append('index.html: business schema out of step')
            else: home_p.write_text(new_home); wrote.append('index.html schema')
    for slug, builder in (('service-areas', hub_page), ('commercial', commercial_page)):
        path = ROOT / slug / 'index.html'
        want = builder()
        have = path.read_text() if path.exists() else None
        if want != have:
            if check: problems.append('%s: out of step' % slug)
            else: path.parent.mkdir(exist_ok=True); path.write_text(want); wrote.append(slug)
    sm, sm_changed = update_sitemap()
    if sm_changed:
        if check: problems.append('sitemap.xml: missing a city')
        else: (ROOT / 'sitemap.xml').write_text(sm); wrote.append('sitemap.xml')
    home = (ROOT / 'index.html').read_text()
    home = home_p.read_text()
    new_home = re.sub(r'Serving: (<a href="/[a-z-]+/">(?:<strong>)?[^<]*(?:</strong>)?</a>(?: &middot; )?)+', footer_list(), home, count=1)
    if new_home != home:
        if check: problems.append('index.html: footer list out of step')
        else: (ROOT / 'index.html').write_text(new_home); wrote.append('index.html footer')
    if check:
        if problems:
            print('\n'.join('  ' + p for p in problems)); print('\nFAIL - run: python3 tools/city-pages.py'); sys.exit(1)
        print('PASS - every city page, the sitemap and the home footer agree with the city list'); return
    print('wrote: ' + (', '.join(wrote) if wrote else 'nothing (already in step)'))


if __name__ == '__main__':
    run(check='--check' in sys.argv)
