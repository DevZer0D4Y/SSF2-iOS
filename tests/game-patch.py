import hashlib, importlib.util, pathlib, struct, zlib
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('patch_game', root/'scripts/patch-game.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
source=(root/'SSF2-iOS/Web/game/SSF2Portable.swf').read_bytes()
result=mod.patch(source)
original=zlib.decompress(source[8:]);body=zlib.decompress(result[8:])
assert source[:8]==result[:8]
changes=[i for i,(a,b) in enumerate(zip(original,body)) if a!=b]
assert changes==[original.index(mod.INITIALIZER)+7]
assert original[changes[0]]==0x26 and body[changes[0]]==0x27
assert len(body)+8==struct.unpack('<I',result[4:8])[0]
assert hashlib.sha256(result).hexdigest()=='7dc5b3e410bac5584a3b99e772ca19af1b06aa4f73d89916d5fa352760d5f474'
for invalid in [b'',result,source[:-1]]:
 try: mod.patch(invalid)
 except ValueError: pass
 else: raise AssertionError('Unverified inputs must be refused')
print('PASS: pinned input, exactly one equivalent-length boolean instruction changed, valid SWF length, deterministic output, invalid input rejected')
