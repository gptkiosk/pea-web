#!/usr/bin/env python3
"""Explicit local PEA setup and foreground startup; no downloads or service changes."""
import argparse
import os
from pathlib import Path
import secrets
import stat
import sys

from gateway import Gateway, read_token


def token_path(directory):
    return Path(directory).expanduser() / 'connection-token'


def setup(directory):
    folder = Path(directory).expanduser()
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = folder.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise ValueError('Configuration directory must be owned by you, not a symlink, and not writable by others.')
    # Exclusive creation prevents replacing an existing token, including a symlink.
    fd = os.open(folder / 'connection-token', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(secrets.token_urlsafe(32) + '\n')


def check(directory):
    read_token(token_path(directory))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('setup', 'check', 'start'))
    parser.add_argument('--config-dir', default=str(Path.home() / '.config' / 'pea'), help='Private configuration directory; defaults to ~/.config/pea.')
    parser.add_argument('--port', type=int, default=18770)
    parser.add_argument('--upstream', default='http://127.0.0.1:11434', help='Optional loopback OpenAI-compatible local model server.')
    parser.add_argument('--public-origin', help='Exact HTTPS origin of your own reverse proxy, if configured.')
    args = parser.parse_args(argv)
    try:
        if args.command == 'setup':
            setup(args.config_dir)
            print('Created a private connection token. It is not displayed. Run check, then start.')
            return 0
        check(args.config_dir)
        if args.command == 'check':
            print('Private connection token is ready. No network or model availability check was performed.')
            return 0
        if not 1 <= args.port <= 65535:
            raise ValueError('Choose a port from 1 to 65535.')
        server = Gateway(('127.0.0.1', args.port), token=read_token(token_path(args.config_dir)), upstream=args.upstream, public_origin=args.public_origin)
        print(f'PEA Web: http://127.0.0.1:{args.port}/browser/ · foreground process; press Ctrl-C to stop', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return 0
    except FileExistsError:
        print('Token already exists. It was not changed; run check or choose another configuration directory.', file=sys.stderr)
    except FileNotFoundError:
        print('No connection token found. Run setup first.', file=sys.stderr)
    except (ValueError, OSError) as error:
        print(f'PEA local setup: {error}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
