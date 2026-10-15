# v0.8.0-beta.2 验证与发布记录

2026-10-15，分支 `feat/s5-wifi-beta`，起点 `11032e4`。本次没有实体相机；验证使用 API 35 arm64 模拟器、明确标记的 DEMO 和本项目自写 Wi-Fi mock。**不构成真实 S5 / Find X8 兼容性验证。**

## 实现

普通「照片」模式改为本次 JPEG 下载流程：原生快门入口同步预留 busy、冻结 LUT 和会话，沿用 USB 事件 / 基线关联与 Wi-Fi 完整分页基线，只发一次快门并接收本次唯一新 JPEG。普通照片不读取前三秒门槛、不调用视频编码器；无 LUT 直接保存原片，选 LUT 时另写原子发布的 `rendered.jpg`。`original.jpg` 保留下载字节，SD 卡无删除或回写操作。

元数据记录 `captureMode: photo`、`mediaType: photo`、来源、时间、transport、DEMO / Wi-Fi 实验标记、`lutRequested` / `lutApplied`、零帧 / 零视频时长及完成状态。失败清理临时文件并保留已经接收的原片；LUT 失败显示错误，可明确导出原片。移除快门刚按下便显示成功勾的行为，保存结果由原生完成事件报告。

App 相册接收普通静态照片，静态详情 / 列表不显示 LIVE、不加载 Video、不提示播放。系统导出按模式选择 JPEG：普通照片为渲染图或原片，动态照片为 `MOMENT_MP.jpg`；统一发布至 `DCIM/MomentS5`。旧动态记录继续兼容，三秒 pre-only、音频、编码和 Motion Photo 路径保留。

示波器改为透明图表：无卡片底色、窗口边框、标题栏、页脚或重复说明。每张图独立放大 / 缩小、移动与关闭；小图默认平铺，大图允许叠放，归一化位置始终限制在实际测量的 HUD 安全区。图标控件至少 48dp，提供中文无障碍名称和方向移动操作；坐标按显示尺寸调整并增强对比。仍只在有取景、打开图表且前台时订阅，进入相册 / 后台和关闭全部图表会释放分析订阅。AF / 近 / 远三按钮组和冗余小字已移除；实验、错误、DEMO 及无障碍信息保留。

## 检查

环境：`JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`、`ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`，Node / npm 使用现有锁文件，未新增应用依赖。native host 检查使用已有 Android / RN jars，分别由 `MOMENT_ANDROID_JAR`、`MOMENT_REACT_JAR` 指向 `scan-bugfix/.tools` 中的缓存。

| 检查 | 结果 / 原始输出 |
| --- | --- |
| `cd mobile && ./node_modules/.bin/tsc --noEmit` | 通过，exit 0；[记录](validation.json) |
| `cd mobile && npm test -- --runInBand` | 9 suites / 62 tests；[日志](jest.log) |
| ESLint | 0 errors / 187 style warnings；[汇总](eslint-summary.json)、[原始 JSON](eslint.json) |
| `bash tools/check-core.sh` | 51 core + 6 删除 + 11 LUT 导入；[日志](java-core.log) |
| `bash tools/check-native-host.sh` | 132 checks；[日志](java-native-host.log)；Android doubles，无实体相机 |
| `bash tools/check-scopes.sh` | 97 checks；[日志](java-scopes.log) |
| `bash tools/check-wifi.sh` | 76 checks；[日志](java-wifi.log) |
| `python3 -I -m unittest discover tools/s5-wifi` | 41 tests；[日志](python-wifi.log) |
| `python3 -I tools/check_bundled_luts.py` | 1258 LUT + 66 bitmap / host JPEG / post-LUT scope checks；[日志](java-luts.log) |
| `python3 -I tools/generate_fuji_style_luts.py --check` | 8 个预设可重现；[日志](generated-luts.log) |
| `cd mobile/android && sh ./gradlew assembleRelease` | 实际构建通过，含 release lint vital；[日志](build.log) |
| `git diff --check` | 通过 |

以上包含全部四个 `tools/check-*.sh`。新增回归覆盖 USB / Wi-Fi 普通照片有 / 无 LUT、存储 / 导出、空预缓存、重复快门只派发一次、快门时 LUT 快照、断开取消、LUT 失败保留原片、部分下载清理、静态相册无 LIVE / Video、独立缩放 / 移动 / 关闭、HUD 边界、透明图表无卡片背景 / 边框，以及三个对焦按钮消失。既有动态、订阅生命周期、连接与麦克风测试继续通过。

