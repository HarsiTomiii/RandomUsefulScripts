#!/usr/bin/env python3
"""lgtv-pc: make an LG webOS TV (C6) behave like a PC monitor on Linux (CachyOS / KDE Plasma).

TV side (over the network, via bscpylgtv):
  setup / pair         find + pair the TV, write the config
  apply [profile]      set PC mode + picture modes + accurate settings (SDR and HDR) for the PC input
  check [profile]      read the active settings back and compare them with the profile
  on / off             Wake-on-LAN + switch to the PC input / power off (only if the TV is on the PC input)
  screen-off/on        pixels off/on (instant, TV stays on) - used for idle blanking
  vrr-info             show the TV's hidden FreeSync/VRR info overlay
  status, get, set     inspect / tweak raw settings

PC side (read-only):
  doctor               kernel/amdgpu HDMI 2.1 FRL, KDE display/font settings, services

Every bscpylgtv "set" goes through an API that returns no result, so `apply` always verifies by reading back.
"""

import argparse
import asyncio
import copy
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

try:
    import tomllib
except ImportError:  # Python < 3.11
    tomllib = None

APP = "lgtv-pc"
DEFAULT_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / APP / "config.toml"

# ---------------------------------------------------------------- profiles
# Key names/values from bscpylgtv's docs for the 2026 G6 (webOS 11, same platform as the C6).
# gamma: low=1.9, medium=2.2, high1=BT.1886, high2=2.4
ACCURATE_SDR = {
    "gamma": "medium",
    "colorGamut": "auto",          # sRGB/BT.709 content stays sRGB (Native/Wide oversaturate)
    "sharpness": "0", "hSharpness": "0", "vSharpness": "0",
    "superResolution": "off",
    "noiseReduction": "off",
    "mpegNoiseReduction": "off",
    "smoothGradation": "off",
    "dynamicContrast": "off",
    "energySaving": "off",
    "eyeComfortMode": "off",
}
CLEAN_HDR = {
    "sharpness": "0", "hSharpness": "0", "vSharpness": "0",
    "superResolution": "off",
    "noiseReduction": "off",
    "mpegNoiseReduction": "off",
    "dynamicContrast": "off",
    "energySaving": "off",
    "eyeComfortMode": "off",
}
AI_OFF = {"ai_Brightness": "off", "ai_Genre": "off", "ai_Picture": "off"}

DEFAULT_PROFILES = {
    "pc": {
        "description": "Daily PC use: Game Optimizer everywhere (lowest lag, VRR) tuned to be accurate; HDR games use HGIG.",
        "sdr_mode": "game",
        "hdr_mode": "hdrGame",
        "sdr": dict(ACCURATE_SDR),
        "hdr": dict(CLEAN_HDR, hgig="on"),
        "ai": dict(AI_OFF),
    },
    "film": {
        "description": "Films on the PC (Jellyfin) in a dark room: Filmmaker Mode, BT.1886.",
        "sdr_mode": "filmMaker",
        "hdr_mode": "hdrFilmMaker",
        "sdr": dict(ACCURATE_SDR, gamma="high1"),
        "hdr": dict(CLEAN_HDR),
        "ai": dict(AI_OFF),
    },
}

DEFAULT_CFG = {
    "tv": {"ip": "", "mac": "", "hdmi": 1, "pc_icon": True, "key_file": ""},
    "automation": {
        "only_when_on_pc_input": True,
        "power_on_at_boot": True,
        "power_off_at_shutdown": True,
        "off_on_sleep": True,
        "idle_screen_off_minutes": 10,
        "wake_timeout_seconds": 30,
    },
    "profile": "pc",
    "profiles": {},
}


# ---------------------------------------------------------------- helpers
def log(*a):
    print(*a, file=sys.stderr, flush=True)


def deep_merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path):
    path = Path(path)
    cfg = copy.deepcopy(DEFAULT_CFG)
    if path.exists():
        if tomllib is None:
            sys.exit("Python 3.11+ is required (tomllib).")
        with open(path, "rb") as f:
            cfg = deep_merge(cfg, tomllib.load(f))
    cfg["_path"] = path
    if not cfg["tv"].get("key_file"):
        cfg["tv"]["key_file"] = str(path.parent / "client-key.sqlite")
    return cfg


