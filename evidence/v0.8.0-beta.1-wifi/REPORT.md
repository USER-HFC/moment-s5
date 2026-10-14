# v0.8.0-beta.1 experimental Wi-Fi verification

**实验性 · 未经真机验证。** This is an implementation and local mock verification report. No physical original DC-S5, firmware 2.9, Find X8, real SD card or radio link was available. USB remains the default and recommended connection. Nothing was pushed, tagged or released.

Implementation commits: `8c8dbcb` plus foreground guard `bf29264` on `feat/s5-wifi-beta`, based on accepted commit `32e7012`. Version name/code: **0.8.0-beta.1 / 22**, consistent in both Android build files, mobile package and lockfile. No dependency upgrades. The release draft is [v0.8.0-beta.1.md](../../.github/releases/v0.8.0-beta.1.md); its UI-polish line is deliberately left for the coordinator.

## Result

The Android app connected through the debug Wi-Fi flow to this repository's independently authored mock. It received complete UDP JPEGs, displayed live scopes, passed the native pre-capture gate, sent one shutter, selected the unique new original through DLNA, streamed and atomically published the JPEG, encoded a Motion Photo, played it in the album and exported it to the emulator's system album.

| Observation | Verified result |
| --- | --- |
| Mock shutter commands | **1**, no retry |
| New original download | **1** |
| Pre-shutter frames | **36** |
| Maximum frame gap | **160 ms**, below 500 ms |
| Capture window | **3,000,000 µs**, pre-only, no post frames |
| Original | **512 × 384**, 2,252 bytes; identical to mock SD fixture |
| AVC clip | **64 × 48**, 45 samples, **3.0 seconds** |
| Still marker | **2,933,333 µs**, inside the clip |
| Motion Photo | 8,083 bytes; primary JPEG and appended MP4 unchanged |
| System-album export | Identical to the app's Motion Photo |
| Provenance | `demo=false`, `transport=wifi`, `experimentalWifi=true`, `complete=true` |

Original and mock SD SHA-256: `fb283583284b84bf32dbcb320d81f3a9927c68bb1088f21957e85eee44adc409`.

Machine-readable evidence: [mock-summary.json](mock-summary.json), [media-verification.json](media-verification.json), [e2e-metadata.json](e2e-metadata.json). The small [media artifacts](media/) are generated grayscale fixtures under this repository's MIT license; they contain no camera photo or packet capture. Playback was observed on Android through the existing `react-native-video` path; the darker video frame in [07-album-playback.png](07-album-playback.png) differs from the captured still.

## Implementation boundaries

- `CameraTransport` keeps PTP handles and Wi-Fi resource identities out of the capture engine. `UsbS5Transport` wraps the existing `UsbS5` without changing its protocol implementation. The shared ring, LUT, encoder, Motion Photo and storage path is retained.
- Wi-Fi uses fresh camera-only HTTP sockets, serialized control, `getstate` keepalive, a separate UDP thread and a maximum three-frame queue. Only complete JPEG datagrams with validated SOI/SOF/SOS/EOI are accepted; partial packets and unknown application fragmentation are dropped.
- Legacy `req_acc` and device-name registration are implemented. Gen2 `req_acc_g` / `req_acc_e` only parse envelopes and report **“需要真机抓包确认”**; no G9II constants or response calculation are included.
- Focus capability probing is read-only. AF/MF buttons require declared support; exposure getters are probed and cached. Unsupported fields and unverified placeholder HUD readings are not presented as Wi-Fi measurements.
- Every Wi-Fi capture obtains a fresh complete, paginated DLNA baseline before the shutter. Post-shutter catalogs must agree on one new original `CAM_ORG` / `CAM_RAW_JPG` candidate; ambiguity fails rather than selecting an old or highest-numbered file. Downloads use a temporary file, length/JPEG checks, fsync and atomic rename. Shutter refusal or uncertain responses close the session and never retry the shutter.
- Normal Android Wi-Fi uses `WifiNetworkSpecifier` or an explicitly selected, already-connected Wi-Fi `Network`, its socket factory and `Network.bindSocket`. The process/default internet route is not rebound. Foreground pause cancels active camera I/O and releases its lease. Debug mock routing intentionally bypasses the Wi-Fi association/lease and uses the emulator's host route; it does **not** verify real Android/OEM routing.
- Cleartext is confined in code to the camera client and its same-host resources, with private IPv4 restrictions in production, blocked command-resource URLs and no redirects. General app cleartext remains disabled; Metro debug exceptions are limited to localhost/loopback/emulator host. Arbitrary host/port settings require a debug APK in both UI and native code.

The connection UI lives in `mobile/src/connection/`. CameraWorkspace edits are small capability/HUD/badge hooks; MotionAlbum has a provenance badge hook. The coordinator's parallel UI polish still needs merging and release-note finalization.

## Checks

All requested checks pass. Test logs are committed next to this report.

| Check | Result / evidence |
| --- | --- |
| TypeScript `npx tsc --noEmit` | Pass; [typescript.txt](typescript.txt) is empty on successful compilation |
| Jest | **9 suites / 47 tests**, [jest.txt](jest.txt) |
| Core / deletion / LUT import | **51 / 6 / 11**, [java-core.txt](java-core.txt) |
| Native compilation and regressions | **66**, [java-native.txt](java-native.txt); includes queued-disconnect/reconnect regression |
| Wi-Fi host fixtures | **76**, [java-wifi.txt](java-wifi.txt) |
| Scope math/cadence | **97**, [java-scopes.txt](java-scopes.txt) |
| Bundled LUTs | **1,258** plus **66** bitmap/JPEG/post-LUT scope checks, [luts.txt](luts.txt) |
| LUT generator reproducibility | Pass, [lut-generator.txt](lut-generator.txt) |
| Wi-Fi field toolkit unit tests | **41**, [python-wifi.txt](python-wifi.txt) |
| Android debug build and lint | Pass, [build-lint-final.txt](build-lint-final.txt) |
| Mock media/container/export validation | Pass, [media-verification.json](media-verification.json) |