## 最终 release APK 的模拟器闭环

独立启动 `moment_s5_wifi_api35` / `emulator-5580`，API 35 arm64，1080×2400 / 420dpi；另以 480dpi 验证 360dp 宽度，系统字体 1.3 与 3.0。通过实际加速度传感器切换横竖屏。最终安装包的 SHA-256 与 `dist` 发布文件逐字节匹配，`pkgFlags` 无 DEBUGGABLE，无 Metro，见 [APK 校验](apk-verification.json)、[安装记录](install.log)。所有 PNG 都是未经编辑的 `adb exec-out screencap -p`；[尺寸与哈希清单](screenshots.json)。

| 流程 | 证据 |
| --- | --- |
| 默认拍摄页，无 AF / 近 / 远组 | [启动](01-release-start.png) |
| DEMO 普通照片，无 LUT | [静态相册](03a-demo-static-no-lut.png)、[元数据](demo-static-no-lut-media/moment.json)、[像素 / 导出检查](demo-static-no-lut-check.json) |
| DEMO 普通照片，Classic Chrome | [静态相册](03-demo-static-album.png)、[元数据](demo-static-media/moment.json)、[像素 / 导出检查](demo-static-check.json) |
| 四图透明叠层 | [竖屏](05-scopes-portrait.png)、[横屏](09-scopes-landscape.png) |
| 独立操作 | [仅放大直方图](06-scope-independent-enlarge.png)、[拖至右下并被边界限制](07-scope-drag-clamped.png)、[只关闭波形，另三图保留](08-scope-independent-close.png)、[单独缩小直方图](08a-scope-independent-shrink.png) |
| 360dp / font 1.3 | [竖屏](10-scopes-360dp-font13.png)、[横屏](11-scopes-360dp-font13-landscape.png)、[静态相册](12-static-album-font13.png) |
| 360dp / font 3.0 | [竖屏](13-scopes-360dp-font30.png)、[横屏](14-scopes-360dp-font30-landscape.png)；模式文字自然换行，主要操作可达 |
| release 的生产 Wi-Fi 入口 | [10.0.2.2 手动 IP / 实验说明](15-wifi-release-settings.png)、[实际取景及透明图表](16-wifi-connected.png)；无 debug 任意主机入口 |
| Wi-Fi 普通照片 / LUT / 导出 | [静态相册无 LIVE](17-wifi-static-album.png)、[系统导出](18-wifi-static-export.png)、[媒体检查](wifi-static-check.json)、[只发一次快门](wifi-once-proof.json) |
| Wi-Fi 动态回归 | [缓存就绪](19-wifi-motion-ready.png)、[LIVE 静态页](20-wifi-motion-album.png)、[长按回放](21-wifi-motion-playing.png)、[媒体检查](wifi-motion-check.json)、[播放像素变化](playback-pixels.json) |

DEMO 无 LUT 为 `M1792072338309_28dff5c8`，有 LUT 为 `M1792072386758_d775aeea`：均为 2400×1600，`demo:true`，`frames:0` / `durationUs:0`，无 MP4 或 Motion Photo 容器。无 LUT 的系统 JPEG 与原片完全一致；Classic Chrome 渲染的 RGB 平均绝对变化约 `[3.55, 8.77, 7.47]`，尺寸不变，系统 JPEG 与 `rendered.jpg` 完全一致。演示原图本身保留 SYNTHETIC DEMO 标记。

Wi-Fi 静态为 `M1792072931471_aa7ca484`。独立 mock run 记录 **1 次且仅 1 次** `/cam.cgi?mode=camcmd&value=capture`；[服务器状态](mock-sd/mock-state.json) 与 [once proof](wifi-once-proof.json) 可复查。下载的 512×384 `original.jpg` 与 [mock SD 原文件](mock-sd/fixture-0001.JPG) 字节相同，SHA-256 `fb283583284b84bf32dbcb320d81f3a9927c68bb1088f21957e85eee44adc409`；LUT 渲染 RGB 平均绝对变化 `[12,11,9]`，导出与渲染 JPEG 一致，无视频。

