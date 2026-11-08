#!/usr/bin/env python3
"""Local-only PEA Web release builder and signed program-version manager.
No network, service control, user-data migration or automatic code execution.
"""
import argparse
from contextlib import contextmanager
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
import uuid
from build_identity import COMMIT, VERSION, build_identity, release_config

BROWSER = Path(__file__).resolve().parents[1]
MAX_ARCHIVE = 20_000_000
MAX_FILE = 2_000_000
MAX_TOTAL = 40_000_000


def digest(data):
    return hashlib.sha256(data).hexdigest()


def regular(path, maximum=MAX_FILE):
    path = Path(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > maximum:
        raise ValueError('Expected a bounded regular file; symlinks are refused.')
    return path.read_bytes()


def safe_path(name):
    if not isinstance(name, str):
        return False
    p = PurePosixPath(name)
    return (isinstance(name, str) and name.startswith('browser/') and len(name) <= 200
            and '\\' not in name and all(re.fullmatch(r'[A-Za-z0-9_.-]+', part)
            and part not in ('.', '..') and not part.startswith('.') for part in p.parts)
            and str(p) == name)


def source_files(source):
    names = json.loads(regular(Path(source) / 'WEB-FILES.json', 30000))
    if not isinstance(names, list) or not 1 <= len(names) <= 100 or any(not isinstance(n, str) for n in names) or len(set(names)) != len(names):
        raise ValueError('Invalid web source allowlist.')
    for name in names:
        if not safe_path('browser/' + name):
            raise ValueError('Invalid source path.')
        path = Path(source) / name
        if any(p.is_symlink() for p in [path, *path.parents]):
            raise ValueError('Source symlinks are refused.')
    return names


def build(source, output, development=False):
    source = Path(source).resolve()
    if (source / 'build-info.json').exists():
        raise ValueError('Remove the generated build stamp before packaging clean source.')
    config = release_config(source)
    identity = build_identity(source)
    if not identity['commit'] or identity['modified'] is not False:
        raise ValueError('Build from a clean committed source checkout, without a generated build stamp.')
    # Check the entire checkout as well as the shipped browser scope.
    if subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain', '--untracked-files=normal']).strip():
        raise ValueError('Refusing a modified checkout.')
    version, commit = config['version'], identity['commit']
    if development:
        if config['channel'] != 'development':
            raise ValueError('Development build needs the development channel.')
    else:
        if config['channel'] == 'development' or not config['repository']:
            raise ValueError('Configure the public upstream and release channel first.')
        tagged = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'v' + version + '^{commit}'], stderr=subprocess.DEVNULL).decode().strip()
        if tagged != commit:
            raise ValueError('Immutable version tag must resolve to the build commit.')
    changelog = regular(source / 'CHANGELOG.md').decode()
    if not re.search(r'^## \[' + re.escape(version) + r'\] - \d{4}-\d{2}-\d{2}\n\n\S', changelog, re.M):
        raise ValueError('A dated nonempty changelog section is required.')
    files = {}
    for name in source_files(source):
        files['browser/' + name] = regular(source / name)
    stamp = {**identity, 'modified': False, 'environment': 'development' if development else 'release'}
    files['browser/build-info.json'] = (json.dumps(stamp, sort_keys=True, indent=2) + '\n').encode()
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    stem = 'pea-web-' + version
    archive = output / (stem + '.tar.gz')
    manifest_path = output / (stem + '.manifest.json')
    if archive.exists() or manifest_path.exists():
        raise ValueError('Release artifacts already exist; versions are not overwritten.')
    with archive.open('xb') as handle:
        with gzip.GzipFile(filename='', mode='wb', fileobj=handle, mtime=0) as zipped, tarfile.open(fileobj=zipped, mode='w|') as tar:
            for name, data in sorted(files.items()):
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o644
                entry.mtime = 0
                tar.addfile(entry, io.BytesIO(data))
    archive_data = regular(archive, MAX_ARCHIVE)
    manifest = {'schema': 1, 'product': 'pea-web', 'version': version, 'commit': commit,
                'channel': config['channel'], 'dataSchema': 1,
                'archive': {'name': archive.name, 'size': len(archive_data), 'sha256': digest(archive_data)},
                'files': {name: {'size': len(data), 'sha256': digest(data)} for name, data in sorted(files.items())}}
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    return manifest_path


