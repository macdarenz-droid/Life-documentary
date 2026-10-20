# Offline customization review

Artifact: **Tasks Vault 15.13-offline.2** (151308), package `com.macdarenz.tasks.vault`.

APK SHA-256: `2858ec32838721d095c64cca7fe608afe36cce7f79359cba2c506b8ccbb68978`.

## Build and automated checks

- Release APK build and Android release vital lint passed.
- Eleven focused JVM tests passed: custom color parsing (5), local customization persistence/rendering and offline access boundaries (4), and tag settings behavior (2).
- The tests exercise malformed/alpha color rejection, RGB boundaries, Room-backed list/tag save and reload, icon/color rendering, suppressed sharing for cached remote metadata, and false server-subscription flags despite local customization access.
- This is a focused check, not the complete upstream test suite.

## Independent review

An independent reviewer checked the local feature access model, navigation, settings, theme fallback, cached remote-list behavior, and launcher component transitions. Reported findings were fixed and rechecked:

- Removed a cloud-promotion banner from local list settings.
- Routed cached remote-list settings through local editing and suppressed sharing.
- Preserved manual-color controls when a stored dynamic-color preference is unsupported by the Android version.
- Runtime testing caught dark system icons against the forced dark app theme. Added theme-aware status/navigation appearance and matching navigation backgrounds, with a priority override for the always-dark Vault. A second targeted review confirmed correct restoration, including scheduled theme changes, while preserving wallpaper and screenshot protection.

## Red-team review

A separate reviewer checked offline boundaries, Vault lifecycle/write handling, and the final packaged APK. Reported findings were fixed and rechecked:

- Disabled OS backup and device transfer, including explicit exclusions for all nine Android backup domains in both packaged extraction-rule sections.
- Added visible Vault storage errors, synchronous write exclusion, lifecycle generation guards, fail-closed throttle persistence, and unlock callback validation.

Final artifact checks confirmed:

- No `android.permission.INTERNET` permission.
- `allowBackup=false`, `fullBackupContent=false`, and the correct compiled extraction rules.
- Twenty launcher aliases, with only blue enabled by default and the target activity enabled.
- A valid APK v2 signature.

No concrete findings remain in the reviewed source and packaged-artifact scope. The Vault review does not constitute a full cryptographic or password-manager certification.

## Runtime coverage

Tested in airplane mode with Wi-Fi disabled on an Android 15/API 35 emulator using software CPU emulation. The core checks below used candidate version 151307, SHA-256 `5bc8c2d40c0e8786581413f74f550d0dc3eee5630b8bfc817d4afee442045c6f`. Version 151308 changes Android system-bar appearance and version metadata; it retains the same local customization and Vault data logic.

- The earlier build's offline welcome, local account creation, and task/list creation worked without sign-in or payment prompts.
- The candidate APK installed successfully with `-r`, retained the local account/list, and cold-started without an app crash. Its signing certificate matches the previously delivered GitHub APK.
- The saved QA task remained visible in My Tasks after the update. App Settings showed no upgrade, subscription, or account-add card.
- The list color picker displayed all 41 color swatches plus the custom-color target without locks or purchase banners.
- Invalid hex input disabled Save; `123ABC` produced preview `#123ABC` and RGB values 18/58/188. RGB slider editing and saving returned to list settings successfully.
- A selected `award_star` list icon saved and rendered in the navigation drawer without a subscription.
- Dark theme selection produced dark task-list surfaces, and the saved task remained visible.
- Five logo taps opened Vault setup. A synthetic six-digit PIN and fake entry were saved; manual lock returned the PIN screen, and correct-PIN unlock restored the entry. No real credentials were used.
- The app log showed no fatal exception or ANR during these checks.

Follow-up checks on the exact final version 151308 APK confirmed successful in-place installation, retained task data after an explicit force-stop/cold launch, and a PIN prompt when reopening the Vault. A fresh main-screen screenshot confirms readable status icons and a dark navigation background. Window appearance flags also use dark-theme icon styling on the Vault screen.

This is a targeted smoke check. It does not exercise every theme/color combination, every launcher alias, or injected Vault I/O failures. The automated persistence tests and independent source/artifact reviews cover the additional cases described above.

## Public download verification

Both public GitHub downloads returned HTTP 200 and matched the local release files:

- APK: 37,133,892 bytes; SHA-256 `2858ec32838721d095c64cca7fe608afe36cce7f79359cba2c506b8ccbb68978`.
- Source ZIP: 11,825,616 bytes; SHA-256 `31a32b9428215b85f361190c3197479cd506864e87d2b70da2f4315f58be679a`.

The source archive was CRC-checked and compared with the current modified source tree. It includes all 2,654 source entries, including the four upstream locale-directory symlinks, and excludes private signing material.

## Functional scope

Local customization includes the full preset palette, custom RGB/hex colors, list/tag icons, six theme modes, Android 12+ dynamic colors, and twenty launcher colors. Server features are unavailable offline. Notification delivery, widgets, manual backup/import, custom-filter editing, and calendar/location integrations remain upstream Android Compose porting gaps.
