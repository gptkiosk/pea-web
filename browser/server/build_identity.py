"""Public build identity only: never expose branch names, paths, environment or credentials."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

VERSION = re.compile(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\Z')
COMMIT = re.compile(r'[a-f0-9]{40}\Z')
REPO = re.compile(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}\Z')


def release_config(root):
    data = (Path(root) / 'release.json').read_bytes()
    if len(data) > 4096:
        raise ValueError('Invalid release configuration.')
    value = json.loads(data)
    if not isinstance(value, dict) or value.get('schema') != 1 or not isinstance(value.get('version'), str) or not VERSION.fullmatch(value['version']) or value.get('channel') not in ('development', 'prerelease', 'stable'):
        raise ValueError('Invalid release version/channel.')
    repo = value.get('repository')
    if repo is not None and (not isinstance(repo, str) or not REPO.fullmatch(repo) or '..' in repo):
        raise ValueError('Invalid public upstream.')
    for name in ('product', 'organization'):
        if not isinstance(value.get(name), str) or len(value[name]) > 80 or any(ord(c) < 32 for c in value[name]):
            raise ValueError('Invalid product identity.')
    return {name: value[name] for name in ('schema', 'version', 'channel', 'product', 'organization', 'repository')}


def build_identity(root):
    root = Path(root).resolve()
    config = release_config(root)
    result = {**config, 'commit': None, 'modified': None, 'environment': 'source'}
    stamp = root / 'build-info.json'
    if stamp.is_file() and not stamp.is_symlink():
        data = stamp.read_bytes()
        if len(data) > 4096:
            raise ValueError('Invalid build stamp.')
        value = json.loads(data)
        if not isinstance(value, dict) or value.get('version') != config['version'] or not isinstance(value.get('commit'), str) or not COMMIT.fullmatch(value['commit']) or type(value.get('modified')) is not bool or value.get('environment') not in ('development', 'release'):
            raise ValueError('Invalid build stamp.')
        modified = value['modified']
        manifest = root.parent / '.pea-release' / 'manifest.json'
        if manifest.exists():
            # This is a local integrity indicator, not signature verification. Activation
            # separately verifies the independently pinned release signature.
            try:
                raw = manifest.read_bytes()
                if manifest.is_symlink() or len(raw) > 100000:
                    raise ValueError('Invalid installed manifest.')
                files = json.loads(raw)['files']
                if not isinstance(files, dict) or not 1 <= len(files) <= 101:
                    raise ValueError('Invalid installed file list.')
                for name, row in files.items():
                    candidate = root.parent / name
                    if (not isinstance(name, str) or not name.startswith('browser/') or '..' in Path(name).parts
                            or any(p.is_symlink() for p in [candidate, *candidate.parents])
                            or not candidate.is_file() or candidate.stat().st_size > 2000000
                            or hashlib.sha256(candidate.read_bytes()).hexdigest() != row['sha256']):
                        modified = True
                        break
            except (OSError, ValueError, KeyError, TypeError):
                modified = True
        return {**result, 'commit': value['commit'], 'modified': modified, 'environment': value['environment']}
    try:
        commit = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], stderr=subprocess.DEVNULL, timeout=3).decode().strip()
        status = subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--untracked-files=normal', '--', '.'], stderr=subprocess.DEVNULL, timeout=3)
        if COMMIT.fullmatch(commit):
            result.update(commit=commit, modified=bool(status), environment='development')
    except (OSError, subprocess.SubprocessError):
        pass
    return result
