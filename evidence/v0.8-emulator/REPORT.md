# Android 35 emulator smoke test

2026-10-14, Asia/Singapore. Branch `murder/scan-bugfix`, fast-forwarded to `3347055`. Dependencies remain unchanged: React Native 0.76.7, APK version 0.7.0 / code 21.

## Build and checks

`cd mobile/android && sh ./gradlew assembleDebug assembleRelease` passed, including release vital lint. Both APKs verify with v2 development signatures. Repository-relative paths and sizes follow; SHA-256 values are in [apks.json](apks.json).

| APK | Path | Bytes | MiB |
| --- | --- | ---: | ---: |
| Debug | `mobile/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` | 52,425,795 | 50.00 |
| Release | `mobile/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk` | 32,230,785 | 30.74 |

`npx tsc --noEmit`, all 8 Jest suites / 39 tests, and all `tools/check-*.sh` passed: 51 core, 6 deletion, 11 import, 65 native and 97 scope checks ([checks.txt](checks.txt)).

## Fixes

- Moved the delay selector out from underneath the shutter; verified its complete touch area in portrait and landscape.
- Reused one RGB buffer per JPEG, removing 614,400 array allocations per 960 × 640 frame. Color math and originals remain unchanged; pixel/domain checks passed.
- Preserved JSON null in the bridge. Unfiltered photos show “已合成” instead of “LUT · null” ([album-list.xml](album-list.xml)).

## Exercised

Pixel 6 AVD `moment_s5_task_e_api35`: Google APIs / arm64 / API 35, 1080 × 2400, 420 dpi, headless SwiftShader, audio disabled. Used ADB screenshots, UIAutomator, taps, 150 ms presses and swipes.

- [Opened four scopes](scopes-multi-open.png), [dragged histogram](scopes-dragged.png), [closed waveform](scopes-one-closed.png), verified [continued updates](scopes-still-updating.png), and tested [four scopes with Astia in release](release-scopes-and-lut.png).
- Selected all eight Fuji-style presets; each changed the preview (`lut-*.png`, including [Acros](lut-acros.png)). Neither picker page offers deletion; all eight [runtime entries](lut-catalog-runtime.json) are built-in/read-only, and the imported-LUT directory remained empty.
- Saved five complete motion photos, including timed Astia capture; opened [album](album.png) and list, held to play, released to restore the still. AVC decoding and changing playback pixels verified playback; [metadata](captures.json) records completion.
- Exercised timer completion/cancellation, 2-second selection and auto/near/far AFS/MF state changes. Verified the [landscape delay picker](release-timer-landscape-picker.png). DEMO performs no lens operation.
- Cold-launched release with Metro stopped and repeated demo, LUT, four scopes, capture and album checks; reinstalled the final rebuild to verify corrected album labels.

## Performance and logs

Source samples from three-second buffers; emulator demo rates, not screen refresh or S5 measurements:

| Configuration | Scopes closed | Four scopes | Maximum gap, closed / four |
| --- | ---: | ---: | ---: |
| Debug, LUT off | 38 frames / ~12.7 fps | 38 frames / ~12.7 fps | 89 / 94 ms |
| Release with RGB buffer reuse, Astia | 32 frames / ~10.7 fps | 32 frames / ~10.7 fps | 114 / 102 ms |

Four scopes caused no observed cadence loss or visible collapse. Earlier debug Astia had 14 frames / 3 seconds; differing build modes/warm-up prevent isolating the buffer change's speedup.

No app crash, fatal AndroidRuntime exception or ReactNativeJS error occurred in final release flows. [Logcat](logcat-release.txt) contains JDWP/IME emulator noise and MPEG4Writer stop warnings during successful cleanup; all captures completed and played. Other errors came from system services.

## Environment and cleanup

Used JDK 17 and Android 35; installed dependency-required Build Tools 34 through SDK Manager with the existing proxy/accepted license after an interrupted download. Generated the missing local debug keystore. `local.properties` is gitignored; machine configuration was not committed. Debug Metro connectivity used `adb reverse` and `localhost:8081`.

Metro and emulator shutdown were verified. S5 USB, actual lens focus and hardware performance require a physical camera.
