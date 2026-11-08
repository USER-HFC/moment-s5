# 迭代 4 · 相册确认、撤销、分享、导出角标

2026-11-09 · 分支 `feat/it4-album` · AVD `moment_s5_wifi_api35`（`emulator-5564`，1080×2400 / 420dpi）

无窗口模拟器，截图使用 `adb emu screenrecord screenshot`。没有实体相机，照片都是演示画面。状态栏只有模拟器时间和电量。

| 文件 | 需求 |
| --- | --- |
| [delete-confirm.png](delete-confirm.png) | 4.3 深色确认框。删除按钮为红色，取消在左侧。返回键等于取消 |
| [undo-snackbar.png](undo-snackbar.png) | 4.8 确认后照片先从网格消失，底栏提示「已删除 1 张」，右侧是「撤销」 |
| [share-bar.png](share-bar.png) | 4.9 多选底栏左侧是「分享」，旁边是批量导出和批量删除 |
| [exported-badge.png](exported-badge.png) | 4.10 已导出到系统相册的缩略图左上角有「已导出」角标 |
| [exif-note.png](exif-note.png) | 4.12 「这张照片没有拍摄参数（EXIF）」放在「拍摄参数」小节里，用次要文字颜色 |