Wi-Fi host tests cover XML/CSV and Gen2 envelope parsing, entity rejection, resource safety, encoded command URLs, CRLF header rejection before dispatch, JPEG validation, partial datagrams, bounded queues, catalog pagination, raw-pair originals, ambiguity, unsupported controls, no frames, cancellation, chunked downloads, atomic publication and concurrent/refused/timed-out once-only shutters. Fixtures and implementation are independently authored; no GPL or unlicensed code was copied.

The native compile emits four optional external-annotation warnings. Android lint retains existing warnings and has two documented, specific compatibility exceptions: the shared framework `HoldPhotoView` intentionally has no AppCompat dependency; the optional `react-native-video` notification service is unused because album playback is foreground-only with notification controls disabled. No notification permission request or background service flow was added.

## Reproduction

Environment used: JDK 17 at `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`; Android SDK at `/opt/homebrew/share/android-commandlinetools`; emulator **37.2.12**, API 35 Google APIs arm64 image. Separate AVD **moment_s5_wifi_api35**, serial **emulator-5580**; Metro **8088**; final mock HTTP **18080**, SSDP fixture **11988**, UDP **49152**. Another emulator was left untouched.

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools

# Create/use a separate AVD; never substitute another worker's serial.
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd \
  --name moment_s5_wifi_api35 \
  --package 'system-images;android-35;google_apis;arm64-v8a' --device pixel_6
"$ANDROID_HOME/emulator/emulator" -avd moment_s5_wifi_api35 -port 5580 \
  -no-window -no-snapshot -no-audio -gpu swiftshader_indirect

# Separate terminals in this worktree:
python3 -I tools/s5-wifi/mock_camera.py --http-port 18080 --ssdp-port 11988 \
  --advertise-host 10.0.2.2 --out s5-field-runs/wifi-beta-final
cd mobile && npx react-native start --port 8088 --no-interactive
```

Build/install the debug APK, set the debug server host to `127.0.0.1:8088` in React Native developer settings and target only this serial:

```sh
cd mobile/android
bash gradlew :app:assembleDebug :app:lintDebug --console=plain --max-workers=4
adb -s emulator-5580 install -r app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
adb -s emulator-5580 reverse tcp:8088 tcp:8088
adb -s emulator-5580 emu redir add udp:49152:49152
adb -s emulator-5580 emu sensor set acceleration 9.81:0:0
```

The UDP redirect is the working host-to-emulator approach: the mock remains bound to Mac loopback and publishes `10.0.2.2` DLNA URLs. Open 连接 → Wi-Fi（实验）→ 模拟相机调试, use `10.0.2.2:18080` and `49152`, connect, return to the finder, enable scopes and dynamic-photo mode, wait for readiness and tap the shutter **once**. Open the album and long-press to play; export to the system album. UIAutomator's idle wait can time out during continuous preview events; use screenshots or direct observed controls rather than stale XML. Normal sensor rotation worked; display-size overrides caused emulator rendering/input trouble and were reset.

Copy the app's `original.jpg`, `motion.mp4`, `MOMENT_MP.jpg`, `moment.json` plus the system-album export into a media directory. Stop the mock with Ctrl-C so it writes its SD fixtures and request count, then verify:

```sh
python3 -I tools/s5-wifi/check_mock_motion.py \
  --media evidence/v0.8.0-beta.1-wifi/media \
  --mock-run s5-field-runs/wifi-beta-final \
  --out evidence/v0.8.0-beta.1-wifi/media-verification.json
```

The verification does not take another photo. Do not rerun a shutter after a timeout until the saved mock/camera count has been reviewed.

## Evidence and remaining verification

- [01-connection-wifi.png](01-connection-wifi.png): production-style IP/manual mode and the experimental warning.
- [02-debug-endpoint-final.png](02-debug-endpoint-final.png): final emulator host/UDP settings.
- [03-connected-status.png](03-connected-status.png): connected/pre-cache status from the earlier read-only setup (port 18088, zero shutters).
- [05-live-scopes.png](05-live-scopes.png): actual mock live view and native histogram/waveform data.
- [06-album-still.png](06-album-still.png), [07-album-playback.png](07-album-playback.png), [08-system-album-export.png](08-system-album-export.png): still, playback and export.
- [09-album-experimental-label.png](09-album-experimental-label.png): provenance remains visible after disconnection.

Hardware verification remains the research document's P1/T1–T10 work: exact S5 2.9 auth and packet framing, real capability/getsetting schemas, AF/MF behavior, catalog hierarchy/dual cards/slow writes, SD-byte comparison, long exposures, network loss, Android consent/OEM routing/default-internet coexistence, sustained timing, range and power. No BLE wakeup, iOS Wi-Fi or real-camera reliability claim is included.

The local debug APK signature and hash are in [apk-signature.txt](apk-signature.txt) and [build-summary.json](build-summary.json). Its development key differs from v0.7.0: the original key is unavailable and the current `~/.android/debug.keystore` was created 2026-10-14. Export existing app photos to the system album before uninstalling the old app; uninstall removes its private photos and imported LUTs. Publishing remains a separate task.

Cleanup is recorded in [cleanup.json](cleanup.json): this worker's mock, Metro and emulator processes were stopped; the separate worker's emulator was not stopped.
