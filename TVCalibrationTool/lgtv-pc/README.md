# lgtv-pc

Makes an **LG C6** behave like a proper PC monitor on **CachyOS** (KDE Plasma on Wayland, AMD GPU). It is built on [bscpylgtv](https://github.com/chros73/bscpylgtv) and controls the TV over your network.

- **Calibrated settings in one command.** `apply` sets the input to PC mode (4:4:4), picks the picture mode the TV uses for SDR and for HDR on that input, and writes accurate settings to both. `check` reads them back and shows ✓/✗ for each one, because the TV never confirms writes.
- **PC-side check.** `doctor` looks at the kernel/amdgpu HDMI 2.1 FRL state, the KDE mode, refresh rate, scale and VRR, font anti-aliasing for the WOLED subpixels, and the services.
- **The TV follows the PC.** It turns on at boot and resume (Wake-on-LAN, then switches to the PC input) and off at shutdown and suspend. It never turns the TV off while it shows another source, or during a reboot.
- **Idle blanking.** The panel turns off after N idle minutes, and back on instantly with mouse or keyboard. The TV stays on the PC input, unlike KDE's own "turn off screen", which makes the TV show "no signal" and power down.

## Install

```bash
./install.sh --all     # or pick: --power --sleep --idle ; remove with --uninstall
lgtv-pc setup          # asks for the TV IP and HDMI port, pairs (accept on the TV), finds the MAC
```

This installs a private Python venv with bscpylgtv in `~/.local/share/lgtv-pc`, the command `~/.local/bin/lgtv-pc`, and the config `~/.config/lgtv-pc/config.toml` (with the pairing key next to it). If you prefer the AUR package (`paru -S bscpylgtv`), run `lgtv_pc.py` with the system Python instead.

On the TV, enable **Settings → General → Devices → External Devices → "Turn on via Wi-Fi/LAN"** (the name may vary) for Wake-on-LAN. A wired connection is more reliable.

## Commands

| Command | |
|---|---|
| `lgtv-pc doctor` | Read-only health check of PC + TV, printing exact fix commands |
| `lgtv-pc apply [pc\|film]` | Configure + verify a profile (default `pc`) |
| `lgtv-pc check [profile]` | Verify only; exit code 1 if anything differs |
| `lgtv-pc on` / `off` | Wake + PC input / power off (only if showing the PC; `--force` overrides) |
| `lgtv-pc screen-off` / `screen-on` | Panel off/on, TV stays on |
| `lgtv-pc vrr-info` | TV's hidden FreeSync info overlay: refresh rate and VRR range |
| `lgtv-pc status` | Model, firmware, power, input, key settings |
| `lgtv-pc get picture colorTemperature gamma` | Read raw settings |
| `lgtv-pc set picture '{"colorTemperature": "50"}'` | Write raw settings to the active mode (verified) |

## Profiles

| Profile | SDR mode | HDR mode | Settings |
|---|---|---|---|
| `pc` (default) | Game Optimizer | HDR Game + HGIG | gamma 2.2, Color Gamut Auto, Sharpness 0, all processing/AI off |
| `film` | Filmmaker | HDR Filmmaker | gamma BT.1886, the rest as above |

Game Optimizer is used for the desktop too because it has the lowest input lag and VRR works in it. With these settings it is as accurate as Filmmaker Mode.

Colour temperature, OLED Pixel Brightness (`backlight`) and Contrast are **your choice** and not enforced by default. Pick them with the grey-window and clipping patterns, read the values with `lgtv-pc get picture colorTemperature backlight contrast`, and add them to `[profiles.pc.sdr]` in the config to lock them in. Setting names come from bscpylgtv's documentation for the 2026 G6, which runs the same webOS 11 as the C6. Anything your firmware names differently shows up as ✗ or "not reported" in `check`.

## AMD + HDMI 2.1 FRL on CachyOS

| Kernel | 4K above 60 Hz | VRR over HDMI |
|---|---|---|
| < 7.2 | only as YCbCr 4:2:0 (blurry colour text, grey blacks) | yes, but only at 4:2:0 |
| 7.2 / 7.3 | RGB 4:4:4 **after** enabling FRL (below) | not reliable over FRL: Adaptive sync = Never |
| 7.4+ | FRL on by default (planned) | HDMI VRR/FreeSync + ALLM (planned) |

```bash
echo 'options amdgpu dcfeaturemask=0x402' | sudo tee /etc/modprobe.d/99-amdgpu-hdmi-frl.conf
sudo limine-mkinitcpio        # CachyOS with Limine; otherwise: sudo mkinitcpio -P
reboot
cat /sys/module/amdgpu/parameters/dcfeaturemask    # 1026 = FRL on
```

`0x402` is the FRL bit `0x400` plus the driver's default `0x2`. Delete the file once you're on 7.4+. `doctor` warns if an old override is still there. Sources: [CachyOS forum](https://discuss.cachyos.org/t/hdmi-2-1-frl-is-disabled-by-default-in-7-2-3-4k120-silently-falls-back-to-ycbcr-40/35350), [HWBusters](https://hwbusters.com/news/amds-hdmi-2-1-frl-goes-default-on-in-linux-and-the-boot-flag-retires-with-it/), [Phoronix](https://www.phoronix.com/news/HDMI-FRL-2.1-Submitted-DRM).

## Services

| Unit | Kind | Does |
|---|---|---|
| `lgtv-pc-power.service` | system | `on --boot` at startup, `off --shutdown` at power-off (skipped on reboot) |
| `lgtv-pc-sleep.service` | system | `off --sleep` before suspend, `on --resume` after |
| `lgtv-pc-idle.service` | user | `swayidle` (KWin implements ext-idle-notify): `screen-off --idle` after `idle_screen_off_minutes`, `screen-on --idle` on activity |

For the idle service, set KDE **System Settings → Power Management → Turn off screen: Never**. Keep the lock screen if you want it. Video players and most games inhibit idle, so the screen stays on during films and controller-only play. Check that on your setup:

```bash
journalctl --user -u lgtv-pc-idle -f
```

Related projects: [LG Buddy](https://github.com/Faceless3882/LG_Buddy) (power automation, GNOME/swayidle), [LGTV Companion](https://github.com/JPersson77/LGTVCompanion) (Windows).
