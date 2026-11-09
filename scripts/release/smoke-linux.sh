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
    grep -q "Local tool access" <<< "$tree" || { echo "Missing native first-run tool access dialog"; exit 1; }
    if grep -q "DigiPet M6" <<< "$tree"; then exit 1; fi
  ' bash "$@" > "work/smoke-$label.log" 2>&1
  result=$?
  set -e
  cat "work/smoke-$label.log"
  [[ $result == 0 ]]
}
sudo apt-get install -y "$(realpath work/downloaded/DigiPet-linux-x64.deb)"
launch deb /usr/bin/digipet
# Extract-and-run needs no FUSE mount, but does exercise the bundled AppRun and webview.
chmod +x work/downloaded/DigiPet-linux-x64.AppImage
APPIMAGE_EXTRACT_AND_RUN=1 launch appimage "$(realpath work/downloaded/DigiPet-linux-x64.AppImage)"
sudo apt-get remove -y digi-pet
trap - EXIT
! command -v digipet
for file in "$XDG_DATA_HOME/io.github.ethan-cyf.digipet"/ci-*-sentinel.txt "$XDG_CONFIG_HOME/io.github.ethan-cyf.digipet/ci-config-sentinel.txt"; do
  [[ $(cat "$file") == 'M6 disposable CI fixture' ]]
done
{
  echo 'PASS: deb install, X11/Xvfb native window launch, removal and CI user-data preservation'
  echo 'PASS: native first-run DigiPet tool-access dialog shown separately (no system calendar integration)'
  echo 'PASS: AppImage extract-and-run native window launch (no FUSE required)'
  echo 'NOT TESTED: FUSE mount, Wayland, compositor/tray/DPI integration, interactive GUI and real desktops'
} | tee work/smoke-linux.txt
