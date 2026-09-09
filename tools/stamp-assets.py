#!/usr/bin/env python3
"""Stamp every shared script tag with the hash of the file it points at.

Why this exists
---------------
The site is served by GitHub Pages behind Cloudflare. Neither lets us set
cache headers, and GitHub Pages sends Cache-Control: max-age=600 on
everything. So a phone that loaded the site can keep a copy of
/pricing.js for a while after the page around it has been replaced.

Same-version staleness is harmless - you see yesterday's site, you
refresh, you see today's. MIXED versions are not: a new index.html that
waives the initial clean paired with an old pricing.js that still
charges it quotes the customer a number no one agreed to.

Adding ?v=<hash of the file> means the two can never disagree. Change
pricing.js and every page that loads it asks for a URL no cache has
seen, so the browser must fetch it. Change nothing and the hash is
identical, so the cached copy is reused and the site stays fast.

Run this after editing any file in ASSETS, before committing:

    python3 tools/stamp-assets.py           # rewrite the tags
    python3 tools/stamp-assets.py --check   # exit 1 if any are stale

--check is what the test suite calls, so a forgotten stamp fails loudly
here rather than quietly in somebody's browser.
"""

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ['pricing.js', 'lead-source.js', 'city-view.js', 'meta-pixel.js']

# src="/pricing.js"  or  src="/pricing.js?v=1a2b3c4d"  -> capture name + old stamp
TAG = re.compile(r'src="/(' + '|'.join(re.escape(a) for a in ASSETS) + r')(\?v=[0-9a-f]+)?"')


def stamp_of(name):
    """Eight hex characters of the file's content. Short enough to read in
    a URL, long enough that two versions will not collide."""
    return hashlib.md5((ROOT / name).read_bytes()).hexdigest()[:8]


def main():
    check = '--check' in sys.argv
    stamps = {name: stamp_of(name) for name in ASSETS}

    missing = [a for a in ASSETS if not (ROOT / a).exists()]
    if missing:
        print('FAIL - these assets do not exist: ' + ', '.join(missing))
        return 1

    changed, stale, refs = [], [], 0
    for page in sorted(ROOT.rglob('*.html')):
        if '.git' in page.parts:
            continue
        before = page.read_text(encoding='utf-8')
        hits = TAG.findall(before)
        if not hits:
            continue
        refs += len(hits)
        after = TAG.sub(lambda m: 'src="/%s?v=%s"' % (m.group(1), stamps[m.group(1)]), before)
        if after == before:
            continue
        rel = page.relative_to(ROOT)
        if check:
            stale.append(str(rel))
        else:
            page.write_text(after, encoding='utf-8')
            changed.append(str(rel))

    for name in ASSETS:
        print('  %-16s v=%s' % (name, stamps[name]))
    print('%d script tags across the site' % refs)

    if check:
        if stale:
            print('\nFAIL - %d page(s) point at a stale version: %s'
                  % (len(stale), ', '.join(stale)))
            print('Run: python3 tools/stamp-assets.py')
            return 1
        print('\nPASS - every page asks for the version of the file that is actually there')
        return 0

    print('\n%s' % ('updated: ' + ', '.join(changed) if changed else 'already up to date'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
