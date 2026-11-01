#!/bin/zsh
# Saves the Gmail app password for team@korakaagaz.co as a Vercel secret and redeploys.
# The password is typed here (hidden) and goes straight to Vercel; it is never written to disk.
cd "$(dirname "$0")/.." || exit 1
echo "Paste the 16-letter app password for team@korakaagaz.co (spaces are fine), then press Enter:"
read -rs PASS
PASS="${PASS// /}"
if [[ ${#PASS} -ne 16 ]]; then
  echo "That was ${#PASS} characters; an app password has 16 letters. Nothing was saved."
  exit 1
fi
vercel env rm SMTP_PASS production --yes >/dev/null 2>&1
printf '%s' "$PASS" | vercel env add SMTP_PASS production --type secret >/dev/null && echo "Saved to Vercel." || { echo "Couldn't save it to Vercel."; exit 1; }
unset PASS
echo "Redeploying so the app picks it up (about a minute)..."
vercel deploy --prod --yes >/dev/null 2>&1 && echo "Done. You can close this window." || echo "Redeploy failed; tell Claude."
