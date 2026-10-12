#!/usr/bin/env python3
"""Restore checksum-pinned assets into ignored folders before building."""
from pathlib import Path
import hashlib, io, json, shutil, tarfile, urllib.request, zipfile
ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'SSF2-iOS' / 'Web'
MANIFEST = json.loads((ROOT / 'scripts' / 'assets-manifest.json').read_text())
GAME_COMMIT = 'b3115cd09c07fdce441d87e6d92e2f283f3432c4'
RUFFLE_URL = 'https://github.com/ruffle-rs/ruffle/releases/download/v0.6.0/ruffle-0.6.0-web-selfhosted.zip'
RUFFLE_SHA256 = 'e8acfacc37443303872379d0e215999af846854d1dd3fa8fac0a765445b43dbf'

def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()

def valid(name):
    path = WEB / name
    return path.is_file() and digest(path) == MANIFEST[name]

def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SSF2-iOS-assets'}), timeout=120)

def save(name, stream):
    target = WEB / name
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.download')
    try:
        with temporary.open('wb') as output:
            shutil.copyfileobj(stream, output, length=1024 * 1024)
        if digest(temporary) != MANIFEST[name]:
            raise RuntimeError('Checksum mismatch: ' + name)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)

def main():
    missing = {name for name in MANIFEST if not valid(name)}
    if not missing:
        print('All pinned game and runtime assets verified.')
        return
    wanted = {name for name in missing if name.startswith('game/')}
    if wanted:
        url = f'https://codeload.github.com/VocalNutria9174/SSF2_Portable_Web/tar.gz/{GAME_COMMIT}'
        print('Downloading pinned portable game assets…')
        with request(url) as response, tarfile.open(fileobj=response, mode='r|gz') as archive:
            for member in archive:
                # Match an explicit allowlist; never extract paths from the archive directly.
                parts = member.name.split('/', 1)
                name = 'game/' + parts[1] if len(parts) == 2 else ''
                if member.isfile() and name in wanted:
                    with archive.extractfile(member) as stream:
                        save(name, stream)
                    wanted.remove(name)
        if wanted:
            raise RuntimeError('Game archive is missing expected files: ' + ', '.join(sorted(wanted)))
    wanted = {name for name in missing if name.startswith('ruffle/')}
    if wanted:
        print('Downloading Ruffle 0.6.0…')
        with request(RUFFLE_URL) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != RUFFLE_SHA256:
            raise RuntimeError('Ruffle archive checksum mismatch')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for name in sorted(wanted):
                with archive.open(name.removeprefix('ruffle/')) as stream:
                    save(name, stream)
    print('Pinned assets restored and verified.')

if __name__ == '__main__':
    main()
