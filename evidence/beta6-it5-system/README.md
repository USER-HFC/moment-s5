# 迭代 5 · 系统集成（5.1 / 5.3 / 5.7 / 5.8）

模拟器 `moment_s5_task_e_api35`（`emulator-5566`，无窗口，1080 × 2400）上的 release 包截图。截图命令是 `adb -s emulator-5566 emu screenrecord screenshot <file>`。没有连接实体相机；取景和相册里的画面是演示素材。画面里的时间、手机 100% 和顶部圆点都是模拟器状态，没有个人信息。

| 图 | 对应 | 说明 |
|---|---|---|
| `01-status-bar-shown.png` | 5.1 | 从屏幕顶部下滑唤出系统栏后立即截图。状态栏和底部手势条都可见。 |
| `02-status-bar-hidden-after-3s.png` | 5.1 | 同一位置等待约 3 秒后截图。系统栏和手势条已自动隐藏。另在模拟器上确认：点掉首次全屏提示的「Got it」、关闭 App 引导、从后台回到 App 后，系统栏都会重新隐藏。 |
| `03-mic-permission-dialog.png` | 5.3 | 未授予录音权限时打开「收音」，显示深色确认框，带「去设置」和「暂不」，不再出现浅色系统弹窗。 |
| `04-mic-app-settings.png` | 5.3 | 点「去设置」后落到本 App 的「应用信息」页；系统包名是 `cn.moment.lumix`。 |
| `05-storage-free-space.png` | 5.7 | 存储页新增「手机剩余空间」。这张是模拟器正常的 8.1 GB 读数。 |
| `06-low-storage-shutter.png` | 5.7 | 用测试注入把可用空间设为 100 MB 后按快门，提示「手机存储空间不足，请先清理」，并带「去清理」。点它会打开存储页；已在模拟器上确认。 |
| `07-camera-battery-low.png` | 5.8 | 用测试注入把相机电量设为 8%，HUD 的「相机 8%」变红，并只提示一次「相机电量低」。 |

## 测试注入

`06` 和 `07` 不是用户设置，只在截图/测试启动时通过 Intent extra 注入，正常启动会清空：

```bash
adb shell am force-stop cn.moment.lumix
adb shell am start -n cn.moment.lumix/com.moments5rn.MainActivity \
  --el moment.usableBytes 104857600 \
  --ei moment.cameraBattery 8
```

- `moment.usableBytes` 走 `DeviceStorage`，阈值是原生常量 300 MiB。
- `moment.cameraBattery` 走 `CameraBatterySignal`。正常连接的 USB / Wi-Fi 目前都不提供机身电量，所以普通启动仍显示不可用，不伪造读数。
