#!/usr/bin/env python3
"""Standalone web source/link/fixture check; no native checkout or services required."""
import ast
import json
from pathlib import Path
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from releases import source_files, regular

root = Path(__file__).resolve().parents[1]
names = source_files(root)
for name in names:
    path = root / name
    data = regular(path)
    if name.endswith('.py'):
        ast.parse(data.decode(), filename=name)
    if name.endswith('.md'):
        text = data.decode()
        if any(line != line.rstrip() for line in text.splitlines()):
            raise SystemExit('Trailing whitespace: ' + name)
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if '://' in target or target.startswith('#'):
                continue
            candidate = (path.parent / target.split('#')[0]).resolve()
            if not candidate.is_relative_to(root) or not candidate.exists():
                raise SystemExit('Missing/outside web documentation link: ' + name)
fixture = json.loads((root / 'tests/fixtures/PolicyFixtures.json').read_text())
if fixture.get('version') != 1 or not fixture.get('gateCases') or not fixture.get('workspaceCases'):
    raise SystemExit('Invalid independent web policy contract fixture.')
print(f'Checked {len(names)} allowlisted web files, Python syntax, links and policy fixture; no native dependencies.')