def profile(cfg, name):
    name = name or cfg.get("profile") or "pc"
    base = DEFAULT_PROFILES.get(name, {})
    over = cfg.get("profiles", {}).get(name, {})
    if not base and not over:
        sys.exit(f"Unknown profile '{name}'. Known: {', '.join(sorted(set(DEFAULT_PROFILES) | set(cfg.get('profiles', {}))))}")
    return name, deep_merge(base, over)


def state_dir():
    d = os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    p = Path(d) / APP if os.path.isdir(d) else Path(f"/tmp/{APP}-{os.getuid()}")
    p.mkdir(parents=True, exist_ok=True)
    return p


def hdmi_ids(cfg):
    n = int(cfg["tv"]["hdmi"])
    return {
        "n": n,
        "input": f"HDMI_{n}",                     # set_input / set_device_info
        "app": f"com.webos.app.hdmi{n}",          # foreground app id when the input is shown
        "pq": f"hdmi{n}_pc" if cfg["tv"].get("pc_icon", True) else f"hdmi{n}",  # picture-settings input id
    }


def send_wol(mac, ip=None):
    mac_clean = re.sub(r"[^0-9a-fA-F]", "", mac or "")
    if len(mac_clean) != 12:
        raise ValueError(f"invalid MAC address '{mac}'")
    packet = b"\xff" * 6 + bytes.fromhex(mac_clean) * 16
    targets = {"255.255.255.255"}
    if ip:
        parts = ip.split(".")
        if len(parts) == 4:
            targets.add(".".join(parts[:3] + ["255"]))  # assumes a /24 home network
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for t in targets:
            for port in (9, 7):
                try:
                    s.sendto(packet, (t, port))
                except OSError:
                    pass


def mac_from_neighbours(ip):
    try:
        out = subprocess.run(["ip", "neigh", "show", ip], capture_output=True, text=True, timeout=3).stdout
        m = re.search(r"lladdr\s+([0-9a-f:]{17})", out)
        return m.group(1) if m else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def norm(v):
    """Compare TV values loosely: the TV returns numbers as strings."""
    if isinstance(v, bool):
        return str(v).lower()
    return str(v).strip().lower()


# ---------------------------------------------------------------- TV client
def bsc():
    try:
        from bscpylgtv import WebOsClient  # noqa
        from bscpylgtv.exceptions import PyLGTVPairException, PyLGTVCmdException  # noqa
    except ImportError:
        sys.exit("bscpylgtv is not installed. Run install.sh, or: pip install bscpylgtv (or the AUR package 'bscpylgtv').")
    return WebOsClient


class TV:
    def __init__(self, cfg, timeout=2, attempts=3):
        if not cfg["tv"].get("ip"):
            sys.exit(f"No TV IP configured. Run `{APP} setup` first (config: {cfg['_path']}).")
        self.cfg = cfg
        self.timeout = timeout
        self.attempts = attempts
        self.client = None

    async def __aenter__(self):
        WebOsClient = bsc()
        Path(self.cfg["tv"]["key_file"]).parent.mkdir(parents=True, exist_ok=True)
        self.client = await WebOsClient.create(
            self.cfg["tv"]["ip"],
            key_file_path=self.cfg["tv"]["key_file"],
            timeout_connect=self.timeout,
            connect_retry_attempts=self.attempts,
            ping_interval=None,
            states=["power", "current_app"],
        )
        await self.client.connect()
        return self.client

    async def __aexit__(self, *exc):
        if self.client:
            try:
                await self.client.disconnect()
            except Exception:
                pass


async def reachable(cfg, timeout=2):
    try:
        async with TV(cfg, timeout=timeout, attempts=1):
            return True
    except Exception:
        return False


async def read_settings(c, category, keys):
    """Read keys from a settings category; falls back to one key at a time so unknown keys don't hide the rest."""
    keys = list(dict.fromkeys(keys))
    try:
        res = await c.get_system_settings(category, keys)
        return dict(res.get("settings", {}))
    except Exception:
        out = {}
        for k in keys:
            try:
                res = await c.get_system_settings(category, [k])
                out.update(res.get("settings", {}))
            except Exception:
                pass
        return out


