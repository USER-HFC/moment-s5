# v0.8.0-beta.1 合并版发布验证

2026-10-15。代码提交 `298c57b4af660deca61f8776dd77602e26802652` 合并 Wi-Fi `4f77ae4` 与 UI polish `fcd229e`；后续发布提交只补本目录证据。未新增或升级依赖。**实验 Wi-Fi 未经实体 S5 / Find X8 验证，USB 仍为默认和推荐方式。**

## 变更与检查

保留新的工具栏、焦点组、照片 / 动态选择、HUD 安全区、LUT 色条与相册布局；连接改用同一 CameraSheet / CameraIcon / theme，明确展示 USB、Wi-Fi（实验）、演示和连接状态。保留 Wi-Fi 能力隐藏与相册实验来源标记。直方图百分比改用两行 12sp 原生文字，避免随 SVG 缩成重叠小字。显式断开现在发送状态事件，界面及时回到“未连接”。

| 检查 | 结果 |
| --- | --- |
| `cd mobile && ./node_modules/.bin/tsc --noEmit` | 通过 |
| `cd mobile && npm test -- --runInBand` | 9 suites / 56 tests 通过 |
| `cd mobile && npm run lint` | 0 errors / 166 warnings（主要为既有简写格式规则；见 [汇总](eslint-summary.json)） |
| `bash tools/check-core.sh` | 51 core + 6 deletion + 11 LUT import |
| `bash tools/check-native-host.sh` | 66（Android doubles，无实体相机） |
| `bash tools/check-scopes.sh` / `bash tools/check-wifi.sh` | 97 / 76 |
| `python3 -I -m unittest discover tools/s5-wifi` | 41 tests |
| `python3 -I tools/check_bundled_luts.py` | 1258 LUT + 66 bitmap / JPEG / LUT 后示波器 |
| `python3 -I tools/generate_fuji_style_luts.py --check` | 8 个 LUT 可重现 |
| `cd mobile/android && sh ./gradlew assembleRelease` | 通过（JDK 17 / SDK 35；[日志](build.log)） |
| `git diff --check` | 通过 |

环境：`JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`，`ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`。主机 native 检查使用既有 Android / RN jars。计数见 [validation.json](validation.json)，原始测试输出保留在同目录日志中。

## Release APK 模拟器闭环

独立 AVD `moment_s5_wifi_api35` / `emulator-5580`，API 35 arm64，1080×2400 / 420dpi，字体 1.0。安装最终 release APK，`pkgFlags` 不含 DEBUGGABLE，无 Metro；手动 Wi-Fi 路径在附近设备权限未授予时正常使用所选 Wi-Fi Network。截图为未经编辑的 `adb exec-out screencap -p` 输出。

| 流程 | 证据与结果 |
| --- | --- |
| 空状态 / 连接方式 | [空状态](01-release-start.png)、[三种方式](02-connection-choices.png) |
| DEMO：四示波器 + Classic Chrome | [LUT 列表](03-demo-lut-picker.png)、[取景与可读百分比](04-demo-scopes-lut.png) |
| DEMO：拍摄 + 相册长按播放 | [相册](05-demo-album.png)、[播放](06-demo-playback.png)；[metadata](demo-moment.json)：31 帧，最大间隔 107ms，3s pre-only，LUT 已应用，`demo:true` |
| Wi-Fi：手动 IP / 状态 / 取景 | [release 设置与断开状态](07-wifi-release-settings.png)、[连接且缓存就绪](08-wifi-connected.png)、[四示波器](09-wifi-live-scopes.png) |
| Wi-Fi：单次快门 + 相册长按播放 | [原片与实验来源标记](10-wifi-album.png)、[播放](11-wifi-playback.png)；灰阶由自写 mock 有意生成，播放帧灰度随时间变化 |

最终 mock run：`release-beta1-final`。服务器记录 **1 次且仅 1 次** `camcmd capture`，38 个快门前帧，最长间隔 145ms，无快门后补帧；唯一新原片 `fixture-0001.JPG` 为 512×384，SHA-256 `fb283583284b84bf32dbcb320d81f3a9927c68bb1088f21957e85eee44adc409`。AVC `avc1` 为 64×48 / 45 samples / 3.0s，静态标记 2,933,333µs；Motion Photo 8,390 字节。原 JPEG、嵌入 MP4 和系统相册导出逐字节一致，见 [机器校验结果](wifi-media-check.json)。所有提交媒体均为本项目自生成 mock fixture。

可在仓库根目录复核媒体：

```sh
python3 -I tools/s5-wifi/check_mock_motion.py \
  --media evidence/v0.8.0-beta.1-release/wifi-media \
  --mock-run evidence/v0.8.0-beta.1-release/mock-sd \
  --out build/wifi-release-media-check.json
```

本机 emulator 37 的 Wi-Fi 接口直连 `10.0.2.2` 的 Mac loopback 连接会收到 EOF，因此使用 [mock_release_camera.py](../../tools/s5-wifi/mock_release_camera.py) 和 [测试专用隧道命令](../../tools/s5-wifi/README.md#9-无相机的自测与来源)：ADB reverse 18080 / 60606，AVD 内将 `10.0.2.2` 的 80 / 18080 / 60606 重定向至对应本地监听；UDP 使用 `emu redir add udp:49152:49152`。App 仍走生产的私有 IPv4、Wi-Fi Network socket 绑定及 debug 禁用检查。mock description 为测试声明 `DC-S5`，制造商、固件、EXIF 及服务器记录仍标明 fixture；这不构成型号鉴别、真实相机认证或射频网络验证。

测试后停止 App / mock / 本任务 emulator，删除三条 NAT 规则、两个 ADB reverse 与 UDP 转发；未启动 Metro，未停止其他任务进程。[清理记录](cleanup.json)。

## 发布文件

`dist/moment-lumix-v0.8.0-beta.1-arm64.apk`，32,291,165 字节，versionName `0.8.0-beta.1` / code `22`，最低 API 33，仅 arm64-v8a；`dist/*.apk` 已 gitignore。SHA-256：

```text
fa8a3997c5c9a1981671ce1b32796ddb4f37cc9088a4eb2b37399fe6aa133f82
```

签名证书 SHA-256：`85e000b6b35fd5ad95072cbc359992a808b752aca653c8f723b187777f77c565`。v0.7.0 原密钥不可用，本版使用 2026-10-14 创建的开发密钥；必须先将旧版照片保存到系统相册并确认成功，再卸载旧版、安装 beta。GitHub 发布为 pre-release，v0.7.0 保留最新稳定版。

实体 S5 固件 2.9 的握手、UDP 分包、AF / MF、曝光、双卡目录、长曝光、原片 SD 字节比对、手机双 STA / 蜂窝共存和 ColorOS Motion Photo 识别仍待实机验证；此次仅验证自写 mock、App 媒体与界面路径。
