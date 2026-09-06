# 0.1.0 验证记录

日期：2026-09-06（本地 Asia/Singapore）。测试模拟器使用 UTC，因此截图日期可能显示前一天。

## 交付结论

Android 应用已构建，能够执行实况拍摄的本地媒体闭环，并通过模拟器 UI 操作与编码验证。USB S5 驱动已实现，**真实机身兼容性仍未验证**。当前 Windows PnP 没有发现 Panasonic / OPPO / Apple USB 设备，ADB 只有本次创建的 Android 模拟器。

安装包：`MomentS5-0.1.0-debug.apk`

SHA-256：`A72063820F62EC77088170AF542D58CBCB5AD93555D84430A20C186107805854`

开发测试签名，通过 APK Signature Scheme v2 验证。不是 Play 商店发行包。

## 实际执行的验证

| 项目 | 结果与证据 |
| --- | --- |
| Gradle 构建 | `assembleDebug`、`assembleDebugAndroidTest` 成功；`evidence/build.txt` |
| Android Lint | 0 错误、0 警告，`No issues found` |
| JVM 核心检查 | 19 项通过；`evidence/core-checks.txt` |
| Android 媒体闭环 | CaptureEngine 演示预缓存 → 快门 → 原图 → AVC → Motion Photo → MediaStore；`evidence/device-checks.txt` |
| 音频 | 48 kHz PCM 环形采集通过（模拟器麦克风，已授予权限）；合成 440 Hz 测试 PCM → AAC → 与 AVC 复用通过 |
| JPEG 原尺寸 | 演示原片 2400 × 1600 保留，非视频截帧 |
| 实况格式 | JPEG 原始字节和 EXIF 保留、XMP XML 可解析、MP4 尾部完整、视频长度字段正确 |
| 关键帧时间 | MotionPhotoPresentationTimestampUs 精确对应一个已编码视频帧的 PTS；USB 指令发出时间另外记录 |
| 视频解码 | Android MediaMetadataRetriever 能解码生成的视频帧；独立 FFprobe 识别 AVC/AAC |
| 相册导出 | MediaStore 写入后读取的文件与原 Motion Photo 逐字节一致，不代表 ColorOS 已识别为实况 |
| 原生 UI | 未发现设备提示、演示进入、实况快门、列表、播放按钮、长按松手、横屏/小屏/大字体截图；`evidence/ui-checks.txt` |
| 签名 | `apksigner verify --verbose` 通过 |

最后一次媒体检查：39 个独立预览 JPEG 帧，最长间隔 86 ms，源时间窗口 2.939 秒；导出 AVC 960 × 640、15 fps、45 帧、3.000 秒。输出帧数包括按实际时间保持的重复帧，**这些数字均来自模拟器演示，不是 S5 实测性能**。

AAC 独立检查：48 kHz、140 个音频包、约 2.987 秒。`outputs/MomentS5-demo/audio-test.mp4` 的声音是合成测试音，不是现场收音。

## UI 视觉检查

查看并修正了播放首帧前的黑屏和横屏图片区域过高。最终截图在 `evidence/01-camera.png` 至 `09-small-large-text.png`：

- 标准手机：1080 × 2400，420 dpi。
- 横屏：2400 × 1080，图片限高并保持比例，其他控件通过滚动访问。
- 小屏、大字：1080 × 1920，480 dpi（360 dp 宽），字体 1.5 倍，系统动画关闭；拍摄内容可滚动，底部导航保留。
- 长按结束后恢复静态图片；提供单击播放按钮，避免只能靠长按操作。

## 已修复的实质问题

- 恶意/损坏 JPEG 偏移发生整数溢出时可能越界。
- 取不到拍前文件基线时可能误用旧照片，现只接受本次拍摄事件。
- 原始文件接收和合成未完成状态缺少持久化，现原片接收后先原子写入记录。
- 播放隐藏静态图片早于视频首帧呈现，造成黑闪。
- `VideoView` 分享返回后的生命周期恢复。
- Android 13+ 自定义广播接收器标志、音视频样本 flags 的类型匹配。
- 麦克风在 App 离开前台时独立停止，USB 长事务不阻止停止收音。

## 必须依赖实体设备的下一步

1. 初代国行 S5 2.9 能否完成 PTP 会话、取景、快门、JPEG 获取。
2. S5 快门黑屏、不同快门时长/对焦模式造成的帧间隔。
3. 镜头 AF/MF 控制和 RAW+JPEG 模式的事件顺序。
4. Find X8 USB 主机角色、电源消耗、断线重连与持续稳定性。
5. ColorOS 相册实况识别、分享渠道保留情况。
6. 竖拍方向和手机环境声与实际曝光的同步校准。

尚未提供：iOS 原生客户端/Apple Live Photo 转换、RAW 下载、精确 A/B 跟焦、后台持续预录。以上不以模拟器测试结果代替。
