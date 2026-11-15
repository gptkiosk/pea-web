#!/bin/sh
# Builds an UNSIGNED development copy of PEA.app into mac/build/.
#
# It is for trying the app on the Mac that built it. It is not signed or notarized, so another Mac
# will refuse to open it. Signing with a Developer ID and notarizing are the owner's steps and are
# described in mac/SIGNING.md; this script never signs anything.
#
#   mac/build.sh
#   PEA_BUNDLE_ID=org.example.pea mac/build.sh     # a fork sets its own identifier
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
app="$here/build/PEA.app"
bundle_id=${PEA_BUNDLE_ID:-com.bamcio.pea.mac}

swift build --package-path "$here" -c release --product PEAMac
binary="$(swift build --package-path "$here" -c release --show-bin-path)/PEAMac"

rm -rf "$here/build"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/browser"
cp "$binary" "$app/Contents/MacOS/PEA"

# The web files the gateway serves, the rules file, and a stamp saying which source this is.
python3 - "$repo" "$app" "$bundle_id" <<'PY'
import json, plistlib, re, shutil, subprocess, sys
from pathlib import Path

repo, app, bundle_id = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
source, target = repo / 'browser', app / 'Contents/Resources/browser'
contract = json.loads((source / 'server/contract.json').read_text())
names = ['index.html', 'release.json', 'server/contract.json', *contract['assets']]
for name in dict.fromkeys(names):
    file = source / name
    if file.is_symlink():
        raise SystemExit('Refusing to package a symbolic link: ' + name)
    if not file.is_file():
        continue  # a listed file that only exists in an installed package
    (target / name).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(file, target / name)

release = json.loads((source / 'release.json').read_text())
commit = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD']).decode().strip()
changed = subprocess.check_output(['git', '-C', str(repo), 'status', '--porcelain', '--', 'browser', 'mac']).strip()
stamp = {'version': release['version'], 'commit': commit, 'modified': bool(changed), 'environment': 'development'}
(target / 'build-info.json').write_text(json.dumps(stamp, sort_keys=True, indent=2) + '\n')

if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{2,100}', bundle_id):
    raise SystemExit('PEA_BUNDLE_ID is not a valid identifier.')
numbers = re.match(r'(\d+)\.(\d+)\.(\d+)(?:-[A-Za-z]+\.(\d+))?', release['version'])
info = {
    'CFBundleName': 'PEA',
    'CFBundleDisplayName': 'PEA',
    'CFBundleExecutable': 'PEA',
    'CFBundleIdentifier': bundle_id,
    'CFBundlePackageType': 'APPL',
    'CFBundleInfoDictionaryVersion': '6.0',
    'CFBundleShortVersionString': '.'.join(numbers.group(1, 2, 3)),
    'CFBundleVersion': numbers.group(4) or '1',
    'CFBundleIconFile': 'PEA',
    'LSMinimumSystemVersion': '13.0',
    'LSApplicationCategoryType': 'public.app-category.productivity',
    'NSHighResolutionCapable': True,
    'NSHumanReadableCopyright': 'Copyright 2026 ' + release.get('organization', '') + '. Apache License 2.0.',
    # The gateway talks plain HTTP to a model server on this Mac only.
    'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
}
with open(app / 'Contents/Info.plist', 'wb') as out:
    plistlib.dump(info, out)
for name in ('LICENSE', 'NOTICE'):
    shutil.copyfile(repo / name, app / 'Contents/Resources' / name)
print('Packaged', len(list(target.rglob('*.*'))), 'web files from', commit[:12], '(modified)' if changed else '')
PY

# The app icon, drawn from the pea icon with tools that come with macOS. Without them the app still
# works and shows the standard icon.
icons=$(mktemp -d)
if qlmanage -t -s 1024 -o "$icons" "$repo/browser/assets/pea-icon.svg" >/dev/null 2>&1 && [ -f "$icons/pea-icon.svg.png" ]; then
  mkdir "$icons/PEA.iconset"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$icons/pea-icon.svg.png" --out "$icons/PEA.iconset/icon_${size}x${size}.png" >/dev/null
    sips -z $((size * 2)) $((size * 2)) "$icons/pea-icon.svg.png" --out "$icons/PEA.iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$icons/PEA.iconset" -o "$app/Contents/Resources/PEA.icns" || echo "No app icon was made; the app will use the standard one."
else
  echo "No app icon was made; the app will use the standard one."
fi
rm -rf "$icons"

echo "Built $app (unsigned, for this Mac only)."
