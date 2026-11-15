# Signing and notarizing PEA for Mac (owner's steps)

`mac/build.sh` makes an **unsigned** development copy that only opens on the Mac that built it. To give the app to anyone else it must be signed with a Developer ID and notarized by Apple. These steps use the owner's Apple Developer account and certificate. They are never run by CI, by a script in this repository or by an assistant, and no certificate, password or profile belongs in Git.

Nothing below has been run yet. Treat the first pass as a rehearsal and correct this page from what actually happens.

## What you need

- Membership in the Apple Developer Program.
- A **Developer ID Application** certificate in your login Keychain (Xcode, Settings, Accounts, Manage Certificates).
- Notary credentials stored once on your Mac, so no password appears in a command:

```sh
xcrun notarytool store-credentials pea-notary --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID
```

It asks for an app-specific password made at account.apple.com and keeps it in your Keychain under the name `pea-notary`.

## Steps

Start from a clean checkout of the commit you mean to release, so the build stamp says `"modified": false`.

1. Build.

```sh
mac/build.sh
```

2. Sign with the hardened runtime. The app needs no entitlements: it only listens on and connects to this Mac.

```sh
codesign --force --options runtime --timestamp --sign "Developer ID Application: YOUR NAME (YOUR_TEAM_ID)" mac/build/PEA.app
```

3. Check the signature.

```sh
codesign --verify --strict --verbose=2 mac/build/PEA.app
```

4. Zip it for the notary service and submit. This waits for Apple's answer, usually a few minutes.

```sh
ditto -c -k --keepParent mac/build/PEA.app mac/build/PEA.zip
```

```sh
xcrun notarytool submit mac/build/PEA.zip --keychain-profile pea-notary --wait
```

If it is rejected, read the reasons with `xcrun notarytool log SUBMISSION_ID --keychain-profile pea-notary`.

5. Staple the ticket to the app, so it opens without a network check, and confirm macOS accepts it.

```sh
xcrun stapler staple mac/build/PEA.app
```

```sh
spctl --assess --type execute -vv mac/build/PEA.app
```

It should say `accepted` and `source=Notarized Developer ID`.

6. Make the disk image people download, then sign, notarize and staple the image too.

```sh
hdiutil create -volname PEA -srcfolder mac/build/PEA.app -ov -format UDZO mac/build/PEA.dmg
```

```sh
codesign --timestamp --sign "Developer ID Application: YOUR NAME (YOUR_TEAM_ID)" mac/build/PEA.dmg
```

```sh
xcrun notarytool submit mac/build/PEA.dmg --keychain-profile pea-notary --wait
```

```sh
xcrun stapler staple mac/build/PEA.dmg
```

7. Try it as a stranger would: copy the image to another Mac or another user account, open it, drag PEA to Applications, open it. There should be no warning beyond the usual "downloaded from the internet" question.

## Things to know before the first signed release

- **The token will be asked for again.** The Keychain ties an item to the app that made it. A token saved by an unsigned development copy may not be readable by the signed app; the app then makes a new token and you paste it into PEA once more. Nothing else is lost.
- **Start at Login** is reliable only for a signed copy in the Applications folder.
- **Intel Macs.** `mac/build.sh` builds for the Mac it runs on. A copy for both Apple silicon and Intel needs a universal build, which has not been tried here.
- **The app sandbox** is not turned on. It would need the network client and server entitlements and a check that the Keychain and login item still work.
- **Updates.** The app does not check for or install updates. A new version is a new download.
- **Forks** set their own identifier with `PEA_BUNDLE_ID` and sign with their own certificate. Never sign a fork's build as Bamcio.
- The signed disk image is separate from the signed web release package described in `browser/docs/RELEASES.md`, which uses its own signing key.