def is_hdr_mode(mode):
    return bool(mode) and (mode.startswith("hdr") or mode.startswith("dolby"))


# ---------------------------------------------------------------- TV commands
async def cmd_status(cfg, args):
    ids = hdmi_ids(cfg)
    async with TV(cfg) as c:
        sw = await c.get_software_info()
        power = await c.get_power_state()
        app = await c.get_current_app()
        pic = await read_settings(c, "picture", ["pictureMode", "backlight", "contrast", "gamma", "colorGamut", "pcMode"])
        other = await read_settings(c, "other", ["freesync", "qmsVrr", "eotf", "colorimetry"])
    print(f"TV:            {sw.get('product_name', '?')} {sw.get('model_name', '')}  firmware {sw.get('major_ver', '?')}.{sw.get('minor_ver', '?')}")
    print(f"Power:         {power.get('state', power)}")
    print(f"Foreground:    {app}  {'(PC input)' if app == ids['app'] else ''}")
    print(f"Picture:       {json.dumps(pic)}")
    if other:
        print(f"Other:         {json.dumps(other)}")


async def cmd_pair(cfg, args):
    log(f"Connecting to {cfg['tv']['ip']} - accept the prompt on the TV (remote: OK).")
    try:
        async with TV(cfg, timeout=5, attempts=3) as c:
            sw = await c.get_software_info()
            log(f"Paired with {sw.get('model_name', 'TV')}. Key stored in {cfg['tv']['key_file']}")
    except Exception as e:
        sys.exit(f"Pairing failed: {e}\nOn the TV: Settings > General > Devices > External Devices > 'TV On With Mobile' / 'Turn on via Wi-Fi' should be on.")


def write_config(path, ip, mac, hdmi):
    path.parent.mkdir(parents=True, exist_ok=True)
    example = Path(__file__).with_name("config.example.toml")
    text = example.read_text(encoding="utf-8") if example.exists() else '[tv]\nip = ""\nmac = ""\nhdmi = 1\n'
    text = re.sub(r'(?m)^ip = "[^"]*"', f'ip = "{ip}"', text, count=1)
    text = re.sub(r'(?m)^mac = "[^"]*"', f'mac = "{mac}"', text, count=1)
    text = re.sub(r"(?m)^hdmi = \d+", f"hdmi = {hdmi}", text, count=1)
    path.write_text(text, encoding="utf-8")


async def cmd_setup(cfg, args):
    path = cfg["_path"]
    ip = args.ip or cfg["tv"].get("ip") or input("TV IP address (TV: Settings > General > Network): ").strip()
    hdmi = args.hdmi or int(cfg["tv"].get("hdmi") or 0) or int(input("HDMI port the PC is connected to [1-4]: ").strip() or "1")
    cfg["tv"]["ip"] = ip
    cfg["tv"]["hdmi"] = hdmi
    await cmd_pair(cfg, args)
    mac = args.mac or cfg["tv"].get("mac") or mac_from_neighbours(ip)
    if not mac:
        log("Could not detect the TV's MAC address (needed for Wake-on-LAN). Add it to the config by hand:\n"
            "  TV: Settings > General > About this TV / Network > wired/Wi-Fi MAC")
    write_config(path, ip, mac, hdmi)
    log(f"Wrote {path}\nNext: `{APP} apply` then `{APP} check`.")


