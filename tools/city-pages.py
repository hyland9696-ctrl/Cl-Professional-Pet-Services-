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


def ensure_pricing_script(html):
    """Every city page loads pricing.js so the price line can compute."""
    if 'src="/pricing.js' in html:
        return html
    return html.replace('  <script src="/meta-pixel.js', '  <script src="/pricing.js"></script>\n  <script src="/meta-pixel.js', 1)


def fix_schema(html, name, state):
    """The business is in St. Peters. The city is the area it serves."""
    html = re.sub(r'"address":\{"@type":"PostalAddress","addressLocality":"[^"]*","addressRegion":"[A-Z]{2}"',
                  '"address":{"@type":"PostalAddress","addressLocality":"St. Peters","addressRegion":"MO"', html)
    html = re.sub(r'"areaServed":\{"@type":"City","name":"[^"]*"\}',
                  '"areaServed":{"@type":"City","name":"%s, %s"}' % (name, state), html)
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
    for slug, *_ in CITIES:
        loc = '%s/%s/' % (SITE, slug)
        if loc not in sm:
            entry = '  <url>\n    <loc>%s</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n' % loc
            sm = sm.replace('  <url><loc>%s/accessibility/' % SITE, entry + '  <url><loc>%s/accessibility/' % SITE, 1)
            changed = True
    return sm, changed


def footer_list():
    return 'Serving: ' + ' &middot; '.join(
        '<a href="/%s/">%s</a>' % (slug, name + (' IL' if state == 'IL' else ''))
        for slug, name, state, *_ in CITIES)


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
        out = style_additions(out)
        out = fix_schema(out, name, state)
        out = upsert_block(out, PRICE_START, PRICE_END, price_block(slug, name, state, zip_, county, big),
                           before_marker='<h2>Pooper scooper service options')
        out = upsert_block(out, AREAS_START, AREAS_END, areas_block(slug))
        if out != html or not path.exists():
            if check:
                problems.append('%s: out of step' % slug)
            else:
                path.write_text(out); wrote.append(slug)
    sm, sm_changed = update_sitemap()
    if sm_changed:
        if check: problems.append('sitemap.xml: missing a city')
        else: (ROOT / 'sitemap.xml').write_text(sm); wrote.append('sitemap.xml')
    home = (ROOT / 'index.html').read_text()
    new_home = re.sub(r'Serving: (<a href="/[a-z-]+/">[^<]*</a>(?: &middot; )?)+', footer_list(), home, count=1)
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
