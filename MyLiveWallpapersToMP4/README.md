# mlwtomp4.py

Extracts the MP4 video hidden inside `.mlw` files used by the **MyLiveWallpapers** app, so you can play or reuse the underlying video directly.

## What it does

`.mlw` files store the wallpaper video AES-256-GCM encrypted with a hardcoded key. This script:

1. Reads the `.mlw` file and locates the `Root\x00` marker.
2. Walks past the embedded filename to find the encrypted payload (12-byte IV + ciphertext + 16-byte GCM tag).
3. Decrypts it with the app's hardcoded key.
4. Writes the result out as a `.mp4` file next to the original.

## Requirements

- Python 3
- [`cryptography`](https://pypi.org/project/cryptography/) (`pip install cryptography`)
- `tkinter` (only needed for the file-picker fallback — usually bundled with Python, install your distro's `python3-tk` package if missing)

## Usage

By default the script scans a hardcoded folder for wallpapers to convert:

```bash
python3 mlwtomp4.py
```

- It looks in `DEFAULT_FOLDER` (currently `/home/harsitomiii/Pictures/Wallpapers/`, edit this constant in the script to point at your own wallpaper folder) for `.mlw` files.
- If that folder doesn't exist on the current machine (e.g. running on a different computer or OS), it asks whether you want to browse for the correct folder instead, via a native folder picker.
- Any `.mlw` file that doesn't already have a matching `.mp4` next to it gets converted automatically.
- If there's nothing to convert (or no folder was picked), it offers to open a file picker so you can select a single `.mlw` file manually.

Works on Windows, macOS, and Linux — paths are handled with `os.path`/`os.listdir`, and both the file and folder pickers use Tk's native dialogs.

Output is written alongside the input file, same name, `.mp4` extension.

## Notes / caveats

- The decryption key is hardcoded and specific to this app's format — it will not work on differently-encrypted `.mlw`-like files.
- No GCM tag verification is performed (the tag is stripped and ignored), so a corrupted/truncated file may still "succeed" but produce a broken video — check the output plays correctly.
- Intended for personal use on wallpapers you already own/downloaded, to get a plain video file out of the app's proprietary container.
