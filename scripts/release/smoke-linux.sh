#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_OS:-} == Linux ]] || { echo 'CI runner only: never run on a user desktop'; exit 1; }
root=$(mktemp -d "$RUNNER_TEMP/digipet-m6.XXXXXX")
export XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data" XDG_CACHE_HOME="$root/cache"
export GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1
unset WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME/io.github.ethan-cyf.digipet" "$XDG_DATA_HOME/io.github.ethan-cyf.digipet"
for name in history packs data; do
  printf 'M6 disposable CI fixture\n' > "$XDG_DATA_HOME/io.github.ethan-cyf.digipet/ci-$name-sentinel.txt"
done
printf 'M6 disposable CI fixture\n' > "$XDG_CONFIG_HOME/io.github.ethan-cyf.digipet/ci-config-sentinel.txt"
cleanup() { sudo apt-get remove -y digi-pet; }
trap cleanup EXIT
launch() {
  local label=$1
  shift
  set +e
  dbus-run-session -- xvfb-run -a bash -c '
    "$@" & pid=$!
    trap '\''kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true'\'' EXIT
    sleep 8
    kill -0 "$pid" || exit 1
    tree=$(xwininfo -root -tree)
    echo "$tree"
    grep -q "DigiPet" <<< "$tree" || exit 1
    if grep -q "Local tool access" <<< "$tree"; then echo "Unexpected native tool-access dialog"; exit 1; fi
    if grep -q "DigiPet M6" <<< "$tree"; then exit 1; fi
  ' bash "$@" > "work/smoke-$label.log" 2>&1
  result=$?
  set -e
  cat "work/smoke-$label.log"
  [[ $result == 0 ]]
  node - "$XDG_DATA_HOME/io.github.ethan-cyf.digipet/tools/tools-v1.json" <<'NODE'
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!data.local_defaults_applied || !['calendar', 'journal'].every(t => data.grants.tools.includes(t))) throw Error('Local defaults missing');
if (['report', 'coding', 'file_search'].some(t => data.grants.tools.includes(t))) throw Error('File tool enabled without a folder');
NODE
}
sudo apt-get install -y "$(realpath work/downloaded/DigiPet-linux-x64.deb)"
launch deb /usr/bin/digipet
# Seed an existing pre-migration installation for the AppImage upgrade launch.
node - "$XDG_DATA_HOME/io.github.ethan-cyf.digipet/tools/tools-v1.json" <<'NODE'
require('node:fs').writeFileSync(process.argv[2], JSON.stringify({ grants: { tools: [], folders: {} }, calendar: [{ id: 'ci-kept', title: 'CI upgrade record', text: 'keep', date: '20261109T090000Z' }], journal: [] }));
NODE
printf 'deferred' > "$XDG_CONFIG_HOME/io.github.ethan-cyf.digipet/local-tool-access-v1.txt"
# Extract-and-run needs no FUSE mount, but does exercise the bundled AppRun and webview.
chmod +x work/downloaded/DigiPet-linux-x64.AppImage
APPIMAGE_EXTRACT_AND_RUN=1 launch appimage "$(realpath work/downloaded/DigiPet-linux-x64.AppImage)"
node - "$XDG_DATA_HOME/io.github.ethan-cyf.digipet/tools/tools-v1.json" <<'NODE'
const data = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (data.calendar[0]?.title !== 'CI upgrade record') throw Error('Upgrade lost a local record');
NODE
sudo apt-get remove -y digi-pet
trap - EXIT
! command -v digipet
for file in "$XDG_DATA_HOME/io.github.ethan-cyf.digipet"/ci-*-sentinel.txt "$XDG_CONFIG_HOME/io.github.ethan-cyf.digipet/ci-config-sentinel.txt"; do
  [[ $(cat "$file") == 'M6 disposable CI fixture' ]]
done
{
  echo 'PASS: deb install, X11/Xvfb native window launch, removal and CI user-data preservation'
  echo 'PASS: fresh launch and upgrade have no access dialog; Calendar/Journal default on, file tools denied; upgrade preserves records'
  echo 'PASS: AppImage extract-and-run native window launch (no FUSE required)'
  echo 'NOT TESTED: FUSE mount, Wayland, compositor/tray/DPI integration, interactive GUI and real desktops'
} | tee work/smoke-linux.txt