async def cmd_apply(cfg, args):
    ids = hdmi_ids(cfg)
    name, prof = profile(cfg, args.profile)
    async with TV(cfg) as c:
        if cfg["tv"].get("pc_icon", True):
            log(f"PC mode: setting {ids['input']} icon to PC (enables 4:4:4 chroma)")
            await c.set_device_info(ids["input"], "pc", "PC")
            await asyncio.sleep(1.5)
        log(f"Profile '{name}': SDR -> {prof['sdr_mode']}, HDR -> {prof['hdr_mode']} on {ids['pq']}")
        await c.set_picture_mode(prof["sdr_mode"], ids["pq"], "sdr")
        await c.set_picture_mode(prof["hdr_mode"], ids["pq"], "hdr")
        if prof.get("sdr"):
            await c.set_picture_settings(prof["sdr"], prof["sdr_mode"], ids["pq"])
        if prof.get("hdr"):
            await c.set_picture_settings(prof["hdr"], prof["hdr_mode"], ids["pq"])
        if prof.get("ai"):
            for mode in (prof["sdr_mode"], prof["hdr_mode"]):
                await c.set_picture_settings(prof["ai"], mode, ids["pq"], category="aiPicture")

        # If the PC input is showing, also switch + set the active mode directly (belt and braces).
        app = await c.get_current_app()
        if app == ids["app"]:
            cur = (await read_settings(c, "picture", ["pictureMode"])).get("pictureMode", "")
            hdr = is_hdr_mode(cur)
            target = prof["hdr_mode"] if hdr else prof["sdr_mode"]
            if cur != target:
                await c.set_current_picture_mode(target)
                await asyncio.sleep(1.5)
            block = prof.get("hdr" if hdr else "sdr") or {}
            if block:
                await c.set_settings("picture", block)
            if prof.get("ai"):
                await c.set_settings("aiPicture", prof["ai"])
            await asyncio.sleep(1.0)
        else:
            log(f"PC input is not on screen (foreground: {app}); stored settings for {ids['pq']} only. Run `{APP} check` once the PC is shown.")
    await cmd_check(cfg, args)


async def cmd_check(cfg, args):
    ids = hdmi_ids(cfg)
    name, prof = profile(cfg, args.profile)
    async with TV(cfg) as c:
        app = await c.get_current_app()
        if app != ids["app"]:
            print(f"! The TV shows '{app}', not the PC input ({ids['app']}). Values below belong to that source.")
        pic_keys = set(prof.get("sdr", {})) | set(prof.get("hdr", {})) | {"pictureMode", "pcMode", "backlight", "contrast", "brightness", "colorTemperature", "peakBrightness"}
        pic = await read_settings(c, "picture", sorted(pic_keys))
        ai = await read_settings(c, "aiPicture", list(prof.get("ai", {}))) if prof.get("ai") else {}

    mode = pic.get("pictureMode", "?")
    hdr = is_hdr_mode(mode)
    want_mode = prof["hdr_mode"] if hdr else prof["sdr_mode"]
    want = dict(prof.get("hdr" if hdr else "sdr", {}))
    rows, bad = [], 0

    def row(key, w, g):
        nonlocal bad
        if g is None:
            rows.append(("–", key, w, "(not reported by this TV)"))
        elif norm(w) == norm(g):
            rows.append(("✓", key, w, g))
        else:
            bad += 1
            rows.append(("✗", key, w, g))

    pc = pic.get("pcMode")
    if cfg["tv"].get("pc_icon", True):
        got = pc.get(f"hdmi{ids['n']}") if isinstance(pc, dict) else None
        row(f"pcMode.hdmi{ids['n']}", "true", None if got is None else got)
    row("pictureMode", want_mode, mode)
    for k, w in want.items():
        row(k, w, pic.get(k))
    for k, w in prof.get("ai", {}).items():
        row(f"aiPicture.{k}", w, ai.get(k))

    print(f"Profile '{name}' ({'HDR' if hdr else 'SDR'} signal right now)\n")
    wk = max(len(r[1]) for r in rows)
    for mark, k, w, g in rows:
        print(f"  {mark}  {k:<{wk}}  want {str(w):<10} got {g}")
    info = {k: pic.get(k) for k in ("backlight", "contrast", "brightness", "colorTemperature", "peakBrightness") if k in pic}
    print(f"\n  Your choice (not enforced): {json.dumps(info)}")
    print("  OLED Pixel Brightness = 'backlight'. Pick colour temperature by eye with the grey-window pattern;")
    print("  to enforce a value, add it to [profiles.<name>.sdr] in the config.")
    print(f"\n{'All good.' if not bad else f'{bad} setting(s) differ. Run `{APP} apply` or change them on the TV.'}")
    return bad


async def wait_until_reachable(cfg, deadline):
    while time.monotonic() < deadline:
        if await reachable(cfg, timeout=2):
            return True
        if cfg["tv"].get("mac"):
            send_wol(cfg["tv"]["mac"], cfg["tv"]["ip"])
        await asyncio.sleep(1.5)
    return False


