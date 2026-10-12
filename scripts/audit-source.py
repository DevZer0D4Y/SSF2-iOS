#!/usr/bin/env python3
"""Fail on private development paths, credentials, or local files in public source."""
from pathlib import Path
import re, subprocess
ROOT = Path(__file__).resolve().parents[1]
IGNORED = {'build', 'dist', 'DerivedData', '.git', 'xcuserdata', '__pycache__'}
FORBIDDEN = {'.ipa', '.mobileprovision', '.provisionprofile', '.p12', '.pfx', '.pem', '.key', '.log', '.trace', '.xcuserstate'}
RULES = {
    'private filesystem path': re.compile(r'/(?:Users|home)/[A-Za-z0-9_.-]+/'),
    'local download address': re.compile(r'https?://(?:192\.168\.|10\.\d+\.|172\.(?:1[6-9]|2\d|3[01])\.)'),
    'GitHub credential': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'AWS access key': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
}

def main():
    try:
        files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
        paths = [ROOT / name for name in files if name]
        if not paths:
            raise ValueError('No tracked files')
    except (subprocess.CalledProcessError, ValueError):
        paths = list(ROOT.rglob('*'))
    findings = []
    for path in paths:
        relative = path.relative_to(ROOT)
        if not path.is_file() or any(part in IGNORED for part in relative.parts):
            continue
        if relative.parts[:3] in [('SSF2-iOS', 'Web', 'game'), ('SSF2-iOS', 'Web', 'ruffle')]:
            continue
        if path.suffix.lower() in FORBIDDEN or path.name == '.DS_Store' or path.name.startswith('.env'):
            findings.append((str(relative), 'local or signing file'))
            continue
        if path.suffix.lower() in {'.png', '.jpg', '.jpeg'}:
            continue
        text = path.read_text(errors='replace')
        for label, rule in RULES.items():
            if rule.search(text):
                findings.append((str(relative), label))
        if path.name == 'App.swift' and any(marker in text for marker in ['SSF2_TEST', 'startTestChannel', 'cmd.js', 'ssf2.log']):
            findings.append((str(relative), 'device diagnostic channel'))
    for file, issue in findings:
        print(f'FAIL: {file}: {issue}')
    if findings:
        raise SystemExit(1)
    print('PASS: source audit; no private paths, credentials, signing files, local artifacts, or device command channel')

if __name__ == '__main__':
    main()
