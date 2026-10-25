#!/usr/bin/env bash
# Make TV Launcher the home screen on Google TV, or hand it back to the stock launcher.
#   scripts/home.sh enable|disable [adb-serial]
# Google TV ignores the HOME role, so "enable" also turns on HomeKeyService, which redirects the
# Home key. Other accessibility services (e.g. Button Mapper) are left as they are.
set -euo pipefail

action=${1:?usage: $0 enable|disable [adb-serial]}
[[ -n ${2:-} ]] && export ANDROID_SERIAL=$2

PKG=com.harsitomiii.tvlauncher
SERVICE=$PKG/$PKG.HomeKeyService
STOCK=com.google.android.apps.tv.launcherx

current=$(adb shell settings get secure enabled_accessibility_services | tr -d '\r')
[[ $current == null ]] && current=
# Drop our entry, keep everyone else's.
others=$(tr ':' '\n' <<<"$current" | grep -v -x -F "$SERVICE" | grep -v '^$' | paste -sd: || true)

case $action in
enable)
    adb shell cmd role add-role-holder android.app.role.HOME $PKG
    adb shell settings put secure enabled_accessibility_services "${others:+$others:}$SERVICE"
    adb shell settings put secure accessibility_enabled 1
    ;;
disable)
    adb shell cmd role add-role-holder android.app.role.HOME $STOCK
    if [[ -n $others ]]; then
        adb shell settings put secure enabled_accessibility_services "$others"
    else
        adb shell settings delete secure enabled_accessibility_services
    fi
    ;;
*)
    echo "usage: $0 enable|disable [adb-serial]" >&2
    exit 1
    ;;
esac

echo "HOME role:              $(adb shell cmd role get-role-holders android.app.role.HOME | tr -d '\r')"
echo "Accessibility services: $(adb shell settings get secure enabled_accessibility_services | tr -d '\r')"
