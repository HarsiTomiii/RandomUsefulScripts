# TVCalibrationTool

Test patterns, settings checklists and a Linux companion for calibrating two OLED TVs:

- **LG C6 42″**: the monitor for a **CachyOS** PC (KDE Plasma on Wayland, AMD Radeon) used for gaming, coding, YouTube and some Jellyfin
- **Philips 65″ OLED708**: Google TV, films via Jellyfin/Wholphin and YouTube

This is **Phase 1**: you judge by eye with test patterns. Phase 2 (planned) adds a Pixel 8 camera app as a relative meter.

| Part | What it does |
|---|---|
| [index.html](index.html) | Browser test patterns + per-TV settings checklists (with copyable commands) |
| [lgtv-pc/](lgtv-pc/README.md) | CachyOS companion for the LG: applies and verifies picture settings, checks HDMI 2.1/KDE/fonts, TV on/off with the PC, idle blanking |
| [serve.py](serve.py) | Serves the patterns on your LAN for the Philips's browser |

## LG C6 on CachyOS: quick start

```bash
cd TVCalibrationTool/lgtv-pc
./install.sh --all        # CLI + boot/shutdown, suspend/resume and idle services
lgtv-pc setup             # pair: accept the prompt on the TV
lgtv-pc doctor            # kernel/amdgpu HDMI 2.1 FRL, KDE mode/scale/VRR, fonts, services
lgtv-pc apply && lgtv-pc check
```

Then open `index.html` in Firefox or Chromium (native Wayland, zoom 100%), pick **LG C6 42″ · CachyOS PC** and go through the checklist and patterns.

**The one thing to know on AMD:** HDMI 2.1 FRL is new in Linux 7.2, ships disabled until 7.4, and without it 4K above 60 Hz silently drops to YCbCr 4:2:0. That gives blurry coloured text and grey blacks. `lgtv-pc doctor` tells you which case you're in and prints the fix. The **Chroma 4:4:4** pattern confirms it by eye.

## Patterns on the PC

Open `index.html`; no server needed. Before judging, the viewer overlay should say **✓ Pixel-exact 3840×2160**. At 150% KDE scaling that is DPR 1.5. If it doesn't, set browser zoom to 100%, go fullscreen (F11), and make sure the browser runs natively on Wayland and not through XWayland.

## Patterns on the Philips (or any TV with a browser)

**Option A: browser (best).** Serve the folder from the PC:

```bash
python serve.py          # prints http://<pc-ip>:8000
# only if ufw is enabled on CachyOS:
sudo ufw allow from 192.168.0.0/16 to any port 8000 proto tcp
```

Open that address in a Google TV browser app (e.g. TV Bro). To open one pattern directly, e.g. as a bookmark, use `http://<pc-ip>:8000/#pattern=gamma`.

**Option B: PNG pack.** **⬇ Export PNG pack** builds a ZIP of every static pattern and variant (49 images) at 3840×2160 or 1920×1080. Copy it to a USB stick or a Jellyfin photo library. The TV's photo viewer may use different picture settings than its video apps, so use option A for final checks.

## Viewer controls

| Key / remote | Action |
|---|---|
| ◀ ▶ | previous / next pattern |
| ▲ ▼ (mouse wheel) | change variant (grey level, ramp type, colour…) |
| OK / Enter / Space | cycle option (window size, line direction), or pin the info panel |
| I (click) | pin / unpin the info panel |
| S | save the current pattern as a PNG at screen resolution |
| F | toggle fullscreen |
| Esc / Back | close |

## Patterns

| # | Pattern | Checks |
|---|---|---|
| 1 | Black level | Brightness/Black Level, range mismatch or 4:2:0 fallback (grey blacks) |
| 2 | White clipping | Contrast, highlight clipping and tint, ABL (small-window variant) |
| 3 | Grey ramp & gradients | Banding, grey tint, near-black posterisation |
| 4 | Grey window | Grey tint 0–100% in 5% steps, window size 10/18/50/100%; also the Phase 2 meter target |
| 5 | Gamma check | Real gamma (1.8–2.6, sRGB) from line-pattern blending at 25/50/75% mixes |
| 6 | Chroma 4:4:4 | Coloured text and 1-px colour lines; catches 4:2:0 (AMD without FRL, or TV not in PC mode) |
| 7 | Sharpness & overscan | Edge lines at 0/2/4/6 px, sharpening halos, 1–3 px line groups |
| 8 | Text clarity | Real HTML code text in dark and light themes, with your scaling and font anti-aliasing |
| 9 | Colour bars & steps | Oversaturation (gamut mode / colour profile), colour clipping, near-black colour |
| 10 | Uniformity & fields | Banding, vertical lines, tint, image retention |
| 11 | Motion & refresh | Measured Hz, moving text, frame-skip strip (film with Pixel slow-mo) |

All values are full-range 8-bit sRGB, drawn 1:1 in device pixels on a canvas sized to `devicePixelRatio`. The text pattern is the exception: it uses real HTML text on purpose.

## Files

- `index.html`, `css/`, `js/`: the pattern tool (`patterns.js` drawing, `viewer.js` fullscreen and remote keys, `checklists.js` per-TV checklists, `zip.js` PNG-pack writer)
- `lgtv-pc/`: Linux companion for the LG (see its README)
- `serve.py`: LAN server for TV browsers
