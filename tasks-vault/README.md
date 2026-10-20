# Tasks Vault

A personal Android fork of [Tasks.org](https://github.com/tasks/tasks), based on upstream version 15.13. This branch contains the installable APK and the corresponding GPL-3.0 source archive.

## Download

- [Tasks Vault APK](Tasks-Vault.apk)
- [Full source archive](Tasks-Vault-source.zip)

APK SHA-256: `d96d39dc462a93b511a2eebb5be9f1343c6a1efd03b88912d46c6a55887f4f5a`

The APK installs as `com.macdarenz.tasks.vault` and supports Android 8.0 (API 26) and newer. It is a custom sideload build, separate from the official Tasks.org app.

## Open the vault

1. Open Tasks Vault and go to the task list.
2. Tap the small blue checkmark in the top-left header five times quickly.
3. Set a six-digit PIN, then add account logins or API keys. Choose a service icon for each entry.

The vault locks when the app goes to the background and after five minutes. Entries are encrypted with the device’s Android Keystore key and stored in a no-backup file, separate from Tasks.org sync. Clipboard copies are marked sensitive and cleared after 30 seconds when the app has focus again.

The vault is device-only. If you forget the PIN or lose the device, the entries cannot be recovered. This is a personal fork, not an audited password-manager release; avoid using it as the only copy of recovery-critical credentials.

## Source and license

The source archive includes the full modified Tasks.org source tree and its `LICENSE` file. Upstream base revision: `4a5def5d51994758033bf79294ce268e59eee162`. The derivative is distributed under GPL-3.0, following Tasks.org’s license.
