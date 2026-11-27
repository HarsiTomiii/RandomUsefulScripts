#!/usr/bin/env bash
# Install lgtv-pc for the current user on CachyOS / Arch.
#
#   ./install.sh              CLI only (~/.local/bin/lgtv-pc, Python venv with bscpylgtv)
#   ./install.sh --all        + power (boot/shutdown), sleep (suspend/resume) and idle services
#   ./install.sh --power --sleep --idle   pick individual services
#   ./install.sh --uninstall  remove services, CLI and venv (keeps ~/.config/lgtv-pc)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARE="${XDG_DATA_HOME:-$HOME/.local/share}/lgtv-pc"
BIN="$HOME/.local/bin/lgtv-pc"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/lgtv-pc/config.toml"
USER_UNITS="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

want_power=0 want_sleep=0 want_idle=0 uninstall=0
for a in "$@"; do
  case "$a" in
    --all) want_power=1 want_sleep=1 want_idle=1 ;;
    --power) want_power=1 ;;
    --sleep) want_sleep=1 ;;
    --idle) want_idle=1 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

render() {  # render <template> <dest> [sudo]
  local tmp; tmp="$(mktemp)"
  sed -e "s|@BIN@|$BIN|g" -e "s|@CONFIG@|$CONFIG|g" -e "s|@USER@|$USER|g" "$1" > "$tmp"
  if [[ "${3:-}" == sudo ]]; then sudo install -Dm644 "$tmp" "$2"; else install -Dm644 "$tmp" "$2"; fi
  rm -f "$tmp"
}

if (( uninstall )); then
  systemctl --user disable --now lgtv-pc-idle.service 2>/dev/null || true
  rm -f "$USER_UNITS/lgtv-pc-idle.service"
  if [[ -e /etc/systemd/system/lgtv-pc-power.service || -e /etc/systemd/system/lgtv-pc-sleep.service ]]; then
    sudo systemctl disable lgtv-pc-power.service lgtv-pc-sleep.service 2>/dev/null || true
    sudo rm -f /etc/systemd/system/lgtv-pc-power.service /etc/systemd/system/lgtv-pc-sleep.service
    sudo systemctl daemon-reload
  fi
  systemctl --user daemon-reload || true
  rm -rf "$SHARE" "$BIN"
  echo "Removed. Config and pairing key kept in $(dirname "$CONFIG")."
  exit 0
fi

command -v python3 >/dev/null || { echo "python3 missing: sudo pacman -S python" >&2; exit 1; }

echo "==> Python venv with bscpylgtv in $SHARE"
mkdir -p "$SHARE" "$(dirname "$BIN")"
[[ -x "$SHARE/venv/bin/python" ]] || python3 -m venv "$SHARE/venv"
"$SHARE/venv/bin/python" -m pip install --quiet --upgrade pip bscpylgtv
install -m644 "$SRC/lgtv_pc.py" "$SRC/config.example.toml" "$SHARE/"

cat > "$BIN" <<EOF
#!/bin/sh
exec "$SHARE/venv/bin/python" "$SHARE/lgtv_pc.py" "\$@"
EOF
chmod +x "$BIN"
echo "==> Installed $BIN"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "    (add ~/.local/bin to PATH)";; esac

if (( want_power || want_sleep )); then
  echo "==> System services (needs sudo)"
  (( want_power )) && render "$SRC/systemd/lgtv-pc-power.service" /etc/systemd/system/lgtv-pc-power.service sudo
  (( want_sleep )) && render "$SRC/systemd/lgtv-pc-sleep.service" /etc/systemd/system/lgtv-pc-sleep.service sudo
  sudo systemctl daemon-reload
  (( want_power )) && sudo systemctl enable lgtv-pc-power.service
  (( want_sleep )) && sudo systemctl enable lgtv-pc-sleep.service
  # wait-online is what makes network-online.target meaningful at boot
  if systemctl is-enabled NetworkManager.service >/dev/null 2>&1; then
    sudo systemctl enable NetworkManager-wait-online.service >/dev/null 2>&1 || true
  fi
fi

if (( want_idle )); then
  command -v swayidle >/dev/null || { echo "==> Installing swayidle"; sudo pacman -S --needed --noconfirm swayidle; }
  render "$SRC/systemd/lgtv-pc-idle.service" "$USER_UNITS/lgtv-pc-idle.service"
  systemctl --user daemon-reload
  systemctl --user enable lgtv-pc-idle.service
  echo "==> Idle blanking enabled (starts with your next login, or: systemctl --user start lgtv-pc-idle)"
fi

echo
[[ -f "$CONFIG" ]] || echo "Next: lgtv-pc setup     (pairs with the TV, accept the prompt on screen)"
echo "Then: lgtv-pc doctor && lgtv-pc apply && lgtv-pc check"
