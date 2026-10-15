#!/usr/bin/env python3
"""Enable SSF2's existing sequential loader in the checksum-pinned portable movie."""
import hashlib
from pathlib import Path
import struct
import sys
import zlib

SOURCE_SHA256 = '0090ce15936bd138a9ccb40e26e08e28c80e1602db59282cd3404cb441907811'
# ResourceManager class initializer: debug(multimode), findproperty(multimode),
# pushtrue, setproperty(multimode), debug(optimizeMemory). Only pushtrue changes.
INITIALIZER = bytes.fromhex('ef011f0a475e16266116ef01200b4b')

def patch(source: bytes) -> bytes:
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError('Unexpected portable movie; refusing to patch an unverified build')
    if source[:3] != b'CWS':
        raise ValueError('Expected zlib-compressed SWF')
    body = bytearray(zlib.decompress(source[8:]))
    if len(body) + 8 != struct.unpack('<I', source[4:8])[0] or body.count(INITIALIZER) != 1:
        raise ValueError('Unexpected ResourceManager initializer')
    body[body.index(INITIALIZER) + 7] = 0x27  # AVM2 pushfalse; same instruction length/stack effect.
    return source[:8] + zlib.compress(body, 9)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: patch-game.py original.swf output.swf')
    result = patch(Path(sys.argv[1]).read_bytes())
    Path(sys.argv[2]).write_bytes(result)
    print('Enabled the game’s existing sequential resource loader; SHA256 ' + hashlib.sha256(result).hexdigest())
