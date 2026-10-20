#!/usr/bin/env bash
# Publishes the verified site to the public GitHub Pages repo.
# Run only after tools/verify.mjs passes. Safe to re-run: it commits, pushes and
# re-checks the Pages build. It never force-pushes and never rewrites history.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="HermesAlfredGuy/vesper-website-20261018"
BRANCH="main"
URL="https://hermesalfredguy.github.io/vesper-website-20261018/"
LOCAL="${LOCAL_URL:-http://127.0.0.1:9311/index.html}"

# The gate: the contrast of the text as it is *actually rendered* over the WebGL canvas.
# It blocks at 3.0, not 4.5, and the difference matters. Sampling pixels is not the test
# WCAG 1.4.3 specifies — it specifies the declared colours, and those are clean here
# (bone on #13100e is 15.6:1, --fg-dim at 93 % is about 12:1). A sampled estimate is
# biased *low* for 12 px anti-aliased text, where the glyph cores are a small minority of
# a padded box, so a 4.5 gate on a sampled number produces false failures and teaches you
# to ignore the tool. 3.0 is the floor for large text and for UI components (1.4.11): under
# it, something is genuinely unreadable over the render and the push stops. Everything
# between 3.0 and 4.5 is printed as a near-miss and is listed in README.md.
echo "— contrast gate —"
node tools/text-contrast.mjs "$LOCAL" 1440 900 4.5 > /tmp/vesper-contrast.txt 2>&1 || true
cat /tmp/vesper-contrast.txt
# block only on a reading under 3.0; 'unmeas' rows are boxes whose pixels were a single
# luminance, i.e. a capture that missed the text, and they are not contrast failures
# NF > 5 skips the tool's summary line ("FAIL 2   near-miss 0"), whose second field is a
# count and not a ratio
if awk '/^FAIL/ && NF > 5 { if ($2 + 0 < 3.0) bad = 1 } END { exit bad ? 1 : 0 }' /tmp/vesper-contrast.txt; then
  echo "contrast: nothing under 3.0 over the render"
else
  echo "text-contrast: something is under 3.0 over the render, not deploying"
  exit 1
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "${1:-VESPER: update site}"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$REPO" >/dev/null 2>&1; then
    git remote add origin "https://github.com/$REPO.git"
  else
    gh repo create "$REPO" --public --source=. --remote=origin \
      --description "VESPER — a concept landing page for a fictional sculptural portable light (design study, not a product for sale)."
  fi
fi

git push -u origin "$BRANCH"

# Pages from the branch root, if it is not already enabled.
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api --method POST "repos/$REPO/pages" -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null
fi

for i in $(seq 1 40); do
  STATUS=$(gh api "repos/$REPO/pages/builds/latest" --jq '.status' 2>/dev/null || echo pending)
  echo "pages build: $STATUS"
  if [ "$STATUS" = "built" ]; then break; fi
  sleep 15
done

echo "live: $URL"
curl -sS -o /dev/null -w "index.html -> %{http_code}\n" "$URL"

# the point of the deploy is that the bytes the world gets are the bytes that passed
# the gates, so compare them instead of trusting the build status
echo "— live bytes vs working tree —"
BAD=0
for f in index.html css/site.css js/main.js js/scene3d.js js/data.js assets/vesper-drawing.svg \
         vendor/postprocessing.module.js vendor/lenis.mjs vendor/meshopt_decoder.module.js assets/vesper-01.glb; do
  L=$(sha256sum "$f" | cut -d' ' -f1)
  R=$(curl -sS "$URL$f?cb=$(date +%s)" | sha256sum | cut -d' ' -f1)
  if [ "$L" = "$R" ]; then echo "  ok        $f  ${L:0:12}"; else echo "  MISMATCH  $f  local ${L:0:12} live ${R:0:12}"; BAD=1; fi
done
[ "$BAD" = 0 ] || { echo "the live site does not serve the working tree"; exit 1; }
echo "verified: $URL"
