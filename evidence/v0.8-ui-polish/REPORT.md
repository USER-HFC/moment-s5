# TASK I — UI polish

Baseline: `32e7012`, branch `murder/scan-bugfix`. The camera, LUT picker, scopes and album now share native controls and visual tokens; capture, media, USB and LUT processing remain on the existing native bridge. No npm dependencies were added. [Validation metadata](validation.json), [Jest log](jest.log) and [release log](build.log) are included.

## Before / after review

| Item | Result and implementation | Before | After |
| --- | --- | --- | --- |
| 1. Album hint overlaps save | Fixed. Hint and save/delete form one flowing column. Header and footer each cap at 35% of the canvas and scroll independently at larger fonts. | [Album viewer](../v0.8-emulator/album-list.png) | [Viewer](album-list.png), [360dp / 1.3](small-font13-album.png) |
| 2. Ambiguous icons | Fixed. Thirds grid, latest-photo thumbnail / photo stack, mountain, macro flower, AF brackets, live rings, film swatch, histogram, timer, mic/slash and distinct connected/disconnected/demo symbols. Import and save also have distinct glyphs. | [Toolbar](../v0.8-emulator/release-start.png) | [Camera](demo-portrait.png), [Album](album-list.png) |
| 3. HUD / scope / empty-state collisions | Fixed. HUD heights are measured; cards tile in the remaining area, drag stays within it, and HUD renders above cards. AF reticle and empty scope cards are hidden without a feed; selected scopes return with the feed. Empty-state content also uses the safe area. AFS and buffer seconds are separate badges. | [Four scopes](../v0.8-emulator/release-scopes-and-lut.png), [Empty](../v0.8-emulator/release-start.png) | [Four scopes + LUT](release-scopes-and-lut.png), [Clamped drag](scopes-drag-clamped.png), [Empty](release-start.png) |
| 4. Icon / touch / label system | Fixed. `CameraIcon` + semantic token table use 24dp, one 24×24 viewBox, 1.8dp round strokes; `CameraControl` provides 48×48dp targets, shared labels, native press feedback and accessibility names/states. | [Toolbar](../v0.8-emulator/release-start.png) | [Camera](demo-portrait.png), [360dp](small-font13-portrait.png) |
| 5. Tokens and active states | Fixed. `theme.ts` defines 4/8/12/16/24/32 spacing, radii, label/caption/body/title type and semantic colors. Active/selected controls use a green filled background and accent; inactive controls are neutral; delete uses red. Paper tonal buttons use the same colors. | [Mixed states](../v0.8-emulator/release-scopes-and-lut.png) | [Camera states](release-timer-fixed.png), [LUT selection](lut-selected.png) |
| 6. Gutters / safe area | Fixed. Shared 16dp screen/sheet/HUD gutters plus native safe-area insets. No additional top spacer. The emulator's 128px display-cutout inset is retained; `dumpsys window` reports the status bar hidden and the cutout present. | [Portrait band](../v0.8-emulator/release-start.png) | [Portrait](release-start.png), [Landscape](release-landscape.png) |
| 7. Control grouping / mode choice | Fixed. View tools and connection occupy the top/left rail; AF/near/far form a protected viewfinder cluster; timer/audio/shutter/aspect/album form the capture row. Photo/motion is a visible radio segment below the shutter. | [Mixed toolbar](../v0.8-emulator/release-start.png) | [Portrait](demo-portrait.png), [Landscape](release-landscape.png) |
| 8. Balanced capture row / timer wrap | Fixed. Two equal controls on each side of the shutter, album on the right, and duration in the timer's single label. Timer opens delay choices when enabled; while counting, tapping it cancels immediately. Changing delay cancels the pending countdown first. | [Wrapped timer](../v0.8-emulator/release-timer-fixed.png) | [2 seconds](release-timer-fixed.png), [Countdown](timer-countdown.png), [Small landscape](small-font13-landscape.png) |
| 9. Landscape waste | Fixed. Compact 64dp / 120dp rails sit against a preview frame fitted to the chosen aspect ratio. Remaining letterboxing is outside the rails; the same control groups are retained. | [Landscape](../v0.8-emulator/release-landscape.png) | [Landscape](release-landscape.png), [360dp / 1.3](small-font13-landscape.png) |
| 10. Scope size / chrome / vectorscope | Fixed. Default S cards, optional M, adaptive 2×2 or 4×1 tiling, translucent background, title/close chrome. One M card can expand into the free area. Source/rate appears once in the HUD; histogram clipping remains inside its chart. The vectorscope uses a centred, compact viewBox; paused status cannot collide with axis labels. | [Large scopes](../v0.8-emulator/release-scopes-and-lut.png) | [Compact cards](release-scopes-and-lut.png), [Medium vector](scopes-vector-medium.png) |
| 11. LUT picker | Fixed. Scrollable swatch rows; original color first; concise names; built-in/imported sections; selected check; header import/refresh icons. Pagination and eyebrow removed. Built-ins stay read-only. Color strips are explicitly illustrative. | [Page two](../v0.8-emulator/lut-page-two.png) | [List](lut-list.png), [Scrolled list](lut-page-two.png), [360dp / 1.3](small-font13-lut.png) |
| 12. Scopes sheet | Fixed. Chinese title “示波器”, shared `CameraSheet`, title left / completion right, scrollable content. | [Scopes picker](../v0.8-emulator/scopes-selected.png) | [Picker](scopes-selected.png) |
| 13. Album | Fixed. Chinese date with 24-hour time; shared back/list/save/delete icon controls; LIVE on viewer and thumbnails; full-canvas aspect fit; tap / idle hides overlays. Native playback, pinch, export and deletion callbacks remain. A native raw-text regression in the list is covered by a new test. | [Album](../v0.8-emulator/album-list.png) | [Viewer](album-list.png), [List](album-index.png), [Landscape](album-landscape.png) |

