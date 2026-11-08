# 迭代 3 · 音量键拍摄、对焦方向、快门震动

模拟器 `moment_s5_task_e_api35`（`emulator-5566`，无窗口）上的 release 包截图。没有连接实体相机。取景里的画面是演示素材。

| 文件 | 需求 | 内容 |
|---|---|---|
| `01-settings-shooting.png` | 3.10、3.11、3.12 | 设置「拍摄」分组：音量键拍摄默认开，反转近 / 远对焦方向默认关，快门震动默认开 |
| `02-demo-before-volume.png` | 3.10 | 演示模式、照片模式，按音量键之前 |
| `02-volume-saved.png` | 3.10 | `adb shell input keyevent KEYCODE_VOLUME_DOWN` 之后的保存提示「已保存」 |
