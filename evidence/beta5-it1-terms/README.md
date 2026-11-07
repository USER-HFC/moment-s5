# 迭代 1.7 · 用词清单

面向用户统一叫「动态照片」（简称「动态」）。相册角标保留「LIVE」。演示统一叫「演示」。图片水印 `MOMENT / SYNTHETIC DEMO` 和内部文件名 `DEMO.jpg` 不改。文件格式只保留一句「Android Motion Photo 格式」。

本次只改相册、发给界面的状态和错误、分享菜单和标题，以及根目录 `README.md`。拍摄页、HUD、连接面板、设置页和 `mobile/App.tsx` 由其他任务负责，这里只登记、不改。

## 要改

| 位置 | 原文 | 改为 |
| --- | --- | --- |
| `mobile/src/albumFormat.ts` `fileLabel('MOMENT_MP.jpg')` | 实况文件 | 动态照片 |
| `mobile/src/albumFormat.ts` `shareKindLabel.motion` | 分享实况文件 | 分享动态照片 |
| `mobile/src/MotionAlbum.tsx` 分享菜单标题、分享按钮无障碍名 | 分享照片（动态也用这个标题） | 有动态时为「分享动态照片」，普通照片仍为「分享照片」 |
| `mobile/src/MotionAlbum.tsx` LUT 说明 | 实况会用新静态图重新封装 | 动态照片会用新静态图重新封装 |
| `CaptureEngine.java` `listener.status`（连接或进入演示时正在保存） | 正在保存实况，请稍候 | 正在保存，请稍候（这条会挡住照片和动态两种保存） |
| `CaptureEngine.java` `listener.status`（演示开始预缓存） | 演示模式 · 正在预缓存 | 演示 · 正在预缓存 |
| `CaptureEngine.java` 写入相册的未完成说明 | 合成尚未完成，已接收的原片可以分享 | 动态照片还在生成，已接收的原片可以分享 |
| `CaptureEngine.java` `listener.status` | 原片已接收 · 正在合成实况 | 原片已接收 · 正在生成动态照片 |
| `CaptureEngine.java` `listener.status` | 实况已保存 | 动态照片已保存 |
| `MomentS5Module.java` Wi-Fi 忙时拒绝 | 正在保存实况，请稍候 | 正在保存，请稍候 |
| `MomentS5Module.java` 系统分享标题 | 一律「分享照片」 | 按所选项：分享当前画面 / 分享原片 / 分享动态视频 / 分享动态照片 |
| `UsbS5Transport.java` 原片长度错误（经 `listener.status` 显示） | 原片长度不符，未生成实况文件 | 原片长度不符，未保存这张照片 |
| `WifiS5Transport.java` 原片长度错误（经 `listener.status` 显示） | Wi-Fi 原片长度与目录不符；未生成实况 | Wi-Fi 原片长度与目录不符，未保存这张照片 |
| `AudioRing.java` 收音不足（写入诊断日志） | 环境声缓存不足，本次保存无声实况 | 环境声缓存不足，这次动态照片没有声音 |
| `MotionPhoto.java` 播放位置错误（经 `listener.status` 显示） | 实况照片时间标记无效 | 动态照片的播放位置无效 |
| `README.md` | 实况、Motion Photo、DEMO、合成演示 | 动态照片、演示；格式说明只留一句「Android Motion Photo 格式」；水印原文保留 |

同步测试：`mobile/__tests__/albumFormat.test.ts`、`mobile/__tests__/MotionAlbum.test.tsx`。

## 保留

| 位置 | 原文 | 原因 |
| --- | --- | --- |
| `MotionAlbum.tsx` 网格和查看器角标 | LIVE、播放 LIVE | 相册角标允许保留 LIVE |
| `MotionAlbum.tsx` 网格标记 | 演示 | 已经是统一用词 |
| `albumFormat.ts` / `PhotoInfo.tsx` / `MomentFacts.java` | 演示、演示素材、无（演示画面） | 已经是统一用词 |
| `CaptureEngine.java` `demoFrame` | MOMENT / SYNTHETIC DEMO | 图片水印除外 |
| `CaptureEngine.java` 演示原片文件名 | DEMO.jpg | 内部来源名，界面不显示；测试锁定这个值 |
| `CaptureEngine.java` 日志 | 进入演示…、已合成 N 帧 | 诊断日志，不是界面状态 |

## 不改（不在本次范围）

| 位置 | 原文 | 原因 |
| --- | --- | --- |
| `mobile/src/hud/CameraHud.tsx` | DEMO · 合成演示 | HUD，其他任务 |
| `mobile/src/connection/ConnectionSheet.tsx` | 合成演示方式、合成演示中、启动合成演示、合成演示素材 | 连接面板，其他任务 |
| `mobile/src/AboutScreen.tsx` | 为 Panasonic LUMIX 相机拍摄实况照片 | 设置里的关于页 |
| `mobile/src/CameraWorkspace.tsx`、`mobile/App.tsx` | 已使用「动态照片」「体验演示」 | 其他任务负责这些文件 |
| `MainActivity.java` | 实况、分享实况文件、分享片刻、体验实况演示等 | 旧版界面，README 标明仅作迁移参考；当前应用入口是 RN |
| `DESIGN.md`、`TEST_REPORT.md`、研究文档、历史 `evidence/` | 实况、Motion Photo、DEMO | 不是当前界面文案，也不是本次 README |

## 截图

模拟器 `moment_s5_task_e_api35`（`emulator-5566`），无窗口，`adb emu screenrecord screenshot`。没有实体相机，画面是演示。截图对应 1.7。状态栏只有模拟器时间和电量。

| 文件 | 对应 |
| --- | --- |
| `01-album-grid.png` | 相册网格：动态角标仍是 LIVE，来源标「演示」 |
| `02-album-viewer.png` | 查看器：副标题「演示」，角标 LIVE，底栏「分享」 |
| `03-share-menu.png` | 分享菜单标题「分享动态照片」。可见项是「分享动态视频」「分享原片」「分享当前画面」 |
| `04-info-panel.png` | 信息面板：机身文件「演示素材」，来源「演示」，连接「无（演示画面）」 |
| `05-status-saved.png` | 拍摄页提示「动态照片已保存」。画面上的「DEMO · 合成演示」属于 HUD，这次不改 |

Android 的系统对话框最多三个按钮，多出来的会被丢掉，对话框也不能点外面关闭。动态照片的五个选项里，前三个会显示，「分享动态照片」这一项和「取消」不会出现。改文案之前也是这样，第四项当时叫「分享实况文件」。这次只改了用词，没有改对话框结构。Jest 仍断言完整的五项。

缩略图和水印里的 `MOMENT / SYNTHETIC DEMO` 按规则保留。
