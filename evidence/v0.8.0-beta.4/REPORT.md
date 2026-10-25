# v0.8.0-beta.4 模拟器冒烟记录

2026-10-25，分支 `release/0.8.0-beta.4`，worktree `/Users/murder/Projects/moment-s5/.claude/worktrees/release`。没有实体相机。下面只记录本次实际执行过的步骤。

## 安装的包

`mobile/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`，冒烟时由当时的 `assembleRelease` 生成。

- `aapt dump badging`：`cn.moment.lumix`，versionName `0.8.0-beta.4`，versionCode `25`，`sdkVersion 33`，`native-code arm64-v8a`。
- 大小 32,386,018 字节；SHA-256 `895b56b95192ece91edaabc4e5950adc10ff218531841ffdbed4ad5ae4c67766`。
- `adb install -r` 成功；`dumpsys package` 显示 `versionName=0.8.0-beta.4`、`versionCode=25`、`primaryCpuAbi=arm64-v8a`，`pkgFlags` 没有 `DEBUGGABLE`。
- 冒烟结束后只改了 README、证据和发布说明，又执行了一次 `assembleRelease`；代码相同，但 `MOMENT_BUILT_AT` 变了，最终包的 SHA-256 为 `8e30c63894282b1201eac06ac39041466af0b739ef80ad82647da767fcb713a9`。上面的安装和截图使用的是 `895b…` 那个包。

## 模拟器

冷启动 AVD `moment_s5_wifi_api35`，控制台端口 5580，设备 `emulator-5580`，参数 `-no-window -no-audio -gpu swiftshader_indirect -no-snapshot`。API 35 / arm64，1080×2400 / 420dpi。

- 竖屏和横屏截图分别是 1080×2400、2400×1080。横屏由 `adb emu sensor set acceleration 9.81:0:0` 加 `wm user-rotation lock 1` 得到，之后用 `lock 0` 回到竖屏。
- 所有 PNG 都是未经编辑的 `adb exec-out screencap -p`。
- 截图里只有模拟器时间、电量、演示画面和 App 自己的文字，没有账号、姓名或联系方式。
- 冒烟结束后 `adb -s emulator-5580 emu kill` 关闭模拟器。

## 截图

| 文件 | 画面 |
| --- | --- |
| [01-camera-portrait.png](01-camera-portrait.png) | 启动后的拍摄页，竖屏，相机未连接；工具栏有网格、LUT、示波器、设置和连接 |
| [02-camera-demo-portrait.png](02-camera-demo-portrait.png) | DEMO 已连接、Classic Chrome 已套用，竖屏拍摄页 |
| [03-demo-photo-saved.png](03-demo-photo-saved.png) | 照片模式按快门后的「照片已保存」 |
| [04-demo-motion-ready.png](04-demo-motion-ready.png) | 切到动态，缓存 3.0 / 3s 就绪 |
| [05-demo-motion-saved.png](05-demo-motion-saved.png) | 动态快门后的「实况已保存」 |
| [06-lut-panel.png](06-lut-panel.png) | 左侧 LUT 面板展开，内置 8 个预设和「原色」 |
| [07-lut-classic-chrome-live.png](07-lut-classic-chrome-live.png) | 选中 Classic Chrome，取景和 HUD 立即变为该 LUT，提示「LUT 已启用」 |
| [08-scopes-sheet.png](08-scopes-sheet.png) | 示波器选择面板，四个开关 |
| [09-scopes-all.png](09-scopes-all.png) | 四张透明示波器同时打开：RGB 直方图、亮度波形、RGB 分列、矢量示波器 |
| [10-scopes-autohide.png](10-scopes-autohide.png) | 等待 5.5 秒后操作图标自动隐藏，图表仍实时刷新 |
| [11-scopes-longpress-reveal.png](11-scopes-longpress-reveal.png) | 按住波形图 3.6 秒后操作图标恢复（移动、放大/缩小、关闭） |
| [12-scopes-enlarged.png](12-scopes-enlarged.png) | 直方图放大到 M 尺寸，操作图标保持可见 |
| [13-album-grid.png](13-album-grid.png) | 相册网格：今天分组、LIVE、演示标记，本次拍摄的 3 项 |
| [14-album-viewer.png](14-album-viewer.png) | 沉浸查看器：渐变上下栏、拍摄时间标题、`1 / 3`、LIVE |
| [15-album-info.png](15-album-info.png) | 信息面板：无 EXIF 提示、文件 / 处理 / 存储分组、复制路径 |
| [16-album-lut-filmstrip.png](16-album-lut-filmstrip.png) | LUT 胶片条：原片缩略图、当前标记、取消 / 保存，动态照片重新封装提示 |
| [17-settings-list.png](17-settings-list.png) | 拍摄页进入的设置页 |
| [18-about-version.png](18-about-version.png) | 关于页，版本 `0.8.0-beta.4（25）`，以及版本名 / 版本号 / 构建时间 / 提交 / 构建类型 / ABI / 最低 Android 版本 |
| [19-camera-landscape.png](19-camera-landscape.png) | 横屏拍摄页，工具栏在左侧，曝光 HUD 和相册 / 快门在右侧 |
| [20-connection-usb.png](20-connection-usb.png) | 连接面板默认 USB，DEMO 仍连接 |
| [21-connection-wifi.png](21-connection-wifi.png) | 切到「Wi-Fi（实验）」，显示「实验性 · 未经真机验证」、手动连接开关和相机 IP |
| [22-connection-wifi-ip-typing.png](22-connection-wifi-ip-typing.png) | 清空 IP 后逐字输入 `192.168.54.1`，键盘仍在，完整地址进入输入框 |
| [23-connection-wifi-ip.png](23-connection-wifi-ip.png) | 收起键盘后的同一面板，IP 仍是完整的 `192.168.54.1` |