## Validation

- Jest: **46 tests, 8 suites passed**. Coverage includes capture/focus direction, monotonic countdown and cancellation, microphone permission/preference, LUT selection/read-only handling, feed-gated scopes, panel geometry and lifecycle, album playback/export/delete and native View text safety.
- `mobile/node_modules/.bin/tsc --noEmit`: passed.
- `tools/check-core.sh`: 51 core + 6 deletion + 11 LUT import checks passed.
- `tools/check-scopes.sh`: 97 checks passed.
- `tools/check-native-host.sh`: 65 checks passed (Android doubles).
- `git diff --check`: passed.
- Release: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools sh ./gradlew assembleRelease` in `mobile/android`: passed. Installed `app-arm64-v8a-release.apk`, package `cn.moment.lumix`.

## Emulator evidence

AVD `moment_s5_task_e_api35`, API 35, ARM64. The release bundle runs without Metro. Captures are direct, unedited `adb exec-out screencap -p` output; the synthetic watermark identifies DEMO media.

| Configuration | Checked screens |
| --- | --- |
| 1080×2400, 420dpi (~411dp), font 1.0 | Empty state, DEMO camera, 2-second motion capture/countdown, four scopes, scope picker, LUT list/selection/scroll, clamped drag, medium vector, album viewer/list/playback, portrait and landscape |
| 1080×2400, 420dpi, font 1.3 | [Large-font camera](large-font13-portrait.png) |
| `wm size 720x1440`, `wm density 320` (360dp), font 1.3 | [Camera](small-font13-portrait.png), [Scopes + LUT](small-font13-scopes-lut.png), [LUT scroll](small-font13-lut.png), [Album](small-font13-album.png), [List](small-font13-album-index.png), [Landscape](small-font13-landscape.png), [Timer](small-font13-timer.png) |
| 360dp, font 3.0, landscape | [Bounded album overlays](small-font30-album-landscape.png) |

The emulator exited once during the long run and was cold-started again with the software renderer; final captures were replaced after restarting. Font/density configuration changes restart Android's activity and end the native camera session; DEMO was re-entered after those changes. The existing physical-USB, lens-precision, native-gallery recognition and audio-synchronization limits in `DESIGN.md` still require hardware. Real unavailable battery readings use “—”; the DEMO sample values remain marked as synthetic.

Device overrides were restored and the task emulator was stopped after verification. No Metro server was started. Changes are committed locally on `murder/scan-bugfix`; nothing was pushed.
