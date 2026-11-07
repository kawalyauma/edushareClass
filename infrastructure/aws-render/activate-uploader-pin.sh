#!/usr/bin/env bash
# Owner-initiated activation: shared 4-digit PIN with DynamoDB quotas.
# The PIN is entered privately and never saved to Git, shell history or JS.
set -euo pipefail

ROOT="/home/codexagent/workspace/edushareclass-deploy/remote-export-wt"
LIVE="/opt/notesug/archive/edushareclass"
BACKUP="/home/codexagent/workspace/edushareclass-deploy/backups/web-before-pin-upload-20261107"
export PATH="/home/codexagent/workspace/edushareclass-deploy/tools/node/bin:$PATH"

if [[ ! -t 0 ]]; then
    echo "Run activation in an interactive Ubuntu terminal." >&2
    exit 2
fi

printf "Enter the four-digit uploader PIN: "
IFS= read -rs EDUSHARE_UPLOAD_PIN
printf "\n"
if [[ ! "${EDUSHARE_UPLOAD_PIN}" =~ ^[0-9]{4}$ ]]; then
    echo "Expected exactly four digits." >&2
    exit 2
fi
export EDUSHARE_UPLOAD_PIN
trap 'unset EDUSHARE_UPLOAD_PIN' EXIT

cd "$ROOT"
# Validate and prebuild before changing live authentication.
python3 infrastructure/aws-render/test_quota_audio.py
npm run test
VITE_BASE_PATH=/edushareclass/ npm run build -w @edushare/web

# Deploys PIN hash and atomic DynamoDB quotas. Verifies new PIN and that
# the old long code is rejected; only then deletes the old credential.
python3 infrastructure/aws-render/deploy.py

# Switch the browser UI promptly after authentication is changed.
sudo -n mkdir -p "$BACKUP"
sudo -n cp -a "$LIVE/." "$BACKUP/"
sudo -n cp -an apps/web/dist/assets/. "$LIVE/assets/"
sudo -n install -m644 apps/web/dist/index.html "$LIVE/index.html.next"
sudo -n mv -f "$LIVE/index.html.next" "$LIVE/index.html"
echo "PIN_4_DIGIT_WEB_UI_PUBLISHED"

# End-to-end acceptance; reports failures rather than claiming success.
python3 infrastructure/aws-render/cors_check.py
python3 infrastructure/aws-render/smoke.py
echo "PIN_UPLOAD_AND_AUDIO_ENGINE_VERIFIED"
echo "The old long access code has been revoked."
echo "Open https://notesug.com/edushareclass/ in a fresh browser tab."
