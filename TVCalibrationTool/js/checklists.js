/* Settings checklists per device. `pattern` links an item to a test pattern id.
 * Menu names change between firmware versions; items say "(name may vary)" where unsure. */
(function () {
  'use strict';

  const LG = {
    id: 'lgc6',
    name: 'LG C6 42″ · CachyOS PC',
    blurb: 'CachyOS with KDE Plasma (Wayland) on an AMD Radeon over HDMI, for gaming, coding, YouTube and the odd Jellyfin film. The lgtv-pc companion (TVCalibrationTool/lgtv-pc) applies and verifies the TV settings and checks the PC side; the patterns confirm the result by eye.',
    sections: [
      {
        title: 'Before you start',
        items: [
          { id: 'pre-nightlight', text: 'KDE Night Light off while judging colour', detail: 'System Settings → Display & Monitor → Night Light. It tints every pattern.' },
          { id: 'pre-zoom', text: 'Browser zoom at 100%, viewer in fullscreen (F11)', detail: 'The viewer overlay should say "✓ Pixel-exact 3840×2160" (at 150% scaling: DPR 1.5). Run the browser as a native Wayland app; under XWayland it is scaled and blurry.' },
          { id: 'pre-hdr', text: 'HDR off in KDE for the SDR patterns', detail: 'Do the SDR steps first; HDR has its own section below.' },
          { id: 'pre-room', text: 'Judge in your normal lighting, and black level in a dark room', detail: 'Let the screen run for a few minutes first.' },
        ],
      },
      {
        title: 'lgtv-pc companion',
        items: [
          { id: 'lgtv-install', text: 'Install lgtv-pc and pair it with the TV', detail: 'From the repo checkout on the PC. Pairing shows a prompt on the TV; accept it with OK. For Wake-on-LAN, enable TV Settings → General → Devices → External Devices → "Turn on via Wi-Fi/LAN" (name may vary).', cmd: 'cd TVCalibrationTool/lgtv-pc\n./install.sh --all\nlgtv-pc setup' },
          { id: 'lgtv-doctor', text: 'Run lgtv-pc doctor and fix what it flags', detail: 'Read-only. It checks the kernel and amdgpu HDMI 2.1 FRL bit, the KDE mode, refresh rate, scale and VRR, font anti-aliasing, the services and the TV.', cmd: 'lgtv-pc doctor' },
          { id: 'lgtv-apply', text: 'Apply the "pc" profile, then check it', detail: 'Sets the input icon to PC (4:4:4) and puts SDR in Game Optimizer and HDR in HDR Game with HGIG on this input. It also sets gamma 2.2, Color Gamut Auto, Sharpness 0 and turns off all processing and AI features. Every value is read back (✓/✗), because the TV doesn’t confirm writes.', cmd: 'lgtv-pc apply\nlgtv-pc check' },
        ],
      },
      {
        title: 'HDMI 2.1 on AMD (the big one)',
        items: [
          { id: 'frl', text: 'HDMI 2.1 FRL active, or 4K above 60 Hz silently drops to 4:2:0', detail: 'Mainline amdgpu gained HDMI 2.1 FRL in Linux 7.2 but ships it off, and it’s planned to be on by default from 7.4. Without FRL, 4K at 100/120 Hz falls back to YCbCr 4:2:0: blurry coloured text and grey blacks. On 7.2/7.3, enable it with the module option below (0x402 = FRL bit 0x400 + the default 0x2), rebuild the initramfs and reboot. Delete the file once you’re on 7.4+.', pattern: 'chroma', cmd: "echo 'options amdgpu dcfeaturemask=0x402' | sudo tee /etc/modprobe.d/99-amdgpu-hdmi-frl.conf\nsudo limine-mkinitcpio      # CachyOS with Limine; otherwise: sudo mkinitcpio -P\ncat /sys/module/amdgpu/parameters/dcfeaturemask   # after reboot: 1026" },
          { id: 'frl-vrr', text: 'VRR: wait for Linux 7.4, or choose between VRR and full 4K120 until then', detail: 'HDMI VRR/FreeSync and ALLM over FRL arrive with the 7.4 patches; before that, VRR over FRL is unreliable. Until then, choose 4K 120–165 Hz RGB 4:4:4 with Adaptive sync set to Never (best for coding), or 4K60 with VRR. CachyOS offers linux-cachyos-rc if you want 7.4 early.', pattern: 'motion' },
          { id: 'cable', text: 'Ultra High Speed (48 Gbps) HDMI cable, TV port with HDMI 2.1', detail: 'Short certified cables avoid FRL link training failures, which show up as flicker or black screens at 120 Hz and above.' },
        ],
      },
      {
        title: 'KDE Plasma display settings',
        items: [
          { id: 'kde-mode', text: '3840×2160 at the highest refresh rate offered (120/144/165 Hz)', detail: 'System Settings → Display & Monitor. The motion pattern shows the real refresh rate.', pattern: 'motion', cmd: 'kscreen-doctor -o                       # find the output name, e.g. HDMI-A-1\nkscreen-doctor output.HDMI-A-1.mode.3840x2160@144' },
          { id: 'kde-scale', text: 'Scale 150% (fractional), "Legacy applications (X11)": Apply scaling themselves', detail: 'Wayland fractional scaling is sharp for native apps. Run Electron/Chromium apps (VS Code, browsers) as native Wayland: --ozone-platform-hint=auto, or set the flag in their settings/flags file.', pattern: 'text' },
          { id: 'kde-vrr', text: 'Adaptive sync: Automatic (only for fullscreen games), or Never before Linux 7.4 with FRL', detail: '"Always" can cause brightness flicker on OLED at low frame rates on the desktop.', pattern: 'motion' },
          { id: 'kde-range', text: 'RGB range Full (if KDE offers the option), TV range Auto', detail: 'amdgpu sends full-range RGB for PC modes. If blacks look grey, check for the 4:2:0 fallback first (FRL), then the TV’s HDMI range setting (Auto/Low/High or Auto/Limited/Full, depending on firmware).', pattern: 'black-level' },
          { id: 'kde-profile', text: 'Colour profile: None, and let the TV’s Color Gamut Auto handle sRGB', detail: 'Don’t combine the EDID "built-in" profile with Auto gamut, which double-maps colours and undersaturates them. (The alternative is TV gamut Native + KDE built-in profile; stick to one.) Phase 2 can create a measured ICC profile.', pattern: 'colour' },
        ],
      },
      {
        title: 'Text & coding',
        items: [
          { id: 'fonts', text: 'Anti-aliasing on, sub-pixel rendering None (greyscale), hinting Slight', detail: 'System Settings → Text & Fonts. WOLED uses RWBG subpixels, so RGB/BGR subpixel AA adds coloured fringes. Re-login after changing.', pattern: 'text', cmd: 'kwriteconfig6 --file kdeglobals --group General --key XftSubPixel none\nkwriteconfig6 --file kdeglobals --group General --key XftHintStyle hintslight' },
          { id: 'pc-icon', text: 'Input icon "PC" so the TV keeps full 4:4:4 chroma', detail: 'Done by lgtv-pc apply, or on the TV: Home Hub → edit the input → PC. Without it coloured text smears even when the PC sends RGB.', pattern: 'chroma' },
          { id: 'editor', text: 'Dark editor theme, font size checked at your seating distance', detail: 'Dark themes also reduce ABL dimming and burn-in risk on OLED.', pattern: 'text' },
        ],
      },
      {
        title: 'TV picture (SDR): what lgtv-pc apply sets',
        items: [
          { id: 'mode', text: 'Game Optimizer for everything on the PC input', detail: 'Lowest input lag for the desktop too, and VRR works there. With the settings below it’s as accurate as Filmmaker Mode. For films, run "lgtv-pc apply film" (Filmmaker, BT.1886) and "lgtv-pc apply" to switch back.' },
          { id: 'gamma', text: 'Gamma 2.2', detail: 'What desktop, web and YouTube content is made for. Confirm with the gamma pattern: the 2.2 patch should blend in.', pattern: 'gamma' },
          { id: 'gamut', text: 'Color Gamut: Auto (not Native/Wide)', detail: 'Native/Wide stretches sRGB to the panel’s full gamut: neon reds, sunburnt skin.', pattern: 'colour' },
          { id: 'sharp', text: 'Sharpness 0, all processing and AI off', detail: 'Super Resolution, Noise Reduction, MPEG NR, Smooth Gradation, Dynamic Contrast, Energy Saving, Eye Comfort, AI Picture/Brightness/Genre.', pattern: 'sharpness' },
          { id: 'temp', text: 'Colour temperature: Warm, chosen by eye (not enforced)', detail: 'LG’s Warm 50 is its nominal D65 target; RTINGS measured Warm 40 slightly closer on its C6. Step the grey window through all levels, then lock your value in the config ("lgtv-pc get picture colorTemperature").', pattern: 'window' },
          { id: 'contrast', text: 'Contrast: highest value where 250–253 stay visible', pattern: 'white-clip' },
          { id: 'blacklevel', text: 'Black Level slider: squares 2–3 faintly visible in the dark', detail: 'Default 50. Change it only after FRL and range are right.', pattern: 'black-level' },
          { id: 'oledlight', text: 'OLED Pixel Brightness for your room, not maximum', detail: 'Comfortable white on the 50% grey window. Lower also reduces burn-in risk.', pattern: 'window' },
        ],
      },
      {
        title: 'Gaming on CachyOS',
        items: [
          { id: 'vrr', text: 'VRR confirmed on the TV', detail: '"lgtv-pc vrr-info" opens the TV’s hidden FreeSync info overlay (refresh rate and VRR range). Enable AMD FreeSync Premium / VRR in the TV’s Game Optimizer menu.', cmd: 'lgtv-pc vrr-info' },
          { id: 'fpscap', text: 'Cap fps a few below the refresh rate so VRR stays engaged', detail: 'MangoHud: fps_limit=138 (for 144 Hz) in ~/.config/MangoHud/MangoHud.conf, or the in-game limiter.' },
          { id: 'blackstab', text: 'Black Stabilizer default for accuracy, higher only for competitive visibility', pattern: 'black-level' },
          { id: 'bfi', text: 'OLED Motion (black frame insertion) off with VRR', detail: 'BFI and VRR don’t combine, and BFI costs a lot of brightness.' },
        ],
      },
      {
        title: 'HDR (optional)',
        items: [
          { id: 'hdr-kde', text: 'KDE HDR on, then "Calibrate HDR" in Display settings', detail: 'Plasma 6.4+ has an HDR calibration wizard (peak/max brightness). HDR Game with HGIG is preset by lgtv-pc apply, so the TV doesn’t tone-map on top of KWin.' },
          { id: 'hdr-sdr', text: 'SDR content in HDR: SDR brightness comfortable, SDR colour intensity 0%', detail: 'Intensity above 0% stretches sRGB colours. Compare the black level and gamma patterns with HDR on and off; many people keep HDR off for the desktop and enable it for games.', pattern: 'gamma' },
          { id: 'hdr-games', text: 'HDR in games: Proton on native Wayland with HDR, or gamescope', detail: 'Steam launch options: PROTON_ENABLE_WAYLAND=1 PROTON_ENABLE_HDR=1 %command% (recent Proton / proton-cachyos), or gamescope --hdr-enabled -f -- %command%. Check the in-game peak brightness against KDE’s calibration.' },
        ],
      },
      {
        title: 'OLED care',
        items: [
          { id: 'idle', text: 'Idle blanking by lgtv-pc, not KDE’s "turn off screen"', detail: 'lgtv-pc-idle turns the panel off after N idle minutes (instant on again with mouse/keyboard) while the TV stays on the PC input. With KDE turning the signal off instead, the TV shows "no signal" and may power down. Set Power Management → Turn off screen: Never and keep the lock screen.', cmd: 'systemctl --user status lgtv-pc-idle' },
          { id: 'power', text: 'TV follows the PC: on at boot/resume, off at shutdown/suspend', detail: 'lgtv-pc-power/-sleep services. They only turn the TV off when it shows the PC, and leave it on during a reboot.' },
          { id: 'static', text: 'Breeze Dark, auto-hide or floating panel, varied wallpaper', detail: 'Static bright UI is the main burn-in risk in PC use.' },
          { id: 'refresher', text: 'Leave the TV in standby (plugged in) so pixel refresh can run', detail: 'Don’t disable ASBL or other protections through service menus.' },
          { id: 'retention', text: 'Check now and then for retention on 5–20% greys', pattern: 'uniformity' },
        ],
      },
    ],
  };

  const PHILIPS = {
    id: 'philips708',
    name: 'Philips 65″ OLED708',
    blurb: 'Google TV (Android 14) for films via Jellyfin/Wholphin and YouTube. Picture styles are stored per source; apps on the TV usually share one set, so confirm after changing.',
    sections: [
      {
        title: 'Getting patterns onto the TV',
        items: [
          { id: 'browser', text: 'Option A: open this tool in a TV browser', detail: 'Serve the folder from the CachyOS PC and open the printed http://<pc-ip>:8000 address in a Google TV browser app. If ufw is active, allow the port from your LAN. Remote: ◀▶ pattern, ▲▼ variant, OK option, Back close.', cmd: 'python serve.py\n# only if ufw is enabled:\nsudo ufw allow from 192.168.0.0/16 to any port 8000 proto tcp' },
          { id: 'pngpack', text: 'Option B: Export pattern pack → USB stick or Jellyfin photo library', detail: 'Use "Export pattern pack" on this page at 3840×2160. The TV’s photo viewer may use different picture settings than video apps, so prefer option A for final checks.' },
          { id: 'ambilight', text: 'Ambilight off while judging patterns', detail: 'The wall glow changes how you see black and white. Turn it back on afterwards.' },
        ],
      },
      {
        title: 'Films & YouTube',
        items: [
          { id: 'style', text: 'Picture style: Filmmaker Mode / Movie (or ISF Night if listed)', detail: 'Names vary by firmware. Set Settings → Display & Sound → Picture → Auto Film Picture style so film content switches automatically.' },
          { id: 'ambient', text: 'Ambient light optimisation / light sensor off', detail: 'It changes brightness and gamma automatically, which makes the patterns inconsistent. You can re-enable it afterwards if you prefer.' },
          { id: 'proc', text: 'Processing off: AI picture, Ultra Resolution, Noise reduction, MPEG artefact reduction, Dynamic contrast / Perfect Contrast, Colour enhancement', detail: 'Names may vary (Picture → Advanced). Check the ramps for banding afterwards.', pattern: 'ramp' },
          { id: 'pnm', text: 'Perfect Natural Motion: Off (or Minimum if 24p judder bothers you)', detail: 'Personal preference. Off keeps the film look.' },
          { id: 'temp', text: 'Colour temperature Warm, greys neutral', detail: 'Step the grey window through all levels.', pattern: 'window' },
          { id: 'gamma', text: 'Gamma: about 2.4 for dark-room films, 2.2 for a lit room', detail: 'Use the gamma pattern to see where the slider actually lands.', pattern: 'gamma' },
          { id: 'brightness', text: 'Brightness (black level): squares 2–3 faintly visible in the dark', pattern: 'black-level' },
          { id: 'contrast', text: 'Contrast / OLED brightness: 250–253 still visible', pattern: 'white-clip' },
          { id: 'colour', text: 'Colour: all colour steps distinct, no neon on bars', pattern: 'colour' },
          { id: 'sharp', text: 'Sharpness low, no halos', pattern: 'sharpness' },
        ],
      },
      {
        title: 'HDMI sources (console / PC / Steam Link)',
        items: [
          { id: 'hdmiuhd', text: 'HDMI Ultra HD set to the 4K120/VRR option on the port you use', detail: 'Names may vary (e.g. "Optimal" / "Optimal (Auto game)").' },
          { id: 'gamestyle', text: 'Game or Monitor picture style for games/PC', detail: 'Check chroma and black level on that input.', pattern: 'chroma' },
          { id: 'format', text: 'Picture format: Original/Unscaled (no overscan)', pattern: 'sharpness' },
        ],
      },
      {
        title: 'OLED care',
        items: [
          { id: 'refresh', text: 'Leave the TV in standby (plugged in) so the OLED refresh can run' },
          { id: 'retention', text: 'Check now and then for retention on 5–20% greys', pattern: 'uniformity' },
        ],
      },
    ],
  };

  window.Checklists = { lgc6: LG, philips708: PHILIPS };
})();
