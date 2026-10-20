# Tasks Vault — offline customization edition

A personal GPLv3 Android fork of [Tasks.org](https://github.com/tasks/tasks), version **15.13-offline.2** (151308). Requires Android 8.0 or later; package `com.macdarenz.tasks.vault`.

## Download

- **[Download APK](https://github.com/macdarenz-droid/Life-documentary/raw/refs/heads/tasks-vault-premium-offline/tasks-vault/Tasks-Vault.apk)**
- [Corresponding source ZIP](Tasks-Vault-source.zip)
- [Review and verification](REVIEW.md)
- [SHA-256 checksums](SHA256SUMS.txt)

Install over the earlier Tasks Vault build to retain local data. This sideload build uses the existing local test signing key.

## Local features

- All 41 preset colors, plus custom RGB sliders and six-digit hex colors for the app, lists, and tags.
- Searchable bundled list/tag icons with saved selections.
- Light, dark, black, system, wallpaper, and scheduled day/night themes.
- Android 12+ device color palettes; manual colors remain available on older Android versions.
- Twenty launcher icon colors, with reset to blue.
- Hidden device-only Vault for account logins and API keys, with service icons.

Pricing, upgrades, purchase restoration, sign-in, cloud migration, sharing, and desktop linking have no active UI. Local customization is available without a purchase. This APK has no Internet permission and disables automatic backup and device transfer. Tasks, lists, tags, and Vault entries stay on the device.

## Open the Vault

1. Go to the task list.
2. Tap the small checkmark logo in the top-left header five times quickly.
3. Set a six-digit PIN, then add credentials and choose their service icons.

The Vault uses Android Keystore encryption and separate no-backup storage. It locks on backgrounding, manual lock, and inactivity. Clipboard copies are marked sensitive and cleared after 30 seconds when the app next has focus. The PIN and entries have no cloud recovery.

## Scope and source

Server features are unavailable in an offline build. The Android Compose target also retains upstream porting gaps: notification delivery, widgets, manual backup/import, custom-filter editing, and calendar/location integrations. The delivered APK is `:composeApp`, not the separate legacy `:app` target.

The ZIP contains the complete modified source, GPLv3 `LICENSE`, build wrapper, tests, and `OFFLINE_FEATURES.md`. Upstream base revision: `4a5def5d51994758033bf79294ce268e59eee162`. Build with a full JDK 21 and Android SDK using `./gradlew :composeApp:assembleFdroidRelease`. JVM tests target Java 25. Private signing keys are excluded.

APK SHA-256: `2858ec32838721d095c64cca7fe608afe36cce7f79359cba2c506b8ccbb68978`
