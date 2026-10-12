#!/usr/bin/env python3
"""Check that an unsigned release IPA contains no local development artifacts."""
import plistlib, re, sys, zipfile
from pathlib import PurePosixPath

with zipfile.ZipFile(sys.argv[1]) as archive:
    names = archive.namelist()
    roots = sorted({name.split('/')[1] for name in names if name.startswith('Payload/') and len(name.split('/')) > 2 and name.split('/')[1].endswith('.app')})
    if len(roots) != 1:
        raise SystemExit('FAIL: expected exactly one app in Payload')
    root = 'Payload/' + roots[0] + '/'
    forbidden = {'.mobileprovision', '.provisionprofile', '.p12', '.pfx', '.pem', '.key', '.log', '.trace', '.map', '.xcuserstate'}
    for name in names:
        path = PurePosixPath(name)
        if path.name == '.DS_Store' or path.suffix.lower() in forbidden or any(part in {'_CodeSignature', 'xcuserdata', '.git', 'test'} for part in path.parts):
            raise SystemExit('FAIL: development or signing artifact: ' + name)
    info = plistlib.loads(archive.read(root + 'Info.plist'))
    binary = archive.read(root + info['CFBundleExecutable'])
    if re.search(rb'/(?:Users|home)/[^\x00\s]+/', binary):
        raise SystemExit('FAIL: executable contains local development paths')
    for marker in [b'SSF2_TEST', b'cmd.js', b'ssf2.log', b'startTestChannel']:
        if marker in binary:
            raise SystemExit('FAIL: executable contains device diagnostic channel')
    if archive.testzip() is not None:
        raise SystemExit('FAIL: archive integrity')
    print('PASS: unsigned IPA audit; version', info['CFBundleShortVersionString'], 'build', info['CFBundleVersion'])
