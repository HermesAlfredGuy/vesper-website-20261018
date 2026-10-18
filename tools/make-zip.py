"""Builds the delivered source archive from the repository's tracked files.

Only tracked files are included, so node_modules, the local verification captures
(under refs/) and any credential or cache file can never end up in the archive.
"""
import subprocess
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'vesper-website-20261018-src.zip'
files = subprocess.run(['git', 'ls-files'], cwd=root, capture_output=True, text=True, check=True).stdout.split()
files = [f for f in files if (root / f).is_file()]

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in sorted(files):
        z.write(root / f, f'vesper-website-20261018/{f}')

print(f'{out.name}: {len(files)} files, {out.stat().st_size / 1024:.0f} KB')