Wi-Fi 动态为 `M1792073221101_4c8a75f8`，使用另一个独立 mock run，同样只触发一次快门。40 个快门前取景帧，最长间隔 143ms，无快门后补帧；AVC 64×48、45 samples、3.0 秒，静态标记 2,933,333µs。原 JPEG、嵌入 MP4 和系统相册导出均保持字节一致。长按期间中心像素从 `[171,171,171]` 变为 `[184,182,184]`，结合 MP4 容器校验确认回放路径。灰阶是自写 mock 有意生成的素材。

四个媒体任务的系统相册记录均为 `image/jpeg`、`DCIM/MomentS5/`、`is_pending=0`，见 [MediaStore 记录](mediastore-exports.json)。证据媒体目录中的 `system-export.jpg` 是另从 MediaStore 导出的文件副本，非 App 捕获目录的额外生成文件。

复核静态像素与媒体（需要 Pillow，仅用于主机检查）：

```sh
python3 tools/check_still_media.py --media evidence/v0.8.0-beta.2/demo-static-no-lut-media --out build/demo-no-lut.json
python3 tools/check_still_media.py --media evidence/v0.8.0-beta.2/demo-static-media --out build/demo-lut.json
python3 tools/check_still_media.py --media evidence/v0.8.0-beta.2/wifi-static-media --source evidence/v0.8.0-beta.2/mock-sd/fixture-0001.JPG --out build/wifi-static.json
python3 -I tools/s5-wifi/check_mock_motion.py --media evidence/v0.8.0-beta.2/wifi-motion-media --mock-run evidence/v0.8.0-beta.2/motion-mock-sd --out build/wifi-motion.json
```

模拟器 37 的 Wi-Fi 接口到 Mac loopback 使用与 beta.1 相同的测试专用隧道：`mock_release_camera.py` 监听 18080 / 60606，ADB reverse 与 AVD 内三条 NAT 规则把 `10.0.2.2` 的 80 / 18080 / 60606 转至这些监听，UDP 转发 49152。命令见 [mock 指南](../../tools/s5-wifi/README.md#9-无相机的自测与来源)。App 继续走生产私有 IPv4、Wi-Fi Network 绑定、型号及 debug 禁用校验；测试 description 声明 DC-S5，制造商、固件、EXIF 和状态保留 fixture 来源。这不是实体型号鉴别、认证或射频验证。

测试后已停止 App、两次 mock 和本任务 emulator，移除三条 NAT、两个 reverse 和 UDP 转发；无剩余测试监听或 ADB 设备，未启动 Metro，见 [清理记录](cleanup.json)。

## 发布文件与安装

`dist/moment-lumix-v0.8.0-beta.2-arm64.apk`，**32,305,881 字节**，versionName `0.8.0-beta.2` / versionCode `23`，最低 API 33，仅 arm64-v8a。SHA-256：

```text
56bbe51ca18ba446267f95c3860db3d15bb5143b19f5d5d8ab5a79fe54b2ddb2
```

使用原有 `~/.android/debug.keystore`；已实际下载 beta.1 APK 并分别运行 apksigner。两者证书 SHA-256 同为 `85e000b6b35fd5ad95072cbc359992a808b752aca653c8f723b187777f77c565`，见 [beta.1 证书](beta1-signature.txt)、[本次证书](apk-signature.txt)。**beta.1 可直接覆盖升级，不需要卸载。** v0.7.0 的不同签名警告仍适用：先导出并确认照片，再卸载 v0.7.0；卸载会清除 App 内照片与导入 LUT，SD 卡和系统相册副本保留。

预发布地址：[v0.8.0-beta.2](https://github.com/USER-HFC/moment-s5/releases/tag/v0.8.0-beta.2)。发布流程仅推送现有 `feat/s5-wifi-beta` 分支和新的 annotated tag，不改 main、不 force、不覆盖既有 tag / release；上传上述已验证的同一 APK，使用 `--prerelease --latest=false`，v0.7.0 保持最新稳定版。远端发布后核对记录单独补充，APK 不再重建。

## 未解决的硬件验证范围

没有真实 S5 或 Find X8。真实 USB / Wi-Fi 握手、S5 固件 2.9 的 UDP 分包、相机新 JPEG 事件 / 双卡 / 长曝光、SD 卡原片实际字节比对、镜头控制、双 STA / 蜂窝共存、持续采样功耗 / 热稳定性、音画同步、ColorOS 原生 Motion Photo 识别均待实体设备验证。Wi-Fi 继续明确标记实验性，USB 仍为默认与推荐方式；本次模拟器与主机检查不替代这些验收。
