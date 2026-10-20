# Offline customization review

Artifact: **Tasks Vault 15.13-offline.1** (151307), package `com.macdarenz.tasks.vault`.

APK SHA-256: `5bc8c2d40c0e8786581413f74f550d0dc3eee5630b8bfc817d4afee442045c6f`.

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

Tested in airplane mode with Wi-Fi disabled on an Android 15/API 35 emulator using software CPU emulation. The final APK's hash was checked before installation.

- The earlier build's offline welcome, local account creation, and task/list creation worked without sign-in or payment prompts.
- The final APK installed successfully with `-r`, retained the local account/list, and cold-started without an app crash. Its signing certificate matches the previously delivered GitHub APK.
- The final list color picker displayed all 41 color swatches plus the custom-color target without locks or purchase banners.
- Invalid hex input disabled Save; `123ABC` produced preview `#123ABC` and RGB values 18/58/188. RGB slider editing and saving returned to list settings successfully.
- A selected `award_star` list icon saved and rendered in the navigation drawer without a subscription.

This is a targeted smoke check. It does not exercise every theme/color combination, every launcher alias, or injected Vault I/O failures. The automated persistence tests and independent source/artifact reviews cover the additional cases described above.

## Functional scope

Local customization includes the full preset palette, custom RGB/hex colors, list/tag icons, six theme modes, Android 12+ dynamic colors, and twenty launcher colors. Server features are unavailable offline. Notification delivery, widgets, manual backup/import, custom-filter editing, and calendar/location integrations remain upstream Android Compose porting gaps.
