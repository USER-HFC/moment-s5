# HUD / scope-control follow-up — visual review build

2026-10-16 · `feat/s5-wifi-beta` · base `0ec28c9` · version remains `0.8.0-beta.2` / 23. This is an **unpublished review build**; no tag, release, existing `dist` APK, or dependencies were changed. No `AGENTS.md` was present in the checkout or its ancestors; `DESIGN.md` was read and updated.

## Cause and correction

`fcd229e` removed the prototype's hardcoded `CAM 82%`, `PHONE 96%`, and exposure badges during the HUD-safe layout work. Their replacements only retained source/LUT badges and the motion buffer. Existing USB exposure still reached `state.exposure`, but the workspace no longer rendered it; only the Wi-Fi-specific badge displayed exposure. The app also did not subscribe to the existing native exposure event, and native demo/disconnect state could retain the previous camera's exposure string.

`CameraHud` now renders four corners whether scopes are open or closed: source/connection, experiment/DEMO and LUT at upper left; phone and camera battery at upper right; aperture/shutter/ISO and useful unparsed exposure text at lower left; photo, countdown, processing or motion-buffer status at lower right. Disconnected and demo exposure are explicit placeholders. The native cache clears on disconnect and cannot return previous real-camera numbers in demo mode.

Both HUD rows are measured. Scopes and empty-state content reserve those heights plus the corner margins and an 8dp gap. Compact chart layouts retain room for distinct controls, and drag/enlarge stay inside the safe area. At physically insufficient space charts retain their selection without drawing controls outside the safe area. HUD text scales and wraps; no focus-button cluster was restored.

Scope controls use thin, consistent 1.4dp strokes: approximately 16dp paths in 20dp optical boxes, with a subtle dark keyline and separate 48×48dp hit targets. Every chart retains a move handle; tapping, focusing or activating it reveals resize and close for that selected chart. Only its move handle receives a small selected-state disc/accent. Plots have no window, card, titlebar or toolbar backgrounds. Chinese labels, selected state, activation and directional accessibility actions remain available. Actual emulator dragging caught a Pressable responder conflict; drag capture now lives on the parent View and has a regression test.

## Truthful sources and limits

| Reading | Source / refresh | Unavailable or stale behavior |
| --- | --- | --- |
| Phone battery | Android sticky `ACTION_BATTERY_CHANGED`; validated level/scale/presence, real charging status; cached state and broadcast events | Missing/invalid values are `—`; zero remains `0%`. Unsubscribe on pause/host destroy, resubscribe from the sticky value on resume, permanently close/remove the listener on bridge invalidation. Activity recreation during font-scale testing is covered. |
| Camera battery | Inspected `CameraTransport`, USB vendor-property reads/allowlist and Wi-Fi capability/settings/getstate handling: **neither implemented transport exposes a verified battery reading** | Native state explicitly returns null; HUD shows `相机 —` with an unavailable accessibility description. No guessed property IDs or camera percentages were added. |
| USB exposure | Existing `UsbS5.exposure()` display string, sampled at connection or explicit native refresh; source-read monotonic age is retained | Known ISO/AUTO, decimal f-number, reciprocal/seconds/BULB display forms are split conservatively. Aged samples (>10s) say “上次读数已过期”; unknown age says “最近读数”. **USB readings are snapshots, not continuously polled live readings.** |
| Wi-Fi exposure | Existing two-second keeper updates cached settings and their source-read timestamp | Partial values leave individual placeholders. Bare integer/fraction aperture encodings and unknown shutter strings remain visible verbatim; no conversion of encoded fractions into f-numbers or time units. Unsupported reads remain explicit. |
| DEMO / disconnected exposure | No camera readings | `f/—`, `快门 —`, `ISO —`, with “演示无读数” / “未连接”. No demo exposure numbers or camera percentages. |
| Capture / buffer | Native active/busy/ready state, current countdown and actual preview-buffer duration | Ordinary stills remain available without prebuffer; motion shows its three-second gate. Invalid/disconnected/busy buffer values use `—`. |

The foreground camera HUD refreshes **cached native state** once per second; it skips background/album reads, avoids overlapping requests and discards late results after cleanup. Preview/state reads issue no USB I/O. USB PTP shares a serialized channel with preview/shutter and has a 15-second transaction deadline, so adding blocking periodic USB parameter transactions would violate this task's capture constraint. A future continuously live USB exposure feed needs a verified nonblocking source; current snapshots remain useful and visibly aged. Wi-Fi uses its existing refresh path, without new camera requests for the HUD.

All emulator camera content is explicitly synthetic DEMO. Phone values 37%, 24% and 62% were injected into the **emulator's Android battery service** to verify the actual OS broadcast/cache path; they are not app constants or camera readings. [Initial state](android-battery-initial.txt), [foreground change](android-battery-updated.txt), [background/resume](android-battery-resumed.txt). Physical S5 / phone transport compatibility remains unverified.

## Validation

JDK 17: `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`; SDK: `/opt/homebrew/share/android-commandlinetools`. Existing Android/RN host-test jars were reused from `scan-bugfix/.tools`; no dependencies were installed or changed.

