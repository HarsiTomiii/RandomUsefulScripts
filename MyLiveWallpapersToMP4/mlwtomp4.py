import os
import tkinter as tk
from tkinter import filedialog
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def extract_mlw(input_path):
    if not os.path.exists(input_path):
        print(f"file not found: {input_path}")
        return
    with open(input_path, 'rb') as f:
        mlw_data = f.read()
    root_idx = mlw_data.find(b'Root\x00')
    if root_idx == -1:
        print("root marker not found")
        return
    filename_start = root_idx + 5
    null_idx = mlw_data.find(b'\x00', filename_start)
    if null_idx == -1:
        print("end of the filename not found")
        return
    offset = null_idx + 13
    key = bytes.fromhex("d27e154628ae2ba6ab4b9775165ff737")
    iv = mlw_data[offset:offset+12]
    ct = mlw_data[offset+16:-16]
    print(f"payload offset: 0x{offset:X}")
    try:
        cipher = Cipher(algorithms.AES(key), modes.GCM(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        dec = decryptor.update(ct)
        output_path = os.path.splitext(input_path)[0] + ".mp4"
        with open(output_path, 'wb') as f:
            f.write(dec)
        print(f"video extracted to: {output_path}")
    except Exception as e:
        print(f"failed: {e}")

DEFAULT_FOLDER = "/home/harsitomiii/Pictures/Wallpapers/"


def browse_for_file():
    root = tk.Tk()
    root.withdraw()
    input_path = filedialog.askopenfilename(
        title="Select .mlw file",
        filetypes=[("MLW files", "*.mlw"), ("All files", "*.*")],
    )
    if input_path:
        extract_mlw(input_path)
    else:
        print("no file selected")


if __name__ == "__main__":
    mlw_files = [f for f in os.listdir(DEFAULT_FOLDER) if f.lower().endswith(".mlw")]
    pending = [
        f for f in mlw_files
        if not os.path.exists(os.path.join(DEFAULT_FOLDER, os.path.splitext(f)[0] + ".mp4"))
    ]

    if not mlw_files or not pending:
        print("all .mlw files in the folder are already converted")
        answer = input("browse for a file instead? [Y/n]: ").strip().lower()
        if answer in ("", "y", "yes"):
            browse_for_file()
    else:
        for f in pending:
            extract_mlw(os.path.join(DEFAULT_FOLDER, f))
