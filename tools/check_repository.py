#!/usr/bin/env python3
"""Scan this public web Git index only; never traverse an operator/native checkout."""
from pathlib import Path, PurePosixPath
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

names = json.loads((ROOT / 'browser/WEB-FILES.json').read_text())
if (not isinstance(names, list) or any(not isinstance(n, str) for n in names)
        or len(names) != len(set(names))):
    raise SystemExit('Invalid public program allowlist.')
for name in names:
    p = PurePosixPath(name)
    if p.is_absolute() or str(p) != name or any(n in ('.', '..') or n.startswith('.') for n in p.parts):
        raise SystemExit('Unsafe public program path.')
root_files = {'README.md', 'LICENSE', 'NOTICE', 'AGENTS.md', 'HANDOFF.md', 'SECURITY.md',
              'CONTRIBUTING.md', 'SPLIT-ORIGIN.json', '.gitignore', 'tools/check_repository.py',
              '.github/workflows/checks.yml', '.github/PULL_REQUEST_TEMPLATE.md',
              '.github/ISSUE_TEMPLATE/improvement.yml'}
allowed = root_files | {'browser/' + name for name in names}
blocked_parts = {'standalone', 'ios', 'voice_runtime', '.runtime', 'runtime', 'node_modules',
                 '__pycache__', 'venv', '.venv', 'data', 'logs', 'backups', '.pea-build'}
patterns = {
    'provider-key': rb'(?:sk-or-v1-[A-Za-z0-9]{40,}|sk-proj-[A-Za-z0-9_-]{40,}|AIza[0-9A-Za-z_-]{35})',
    'github-token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[ \t]*\r?\n[A-Za-z0-9+/=\r\n]{32,}',
    'aws-key': rb'AKIA[0-9A-Z]{16}',
    'operator-path-or-host': rb'(?:/Users/[A-Za-z0-9_.-]+/|[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net|Library/Application' + rb' Support/)',
}
seen = set(); errors = []
for entry in filter(None, git('ls-files', '--stage', '-z').split(b'\0')):
    meta, raw = entry.split(b'\t', 1)
    mode, blob, stage = meta.split(); name = raw.decode()
    seen.add(name); path = PurePosixPath(name)
    if mode not in (b'100644', b'100755') or stage != b'0':
        errors.append((name, 'symlink, submodule or unresolved index entry')); continue
    if name not in allowed or set(path.parts) & blocked_parts:
        errors.append((name, 'not public web source')); continue
    data = git('show', ':' + name)
    if len(data) > 2_000_000:
        errors.append((name, 'oversized source')); continue
    for rule, pattern in patterns.items():
        if re.search(pattern, data): errors.append((name, rule))
for missing in sorted(allowed - seen): errors.append((missing, 'required public source not staged'))
for name in ('LICENSE', 'NOTICE'):
    if name in seen and 'browser/' + name in seen and git('show', ':' + name) != git('show', ':browser/' + name):
        errors.append((name, 'source/package legal copies differ'))
for name in ('README.md', 'AGENTS.md', 'HANDOFF.md', 'SECURITY.md', 'CONTRIBUTING.md'):
    text = (ROOT / name).read_text()
    if any(line != line.rstrip() for line in text.splitlines()): errors.append((name, 'trailing whitespace'))
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if '://' in target or target.startswith('#'): continue
        path = (ROOT / target.split('#')[0]).resolve()
        if not path.is_relative_to(ROOT) or not path.exists(): errors.append((name, 'missing/outside documentation target'))
if errors:
    for name, rule in errors: print(name + ': ' + rule)
    raise SystemExit(1)
print(f'Public boundary scan passed for {len(seen)} indexed files; no native/runtime traversal. Heuristic guard, not complete secret detection.')
