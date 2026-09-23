# Tests

The checks that run against this site before anything goes live.

## Why the folder starts with an underscore

GitHub Pages runs Jekyll, and Jekyll does not publish directories whose
name starts with `_`. So these files live in the repository but are never
served from clpropetservices.com. **Do not rename this folder** to
`tests/` — that would put it on the public site. If anyone ever adds a
`.nojekyll` file to the repository root, this protection goes away and
the folder needs excluding another way.

## Why they are in the repo at all

They used to live in a scratch directory outside the repository. On
23 September 2026 that machine was recycled and all 53 of them were
deleted — the site was untouched, but the net that catches mistakes
before customers see them was gone in one go. Anything worth keeping
belongs in git.

## Running them

```sh
_tests/run.sh
```

First run installs `playwright-core` (about 2MB, no browsers — it uses
the Chromium already on the machine). Everything after that is offline.

One file at a time, while you are working on something:

```sh
node _tests/test-contact-check.js
```

Browser tests need the local server, which `run.sh` starts for you. To
run one by hand, start it yourself first:

```sh
python3 -m http.server 8731 &   # from the repository root
node _tests/test-fake-contacts.js
```

## Reading the output

Every check prints `PASS - <what it promises>` or `FAIL - <the same>`,
and a failure prints what it actually got underneath. The last line is
`ALL PASS` or a failure count. `run.sh` exits non-zero if anything
failed, so it can be wired into a hook or an action later.

The names are written as promises to a customer or to the office, not
as function names — `rejects "1234567890" (area code starts with 1)`
rather than `test_phone_validation_3`. When one fails you should be
able to tell what broke for a real person without opening the file.

## What is here

| file | covers |
|---|---|
| `test-contact-check.js` | phone and email rules, on their own — no browser |
| `test-fake-contacts.js` | the same rules as a customer and the office meet them |
| `test-pricing.js` | every price the engine can quote, and the tier map |

## What is missing

The 53 files that were lost covered a great deal more than this: the
quote wizard end to end, the lead tracker, accessibility, Meta Pixel
events, the Apps Script backend, cache stamping, the printed price
sheet. Those are gone and have not been rewritten. The three files here
are the ones rebuilt since.

If you are about to change something that is not covered, it is worth
writing the test first — that is how the gap gets closed, a bit at a
time, rather than all at once.

## Before committing

Run `python3 tools/stamp-assets.py` after touching any shared script
(`pricing.js`, `contact-check.js`, `lead-source.js`, `city-view.js`,
`meta-pixel.js`). `run.sh` checks the stamps and fails if they are
stale, because a forgotten stamp means somebody's browser can pair a
new page with an old price list.