## 操作过程

1. 安装后用 `am start -n cn.moment.lumix/com.moments5rn.MainActivity` 启动，等 4 秒截 01。
2. 点「体验演示」，等取景出现后截 02；照片模式点快门，出现「照片已保存」截 03。
3. 点「动态」，等 HUD 显示「动态 · 缓存就绪 / 缓存 3.0 / 3s」截 04；点快门，出现「实况已保存」截 05。
4. 点工具栏「LUT」截 06；点 Classic Chrome 截 07。
5. 点「示波器」，依次打开四张图表后点「完成」截 09；等待 5.5 秒截 10；按住波形图 3.6 秒截 11；随后在同一手势序列里点放大图标截 12。
6. 点「相册」截 13；点第一张照片进查看器截 14；点「信息」截 15；关闭信息后点「LUT」截 16。
7. 从相册和查看器返回拍摄页，点「设置」截 17；点「关于」截 18。
8. 横屏后截 19，再转回竖屏。
9. 点右上角「演示」（连接入口）打开连接面板截 20；切到「Wi-Fi（实验）」截 21；点相机 IP 输入框，移动到末尾后按 20 次删除，再用 `adb shell input text '192.168.54.1'` 输入，截 22；按一次返回收起键盘后截 23。

## 集成时发现并修复的问题

`feat/settings-exposure` 的 `mobile/__tests__/CameraHud.test.tsx` 还引用 `hudSafeBounds`。这个辅助函数和对应断言在 `feat/scopes-controls` 里已经随「图表可以覆盖整个取景区」一起删除。直接保留 settings 分支的 import 会让 `tsc` 报 TS2305；直接保留旧断言也会和现在的布局规则相反。解决方式是保留示波器分支的现行行为和 `ScopesUI.test.tsx` 里的全取景区覆盖测试，只从 HUD 测试里去掉这个过时 import 和断言，保留 settings 分支新增的 `EXPOSURE_STALE_MS` 边界用例。

除这个测试集成问题外，本次 UI 冒烟没有发现两个分支互相影响导致的运行时问题。

## 没有验证的部分

- 没有实体 S5 或 Find X8：USB 会话、机身快门照片同步、Wi-Fi 真实握手 / 取景、曝光刷新、近 / 远对焦方向都没有在真机上验证。
- 模拟器没有 USB 相机，因此对焦工具栏和近 / 远对焦面板没有出现，也没有为它们补截图或注入状态。
- Wi-Fi 面板只验证了 IP 输入，没有点「连接 Wi-Fi（实验）」，也没有启动 mock 相机。
- 动态照片只验证了 DEMO 的保存和 App 内查看器，没有验证系统相册对 Motion Photo 的识别。