async def cmd_on(cfg, args):
    auto = cfg["automation"]
    if args.boot and not auto.get("power_on_at_boot", True):
        return
    if args.resume and not auto.get("off_on_sleep", True):
        return
    ids = hdmi_ids(cfg)
    if cfg["tv"].get("mac"):
        send_wol(cfg["tv"]["mac"], cfg["tv"]["ip"])
    elif not await reachable(cfg):
        sys.exit("TV is off and no MAC is configured for Wake-on-LAN.")
    deadline = time.monotonic() + float(auto.get("wake_timeout_seconds", 30))
    if not await wait_until_reachable(cfg, deadline):
        sys.exit("TV did not come up. Check: TV Settings > General > Devices > 'Turn on via Wi-Fi/LAN' and that the MAC is the one of the active network interface.")
    async with TV(cfg) as c:
        state = (await c.get_power_state()).get("state", "")
        if state.lower() in ("screen off", "screen saver"):
            await c.turn_screen_on()
        if args.no_input:
            return
        if await c.get_current_app() != ids["app"]:
            await c.set_input(ids["input"])
    log("TV on, PC input selected.")


def rebooting():
    try:
        jobs = subprocess.run(["systemctl", "list-jobs", "--no-legend"], capture_output=True, text=True, timeout=3).stdout
        return "reboot.target" in jobs or "kexec.target" in jobs
    except (OSError, subprocess.SubprocessError):
        return False


async def cmd_off(cfg, args):
    auto = cfg["automation"]
    if args.shutdown:
        if not auto.get("power_off_at_shutdown", True):
            return
        if rebooting():
            log("Reboot in progress; leaving the TV on.")
            return
    if args.sleep and not auto.get("off_on_sleep", True):
        return
    ids = hdmi_ids(cfg)
    try:
        async with TV(cfg, timeout=2, attempts=2) as c:
            app = await c.get_current_app()
            if auto.get("only_when_on_pc_input", True) and not args.force and app != ids["app"]:
                log(f"TV is showing '{app}', not the PC; leaving it on (use --force to override).")
                return
            await c.power_off()
            log("TV off.")
    except Exception as e:
        log(f"TV not reachable ({e.__class__.__name__}); nothing to do.")


async def cmd_screen(cfg, args, on):
    marker = state_dir() / "screen-off-by-idle"
    ids = hdmi_ids(cfg)
    try:
        async with TV(cfg, timeout=2, attempts=2) as c:
            if on:
                if args.idle and not marker.exists():
                    return  # we didn't blank it; don't touch the TV
                await c.turn_screen_on()
                marker.unlink(missing_ok=True)
            else:
                if args.idle and cfg["automation"].get("only_when_on_pc_input", True):
                    app = await c.get_current_app()
                    if app != ids["app"]:
                        return
                await c.turn_screen_off()
                if args.idle:
                    marker.touch()
    except Exception as e:
        log(f"TV not reachable ({e.__class__.__name__}).")


async def cmd_idle(cfg, args):
    """Replace this process with swayidle: blank the TV after N idle minutes, restore on activity."""
    swayidle = shutil.which("swayidle")
    if not swayidle:
        sys.exit("swayidle is not installed: sudo pacman -S swayidle")
    minutes = float(cfg["automation"].get("idle_screen_off_minutes", 10))
    if minutes <= 0:
        log("idle_screen_off_minutes is 0: idle blanking disabled.")
        return
    me = [sys.executable, os.path.abspath(__file__), "--config", str(cfg["_path"])]
    q = " ".join(f"'{x}'" for x in me)
    log(f"Blanking the TV after {minutes:g} idle minutes.")
    os.execv(swayidle, [swayidle, "-w",
                        "timeout", str(int(minutes * 60)), f"{q} screen-off --idle",
                        "resume", f"{q} screen-on --idle"])


async def cmd_input(cfg, args):
    async with TV(cfg) as c:
        await c.set_input(hdmi_ids(cfg)["input"])