| Check | Result / evidence |
| --- | --- |
| `cd mobile && ./node_modules/.bin/tsc --noEmit` | Pass, exit 0; [log](tsc.log) |
| `cd mobile && npm test -- --runInBand` | **11 suites / 76 tests pass**; [log](jest.log) |
| `cd mobile && ./node_modules/.bin/eslint . -f json` | **0 errors**, 244 style warnings across the tree; [summary](eslint-summary.json), [details](eslint.json) |
| `bash tools/check-native-host.sh` with existing Android/RN jars | **152 checks pass**, Android doubles; [log](native-host.log) |
| `bash tools/check-scopes.sh` | **97 checks pass**; [log](native-scopes.log) |
| `bash tools/check-wifi.sh` | **80 checks pass**, self-authored fixtures; [log](native-wifi.log) |
| `bash tools/check-core.sh` | **51 core + 6 deletion + 11 LUT import checks pass**; [log](native-core.log) |
| `cd mobile/android && sh ./gradlew assembleRelease` | Pass, including release vital lint; [log](assemble-release.log) |
| `python3 evidence/ui-hud-followup/verify_media.py` | Still/LUT/export, motion container/export and real playback-pixel checks pass; see below |
| `git diff --check` | Pass |

New coverage includes complete/partial/AUTO/long/unavailable/raw/stale/demo/disconnected exposure rendering, real zero and invalid batteries, four-corner persistence after the last scope closes, measured safe bounds, selection, independent resize/close, captured drag/clamping, battery pause/resume/Activity recreation/invalidation/late-event cleanup, and nonoverlapping cached-state refresh/late-promise cleanup. Existing still, LUT, album, export, countdown, microphone, motion and scope-lifecycle checks continue to pass. [Machine-readable summary](validation.json).

## Inspected screenshots

Owned API 35 arm64 AVD `moment_s5_hud_e43_api35`, `emulator-5588`, 1080×2400 / 420dpi; 480dpi gives 360dp width. System font scale was 1.0 or 1.3, with actual accelerometer rotation. All PNGs are unedited `adb exec-out screencap -p` captures of the final installed release APK. [Dimensions / settings / SHA-256 manifest](screenshots.json), [small-screen settings](emulator-configuration.json).

| View | Scopes on | Scopes off |
| --- | --- | --- |
| Portrait | [Four charts + LUT](03-demo-scopes-portrait.png) | [DEMO](02-demo-no-scopes-portrait.png), [LUT](02a-lut-no-scopes-portrait.png) |
| Landscape | [Four charts](09-scopes-landscape.png) | [HUD only](10-no-scopes-landscape.png) |
| 360dp / font 1.3 portrait | [Four charts](11-scopes-360dp-font13-portrait.png) | [HUD only](12-no-scopes-360dp-font13-portrait.png) |
| 360dp / font 1.3 landscape | [Four charts](13-scopes-360dp-font13-landscape.png) | [HUD only](14-no-scopes-360dp-font13-landscape.png) |

Also inspected: [disconnected placeholders](01-disconnected-portrait.png), [enlarge one](04-histogram-enlarged.png), [drag to the boundary](05-histogram-drag-clamped.png), [shrink one](06-histogram-shrunk.png), [close one](07-histogram-closed.png), [broadcast update without stopping preview](08-battery-broadcast-updated.png), [fresh battery after background/resume](15-battery-resume.png), [motion-buffer HUD](17-motion-buffer-ready.png). HUD corners remain clear and controls do not overlap their safe zones; enlarged charts may intentionally overlap other plots.

## Still / album / export / motion regression

Final APK synthetic still `M1792083839758_8e199de5`: 2400×1600, Classic Chrome applied, original retained, no video or motion container. Decoded RGB mean change is approximately `[3.54, 8.77, 7.48]`; MediaStore export matches `rendered.jpg` exactly. [Still viewer](16-static-lut-album.png), [export confirmation](16a-static-export.png), [file/pixel check](still-lut-check.json), [saved media](still-lut-media/moment.json).

Synthetic motion `M1792083902635_7a66df61`: 32 pre-shutter frames, maximum gap 99ms, AVC 960×640 / 45 samples / 3.0s, still marker 2,933,333µs. Original camera bytes remain unchanged; the Motion Photo primary JPEG matches the LUT derivative, its embedded MP4 matches the separate video, and system export matches the Motion Photo. [LIVE viewer](18-motion-album.png), [static vs LIVE list](19-static-and-motion-list.png), [container/export check](motion-check.json), [saved media](motion-media/moment.json). Actual long-press playback changes 145,131 pixels inside the photo area between [frame A](20a-motion-playing.png) and [frame B](20b-motion-playing.png), excluding header/footer changes; [pixel check](playback-pixels.json). [MediaStore entries](mediastore-exports.txt) are JPEG / `DCIM/MomentS5/` / `is_pending=0`.

## Review APK and cleanup

`mobile/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk` — **32,309,557 bytes**, version `0.8.0-beta.2` / 23, non-debuggable. Pulled installed APK and build output have the same SHA-256:

```text
b70fc771f7c18099e89ccda0ec70f8c1315020a12fe6068195c7020217b4027f
```

[APK verification](apk-verification.json), [install log](install.log). No release/tag was created or published. Coordinator visual review is the next step.

The app was force-stopped, battery/display overrides reset and the owned emulator shut down; its process exited 0 and no owned QEMU process or `emulator-5588` remains. The AVD is retained offline. No Metro or mock server was started. [Cleanup](cleanup.json).
