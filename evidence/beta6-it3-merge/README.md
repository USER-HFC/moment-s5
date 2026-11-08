# 迭代 3 · 合并后的返回键与音量键

2026-11-08 · 分支 `release/0.8.0-beta.6` · AVD `moment_s5_hud_e43_api35`（`emulator-5562`，1080×2400 / 420dpi）

无窗口模拟器。除 `05` 外，截图使用 `adb emu screenrecord screenshot`。没有实体相机，取景和相册里的照片都是演示画面。画面里的时间和「手机 100%」是模拟器状态，没有个人信息。

`05` 用了 `screencap`。系统音量条画在系统界面上，`emu screenrecord screenshot` 这一帧和按键前相同，抓不到音量条。设置页盖住了取景，所以这张没有黑掉的取景层。

| 文件 | 需求 | 内容 |
| --- | --- | --- |
| `01-album-grid.png` | 返回键 | 相册网格，硬件返回之前。里面有一张演示照片。 |
| `02-capture-after-album-back.png` | 返回键、3.1 | 在网格按一次返回后回到拍摄页。仍是演示，LUT 仍是 Classic Chrome，网格还在。 |
| `03-viewer.png` | 返回键 | 从网格打开的查看器。 |
| `04-viewer-back-to-grid.png` | 返回键 | 查看器里按一次返回，只回到网格。筛选仍是「全部 1」，没有退出相册，也没有再拍一张。 |
| `05-settings-volume.png` | 音量键 | 设置页按音量减。右侧是系统音量条，画面上没有「照片已保存」。 |
| `06-volume-saved.png` | 3.6、3.10 | 回到拍摄页后按音量减。提示是「照片已保存 · Classic Chrome」。 |