async def cmd_vrr_info(cfg, args):
    async with TV(cfg) as c:
        await c.launch_app_with_params("com.webos.app.tvhotkey", {"activateType": "freesync-info"})
    log("Showing the TV's FreeSync/VRR info overlay (refresh rate, VRR range). Close it with Back on the remote.")


async def cmd_get(cfg, args):
    async with TV(cfg) as c:
        res = await read_settings(c, args.category, args.keys)
    print(json.dumps(res, indent=2, sort_keys=True))


async def cmd_set(cfg, args):
    values = json.loads(args.json)
    async with TV(cfg) as c:
        await c.set_settings(args.category, values)
        await asyncio.sleep(1)
        res = await read_settings(c, args.category, list(values))
    for k, v in values.items():
        g = res.get(k)
        print(f"  {'✓' if g is not None and norm(g) == norm(v) else '✗'}  {k}: want {v}, got {g}")


# ---------------------------------------------------------------- doctor (local, read-only)
def sh(cmd, timeout=5):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def read(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def kernel_tuple():
    m = re.match(r"(\d+)\.(\d+)(?:\.(\d+))?", platform.release())
    return tuple(int(x or 0) for x in m.groups()) if m else (0, 0, 0)


class Report:
    def __init__(self):
        self.issues = 0

    def ok(self, msg):
        print(f"  ✓ {msg}")

    def warn(self, msg, fix=None):
        self.issues += 1
        print(f"  ✗ {msg}")
        if fix:
            for line in fix.splitlines():
                print(f"      {line}")

    def info(self, msg):
        print(f"  · {msg}")


def doctor_gpu(r):
    print("\nGPU / HDMI 2.1 link")
    kv = kernel_tuple()
    r.info(f"kernel {platform.release()}")
    amd = any(read(p) == "0x1002" for p in Path("/sys/class/drm").glob("card*/device/vendor"))
    if not amd:
        r.info("no AMD GPU found; HDMI 2.1 FRL notes below are AMD-specific")
        return
    mask_raw = read("/sys/module/amdgpu/parameters/dcfeaturemask")
    if mask_raw is None:
        r.warn("amdgpu module parameters not readable")
        return
    mask = int(mask_raw, 0)
    frl = bool(mask & 0x400)
    r.info(f"amdgpu dcfeaturemask = {mask_raw} (0x{mask:x}); FRL bit 0x400 is {'ON' if frl else 'off'}")
    fix_frl = ("Enable HDMI 2.1 FRL (Linux 7.2/7.3):\n"
               "  echo 'options amdgpu dcfeaturemask=0x402' | sudo tee /etc/modprobe.d/99-amdgpu-hdmi-frl.conf\n"
               "  sudo limine-mkinitcpio   # CachyOS with Limine; otherwise: sudo mkinitcpio -P\n"
               "  reboot, then run this again. Remove the file once you're on Linux 7.4+.")
    if kv < (7, 2):
        r.warn("this kernel has no AMD HDMI 2.1 FRL code: 4K is limited to 60 Hz RGB, or 120 Hz with 4:2:0 (blurry coloured text, grey blacks)",
               "Install a newer kernel (CachyOS: linux-cachyos is usually current; linux-cachyos-rc for release candidates).")
    elif frl:
        r.ok("HDMI 2.1 FRL enabled: 4K 120/144/165 Hz in full RGB 4:4:4 is possible")
        if kv < (7, 4):
            r.warn("before Linux 7.4, HDMI VRR/FreeSync over FRL is not merged/unreliable",
                   "Set Adaptive sync to Never for the TV (System Settings > Display), or move to Linux 7.4+.")
    else:
        if kv >= (7, 4):
            r.warn("Linux 7.4+ should enable FRL by default, but the bit is off (an old modprobe option may override it)",
                   "Check: grep -r dcfeaturemask /etc/modprobe.d /proc/cmdline")
        else:
            r.warn("FRL is off: above 4K60 the driver silently falls back to YCbCr 4:2:0", fix_frl)
    conf = sh(["grep", "-rl", "dcfeaturemask", "/etc/modprobe.d"]) + " " + ("cmdline" if "dcfeaturemask" in (read("/proc/cmdline") or "") else "")
    if conf.strip():
        r.info(f"dcfeaturemask set in: {conf.strip()}")

    for st in Path("/sys/class/drm").glob("card*-HDMI-A-*/status"):
        if read(st) == "connected":
            modes = (read(st.parent / "modes") or "").splitlines()
            r.info(f"{st.parent.name.split('-', 1)[1]} connected; TV's preferred mode {modes[0] if modes else '?'}")


def doctor_kde(r):
    print("\nKDE Plasma display (kscreen-doctor)")
    if not shutil.which("kscreen-doctor"):
        r.info("kscreen-doctor not found (not KDE Plasma?)")
        return
    raw = sh(["kscreen-doctor", "-j"])
    try:
        data = json.loads(raw)
    except ValueError:
        r.info("could not parse `kscreen-doctor -j`; plain output follows")
        print(re.sub(r"\x1b\[[0-9;]*m", "", sh(["kscreen-doctor", "-o"])))
        return
    outs = [o for o in data.get("outputs", []) if o.get("connected") and "HDMI" in str(o.get("name", ""))]
    if not outs:
        r.info("no connected HDMI output reported")
        return
    for o in outs:
        name = o.get("name")
        mode = next((m for m in o.get("modes", []) if str(m.get("id")) == str(o.get("currentModeId"))), {})
        size = mode.get("size", {})
        hz = float(mode.get("refreshRate") or 0)
        r.info(f"{name}: {size.get('width', '?')}x{size.get('height', '?')} @ {hz:.2f} Hz, scale {o.get('scale')}")
        if size.get("width") and int(size["width"]) < 3840:
            r.warn("not running at native 3840x2160")
        if hz and hz < 100:
            r.warn(f"{hz:.0f} Hz: pick 120/144/165 Hz in System Settings > Display (needs FRL on AMD)")
        extras = {k: v for k, v in o.items() if re.search(r"vrr|hdr|wcg|rgb|sdr|bpc|color|icc|overscan|brightness", k, re.I)
                  and not isinstance(v, (list, dict))}
        for k, v in sorted(extras.items()):
            r.info(f"  {k} = {v}")
        r.info(f"  change from a terminal, e.g.: kscreen-doctor output.{name}.mode.3840x2160@120 output.{name}.scale.1.5")


def doctor_fonts(r):
    print("\nText rendering (WOLED panels use RWBG subpixels, so RGB subpixel AA adds colour fringes)")
    rd = shutil.which("kreadconfig6") or shutil.which("kreadconfig5")
    if not rd:
        r.info("kreadconfig6 not found; skipping")
        return
    sub = sh([rd, "--file", "kdeglobals", "--group", "General", "--key", "XftSubPixel"]) or "(default)"
    hint = sh([rd, "--file", "kdeglobals", "--group", "General", "--key", "XftHintStyle"]) or "(default)"
    aa = sh([rd, "--file", "kdeglobals", "--group", "General", "--key", "XftAntialias"]) or "(default)"
    r.info(f"anti-aliasing={aa}, sub-pixel={sub}, hinting={hint}")
    if sub.lower() not in ("none",):
        r.warn("sub-pixel rendering is not 'None' (greyscale)",
               "System Settings > Text & Fonts > Anti-aliasing: Sub-pixel rendering = None, Hinting = Slight\n"
               f"  or: kwriteconfig6 --file kdeglobals --group General --key XftSubPixel none && "
               "kwriteconfig6 --file kdeglobals --group General --key XftHintStyle hintslight   (re-login)")
    else:
        r.ok("greyscale anti-aliasing")
    night = sh([rd, "--file", "kwinrc", "--group", "NightColor", "--key", "Active"])
    if night.lower() == "true":
        r.info("Night Light is enabled: turn it off while judging colour patterns")


def doctor_services(r, cfg):
    print("\nlgtv-pc automation")
    for unit, user in (("lgtv-pc-power.service", False), ("lgtv-pc-sleep.service", False), ("lgtv-pc-idle.service", True)):
        cmd = ["systemctl"] + (["--user"] if user else []) + ["is-enabled", unit]
        state = sh(cmd) or "not installed"
        (r.ok if state == "enabled" else r.info)(f"{unit}: {state}")
    if not shutil.which("swayidle"):
        r.info("swayidle not installed (needed for idle screen-off): sudo pacman -S swayidle")
    rd = shutil.which("kreadconfig6")
    if rd:
        dpms = sh([rd, "--file", "powerdevilrc", "--group", "AC", "--group", "Display", "--key", "TurnOffDisplayWhenIdle"])
        if dpms.lower() != "false":
            r.info("KDE also turns the display signal off when idle; the TV then shows 'no signal' and may power down. "
                   "Prefer lgtv-pc idle blanking: System Settings > Power Management > Turn off screen: Never (keep the lock screen).")


async def cmd_doctor(cfg, args):
    r = Report()
    doctor_gpu(r)
    doctor_kde(r)
    doctor_fonts(r)
    doctor_services(r, cfg)
    print("\nTV")
    if cfg["tv"].get("ip"):
        try:
            await cmd_status(cfg, args)
        except Exception as e:
            r.warn(f"TV at {cfg['tv']['ip']} not reachable: {e}")
    else:
        r.info(f"not configured: run `{APP} setup`")
    print(f"\n{r.issues} issue(s). Then confirm by eye with the Chroma 4:4:4, Black level and Gamma patterns.")


# ---------------------------------------------------------------- CLI
def main():
    p = argparse.ArgumentParser(prog=APP, description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", default=str(DEFAULT_CONFIG), help=f"config file (default {DEFAULT_CONFIG})")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("setup", help="pair with the TV and write the config")
    s.add_argument("--ip"); s.add_argument("--mac"); s.add_argument("--hdmi", type=int)
    sub.add_parser("pair", help="(re)pair with the configured TV")
    sub.add_parser("status", help="show TV model, power, input and key settings")
    for name in ("apply", "check"):
        s = sub.add_parser(name, help="apply / verify a picture profile (default from config)")
        s.add_argument("profile", nargs="?")
    s = sub.add_parser("on", help="wake the TV and switch to the PC input")
    s.add_argument("--boot", action="store_true"); s.add_argument("--resume", action="store_true")
    s.add_argument("--no-input", action="store_true")
    s = sub.add_parser("off", help="power the TV off (only if it shows the PC)")
    s.add_argument("--shutdown", action="store_true"); s.add_argument("--sleep", action="store_true")
    s.add_argument("--force", action="store_true")
    for name in ("screen-off", "screen-on"):
        s = sub.add_parser(name, help="turn the panel off/on (TV stays on, instant)")
        s.add_argument("--idle", action="store_true", help="idle mode: only act on the PC input / undo only our own blanking")
    sub.add_parser("idle", help="run swayidle: blank the TV when the session is idle (used by lgtv-pc-idle.service)")
    sub.add_parser("input", help="switch the TV to the PC input")
    sub.add_parser("vrr-info", help="show the TV's FreeSync/VRR info overlay")
    s = sub.add_parser("get", help="read raw settings, e.g. get picture colorTemperature gamma")
    s.add_argument("category"); s.add_argument("keys", nargs="+")
    s = sub.add_parser("set", help="write raw settings to the active mode, e.g. set picture '{\"colorTemperature\": \"50\"}'")
    s.add_argument("category"); s.add_argument("json")
    sub.add_parser("doctor", help="check kernel/amdgpu, KDE display + fonts, services and the TV")

    args = p.parse_args()
    cfg = load_config(args.config)
    handlers = {
        "setup": cmd_setup, "pair": cmd_pair, "status": cmd_status, "apply": cmd_apply, "check": cmd_check,
        "on": cmd_on, "off": cmd_off, "idle": cmd_idle, "input": cmd_input, "vrr-info": cmd_vrr_info,
        "get": cmd_get, "set": cmd_set, "doctor": cmd_doctor,
        "screen-off": lambda c, a: cmd_screen(c, a, False), "screen-on": lambda c, a: cmd_screen(c, a, True),
    }
    try:
        result = asyncio.run(handlers[args.cmd](cfg, args))
    except KeyboardInterrupt:
        sys.exit(130)
    # `check` returns the number of mismatches; everything else exits 0 unless it called sys.exit itself.
    sys.exit(1 if args.cmd == "check" and result else 0)


if __name__ == "__main__":
    main()
