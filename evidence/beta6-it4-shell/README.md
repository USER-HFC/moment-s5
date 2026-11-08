# 迭代 4 · 沉浸式系统栏、引导返回、使用指南

模拟器 `moment_s5_task_e_api35`（`emulator-5566`，无窗口，1080×2400）上的 release 包截图。截图命令是 `adb emu screenrecord screenshot`。没有连接实体相机。取景和相册里的画面是演示素材。顶部圆点是模拟器挖孔，不是状态栏图标。

| 文件 | 需求 | 内容 |
|---|---|---|
| `01-onboarding-top.png` | 4.1 | 引导第一张，「跳过」在挖孔右侧，没有系统时钟或电量图标 |
| `02-capture-top.png` | 4.1 | 未连接时的拍摄页顶部工具栏 |
| `03-album-top.png` | 4.1 | 相册标题「相册」和筛选，不与系统栏重叠 |
| `04-viewer-top.png` | 4.1 | 查看器标题「今天 23:52」完整露出 |
| `05-settings-top.png` | 4.1 | 设置标题在挖孔下方 |
| `06-guide-shooting.png` | 4.11 | 使用指南新增「拍摄」：音量键拍摄、构图参考、快门震动、反转对焦 |
| `07-guide-faq.png` | 4.11 | 「传错照片」：先确认机身同步，拍摄时不要在机身上回放 |

4.2 引导返回键由 Jest `OnboardingBack.test.tsx` 覆盖，这组截图没有按硬件返回键。