def verify_signature(manifest, signature, signers):
    data = regular(manifest)
    regular(signature, 20000)
    regular(signers, 20000)
    result = subprocess.run(['ssh-keygen', '-Y', 'verify', '-f', str(Path(signers).resolve()),
                             '-I', 'pea-release', '-n', 'pea-release', '-s', str(Path(signature).resolve())],
                            input=data, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
    if result.returncode:
        raise ValueError('Release signature did not match the independently trusted PEA signer.')
    value = json.loads(data)
    if not isinstance(value, dict):
        raise ValueError('Invalid manifest.')
    if (value.get('schema') != 1 or value.get('product') != 'pea-web' or value.get('dataSchema') != 1
            or not isinstance(value.get('version'), str) or not VERSION.fullmatch(value['version']) or not isinstance(value.get('commit'), str) or not COMMIT.fullmatch(value['commit'])
            or value.get('channel') not in ('stable', 'prerelease', 'development')):
        raise ValueError('Unsupported release identity or data schema.')
    files = value.get('files')
    if not isinstance(files, dict) or not 1 <= len(files) <= 101:
        raise ValueError('Invalid package file list.')
    archive = value.get('archive')
    if (not isinstance(archive, dict) or not isinstance(archive.get('name'), str)
            or not re.fullmatch(r'pea-web-[0-9A-Za-z.+-]+\.tar\.gz', archive['name'])
            or type(archive.get('size')) is not int or not 0 < archive['size'] <= MAX_ARCHIVE
            or not isinstance(archive.get('sha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', archive['sha256'])):
        raise ValueError('Invalid archive identity.')
    total = 0
    for name, row in files.items():
        if (not safe_path(name) or not isinstance(row, dict) or type(row.get('size')) is not int
                or not 0 <= row['size'] <= MAX_FILE or not isinstance(row.get('sha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', row['sha256'])):
            raise ValueError('Invalid package file/digest.')
        total += row['size']
    if total > MAX_TOTAL or not {'browser/build-info.json', 'browser/server/gateway.py', 'browser/release.json', 'browser/WEB-FILES.json'} <= set(files):
        raise ValueError('Incomplete or oversized package.')
    return value


@contextmanager
def locked(root):
    root = Path(root).expanduser()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.is_symlink() or root.stat().st_uid != os.getuid():
        raise ValueError('Install root must be owned by this user and not a symlink.')
    root = root.resolve()
    fd = os.open(root / '.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield root
    finally:
        os.close(fd)


def atomic_json(path, value):
    tmp = path.with_name('.write-' + uuid.uuid4().hex)
    with tmp.open('x') as stream:
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


def initialize(root, signers):
    data = regular(signers, 20000)
    if not data.strip() or b'PRIVATE KEY' in data:
        raise ValueError('Use the independently trusted public allowed_signers file only.')
    if (root / 'trusted_signers').exists():
        raise ValueError('Trust is already pinned; automatic signer replacement is refused.')
    if (root / 'releases').exists() or (root / 'releases').is_symlink():
        raise ValueError('Choose a new, empty managed install root.')
    (root / 'releases').mkdir(mode=0o700)
    (root / 'trusted_signers').write_bytes(data)


def stage(root, archive, manifest_path, signature):
    if (root / 'releases').is_symlink() or not (root / 'releases').is_dir():
        raise ValueError('Managed releases directory changed.')
    signers = root / 'trusted_signers'
    manifest = verify_signature(manifest_path, signature, signers)
    data = regular(archive, MAX_ARCHIVE)
    expected = manifest.get('archive', {})
    if expected.get('name') != Path(archive).name or expected.get('size') != len(data) or expected.get('sha256') != digest(data):
        raise ValueError('Archive digest or identity does not match the signed manifest.')
    release_id = 'v' + manifest['version'] + '-' + manifest['commit'][:12]
    destination = root / 'releases' / release_id
    if destination.exists():
        raise ValueError('This version is already staged; no overwrite.')
    pending = Path(tempfile.mkdtemp(prefix='.stage-', dir=root))
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as zipped:
            raw = zipped.read(MAX_TOTAL + 2_000_001)
        if len(raw) > MAX_TOTAL + 2_000_000:
            raise ValueError('Expanded archive exceeds the header/content limit.')
        seen = set()
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r|') as tar:
            for member in tar:
                if member.name not in manifest['files'] or member.name in seen or len(seen) >= 101:
                    raise ValueError('Archive contains extra, duplicate or missing entries.')
                seen.add(member.name)
                row = manifest['files'][member.name]
                if not member.isfile() or member.linkname or member.size != row['size'] or getattr(member, 'sparse', None):
                    raise ValueError('Links, devices, sparse files and unexpected sizes are refused.')
                stream = tar.extractfile(member)
                contents = stream.read(row['size'] + 1)
                if len(contents) != row['size'] or digest(contents) != row['sha256']:
                    raise ValueError('Package file digest mismatch.')
                target = pending / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as out:
                    out.write(contents)
                target.chmod(0o644)
        if seen != set(manifest['files']):
            raise ValueError('Package entries are missing.')
        identity = build_identity(pending / 'browser')
        if identity['commit'] != manifest['commit'] or identity['version'] != manifest['version'] or identity['modified']:
            raise ValueError('Package build identity differs from the signed manifest.')
        meta = pending / '.pea-release'
        meta.mkdir()
        (meta / 'manifest.json').write_bytes(regular(manifest_path))
        (meta / 'manifest.sig').write_bytes(regular(signature, 20000))
        os.replace(pending, destination)
        return release_id
    finally:
        if pending.exists():
            shutil.rmtree(pending)


def target(root, link):
    path = root / link
    if not path.is_symlink():
        if path.exists():
            raise ValueError('Managed pointer is not a symlink; refusing replacement.')
        return None
    value = os.readlink(path)
    if not re.fullmatch(r'releases/v[0-9A-Za-z.+-]+-[a-f0-9]{12}', value) or not (root / value).is_dir() or (root / value).is_symlink():
        raise ValueError('Invalid managed version pointer.')
    return value


def set_pointer(root, name, value):
    if value is None:
        (root / name).unlink(missing_ok=True)
        return
    tmp = root / ('.pointer-' + uuid.uuid4().hex)
    tmp.symlink_to(value)
    os.replace(tmp, root / name)


def recover(root):
    journal = root / 'pending.json'
    if not journal.exists():
        return
    value = json.loads(regular(journal, 10000))
    if not isinstance(value, dict) or set(value) != {'old', 'previous', 'new'} or not value['new']:
        raise ValueError('Invalid switch journal; inspect it locally.')
    for name in ('old', 'previous', 'new'):
        v = value.get(name)
        if v is not None and (not isinstance(v, str) or not re.fullmatch(r'releases/v[0-9A-Za-z.+-]+-[a-f0-9]{12}', v)):
            raise ValueError('Invalid switch journal; inspect it locally.')
    current = target(root, 'current')
    if current == value['new']:
        pass  # Atomic switch finished; the previous pointer was already written.
    elif current == value['old']:
        set_pointer(root, 'previous', value['previous'])
    else:
        raise ValueError('Current changed after interruption; inspect locally, no overwrite.')
    journal.unlink()


def verify_staged(root, release):
    if not isinstance(release, str) or not re.fullmatch(r'v[0-9A-Za-z.+-]+-[a-f0-9]{12}', release):
        raise ValueError('Choose a listed release identifier.')
    if (root / 'releases').is_symlink():
        raise ValueError('Managed releases directory changed.')
    path = root / 'releases' / release
    if path.is_symlink() or not path.is_dir():
        raise ValueError('Staged version is unavailable.')
    manifest = verify_signature(path / '.pea-release/manifest.json', path / '.pea-release/manifest.sig', root / 'trusted_signers')
    if release != 'v' + manifest['version'] + '-' + manifest['commit'][:12]:
        raise ValueError('Staged identity changed.')
    for name, row in manifest['files'].items():
        candidate = path / name
        if any(p.is_symlink() for p in [candidate, *candidate.parents]) or digest(regular(candidate)) != row['sha256']:
            raise ValueError('Staged program was modified; refusing activation/rollback.')
    return manifest


def activate(root, release):
    recover(root)
    verify_staged(root, release)
    old, previous = target(root, 'current'), target(root, 'previous')
    new = 'releases/' + release
    if old == new:
        raise ValueError('Already selected; nothing changed.')
    atomic_json(root / 'pending.json', {'old': old, 'previous': previous, 'new': new})
    set_pointer(root, 'previous', old)
    set_pointer(root, 'current', new)
    (root / 'pending.json').unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('identity'); p.add_argument('--source', type=Path, default=BROWSER); p.add_argument('--write', type=Path)
    p = sub.add_parser('build'); p.add_argument('--source', type=Path, default=BROWSER); p.add_argument('--output', type=Path, required=True); p.add_argument('--development', action='store_true')
    for command in ('init', 'stage', 'list', 'activate', 'rollback', 'recover'):
        p = sub.add_parser(command); p.add_argument('--root', type=Path, required=True)
        if command == 'init': p.add_argument('--allowed-signers', type=Path, required=True)
        if command == 'stage':
            for option in ('archive', 'manifest', 'signature'): p.add_argument('--' + option, type=Path, required=True)
        if command == 'activate': p.add_argument('--release', required=True)
        if command in ('activate', 'rollback'): p.add_argument('--confirm', action='store_true', help='Confirm code-pointer switch; stop the gateway and save active work first.')
    args = parser.parse_args()
    try:
        if args.command == 'identity':
            value = build_identity(args.source)
            if args.write:
                args.write.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
            else: print(json.dumps(value, sort_keys=True))
            return
        if args.command == 'build': print(build(args.source, args.output, args.development)); return
        with locked(args.root) as root:
            if args.command == 'init': initialize(root, args.allowed_signers)
            elif args.command == 'stage': print(stage(root, args.archive, args.manifest, args.signature))
            elif args.command == 'list':
                print(json.dumps({'current': target(root, 'current'), 'previous': target(root, 'previous'), 'pendingRecovery': (root / 'pending.json').exists(), 'versions': sorted(p.name for p in (root / 'releases').glob('v*') if p.is_dir() and not p.is_symlink())}, indent=2))
            elif args.command == 'recover': recover(root)
            else:
                if not args.confirm: raise ValueError('Review the version and save active work, then supply --confirm. No switch made.')
                if args.command == 'rollback':
                    recover(root)
                    previous = target(root, 'previous')
                    if not previous: raise ValueError('No previous verified program version is available.')
                    activate(root, Path(previous).name)
                else: activate(root, args.release)
                print('Program pointer selected. Start/restart the gateway deliberately and verify /api/build-info. No user data was changed.')
    except (ValueError, OSError, subprocess.SubprocessError, tarfile.TarError) as exc:
        parser.exit(1, f'PEA release operation refused: {exc}\n')


if __name__ == '__main__':
    main()
