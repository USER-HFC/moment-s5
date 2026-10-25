# 示波器返工证据（v2）

2026-10-25 · `feat/scopes-controls` · AVD `moment_s5_hud_e43_api35`（`emulator-5588`）

- API 35 / arm64，1080×2400 / 420dpi，系统字体 1.0；横屏由模拟器传感器实际旋转得到。
- 最终 release APK：`app-arm64-v8a-release.apk`，32,330,693 bytes，SHA-256 `bae802f5adf4355b0c8cb74f54c96e4feeb83e54b4e5aae708fb6c8686591f0e`。
- 所有图均为最终 release 的模拟器原始画面，使用 `adb emu screenrecord screenshot` 捕获；`04`、`09` 是 2× 放大裁切（LANCZOS），只用于查看密度行和标签细节，未改动像素内容。
- 本机无窗口模拟器上 `adb exec-out screencap` 会把取景图层拍成黑色，因此改用模拟器自身截图接口；画面内容仍来自最终 APK。
- 没有实体相机；全部取景画面都是合成 DEMO，不含个人信息。

| 文件 | 内容 |
| --- | --- |
| `00-demo-start-v2.png` | 连接后的 DEMO 初始画面 |
| `01-scope-sheet-v2.png` | 示波器选择面板 |
| `02-waveform-small-v2.png` | 波形 S 尺寸，通道标签 10sp 下限 |
| `03-waveform-large-v2.png` | 波形 M 尺寸，标签随尺寸放大，密度行以 1.06 高度重叠 |
| `04-waveform-large-detail-v2.png` | 03 的 2× 裁切：行间没有透明缝，100/50/0 与 L/R 带深色描边 |
| `05-longpress-progress-v2.png` | 隐藏后按住图表约 2.4s：顶部圆环已填至约八成 |
| `06-longpress-revealed-v2.png` | 按住 3s 后控制图标恢复，圆环消失；同时触发一次短震 |
| `07-reveal-hint-v2.png` | 本次连接第一次自动隐藏后的提示，居中显示约 2s 后淡出 |
| `08-parade-large-bottom-v2.png` | RGB 分列 M 尺寸拖到画面底部，与曝光 HUD 文字重叠 |
| `09-parade-large-bottom-detail-v2.png` | 08 的 2× 裁切：R/G/B 与亮度刻度在 HUD 文字上仍可读，示波器无卡片背景 |
| `10-parade-landscape-v2.png` | 横屏下的 RGB 分列，标签仍带描边 |
