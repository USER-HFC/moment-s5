# v0.8.0-beta.3 界面截图

2026-10-25，分支 `fix/s5-ptp-wifi-protocol`。没有实体相机，也没有重新打包、打 tag 或改动 GitHub release。下面只记录这次实际做过的事。

## 安装的包

使用已经构建好的 release APK：

`mobile/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`

`aapt dump badging` 结果为 `cn.moment.lumix`，versionName `0.8.0-beta.3`，versionCode `24`，`sdkVersion` 33，`native-code` arm64-v8a。文件 SHA-256：

```text
0d11e2a3416394c2e830b3d630760605c642e94769cf59418a53daf476220785
```

与 `.github/releases/v0.8.0-beta.3.md` 中的记录一致。安装后 `dumpsys package` 显示 `versionName=0.8.0-beta.3`、`versionCode=24`、`primaryCpuAbi=arm64-v8a`，`pkgFlags` 没有 DEBUGGABLE。

## 模拟器

冷启动 AVD `moment_s5_wifi_api35`，控制台端口 5580，设备 `emulator-5580`。模拟器日志写明没有 `default_boot` 快照，因此是冷启动；使用 `-no-window -no-audio -gpu swiftshader_indirect`。系统镜像为 API 35、arm64，物理分辨率 1080×2400、420dpi。

先用加速度传感器把机身转到横屏：`adb emu sensor set acceleration 9.81:0:0` 之后，`mCurrentOrientation` 为 `ROTATION_90`。随后锁定 `user_rotation=1`，避免 `uiautomator dump` 把方向恢复成竖屏。下面的 PNG 都是这个横屏状态下未经编辑的 `adb exec-out screencap -p`，尺寸 2400×1080。

启动组件是 `cn.moment.lumix/com.moments5rn.MainActivity`。界面里没有账号、姓名或邮箱。日期和电量来自模拟器。

## 截图

| 文件 | 画面 |
| --- | --- |
| [01-release-start.png](01-release-start.png) | 刚启动的拍摄页，横屏，相机未连接。工具栏有网格、LUT、示波器和连接，没有远焦 / 近焦 |
| [02-demo-motion-ready.png](02-demo-motion-ready.png) | 点「体验演示」后切到「动态」。HUD 为「DEMO · 合成演示」和「动态 · 缓存就绪」，缓存 3.0 / 3s。取景带 MOMENT / SYNTHETIC DEMO 标记和中央对焦框 |
| [03-demo-album.png](03-demo-album.png) | 按下动态快门后打开相册。最近照片标有 DEMO 和 LIVE，日期是模拟器时间 2026年10月25日 15:25 |
| [04-demo-scopes.png](04-demo-scopes.png) | 同一 DEMO 动态会话里打开全部四张透明示波器：RGB 直方图、亮度波形、RGB 分列、矢量示波器。HUD 仍是缓存就绪 |
| [05-wifi-connection.png](05-wifi-connection.png) | 连接面板切到「Wi-Fi（实验）」。可见「实验性 · 未经真机验证」、手动连接开关和相机 IP 入口 |

启动页的无障碍树保存在 [01-release-start.xml](01-release-start.xml)。其中没有「远对焦」或「近对焦」。DEMO 取景开始后画面持续刷新，`uiautomator dump` 无法进入 idle，所以后面的几张没有配套 XML，改用截图像素确认文字。

远焦 / 近焦只在真实 USB 连接时绘制。这次没有 USB 相机，模拟器上这两个按钮没有出现，也没有补画。

## Wi-Fi mock

`python3 -I tools/s5-wifi/mock_release_camera.py --out /tmp/moment-s5-wifi-mock` 能启动。它只监听 Mac 的 `127.0.0.1:18080` 和 `127.0.0.1:60606`，打印的 description 型号为 `DC-S5`。随后在已 root 的模拟器上执行了 README 里的临时转发：`svc wifi enable`、`adb reverse` 18080 / 60606、三条把 `10.0.2.2` 的 80 / 18080 / 60606 转到这些端口的 iptables NAT，以及 `emu redir add udp:49152:49152`。

App 的连接面板可以打开「Wi-Fi（实验）」。相机 IP 输入框使用十进制键盘，第二处小数点会被丢掉：`input text 10.0.2.2` 变成 `10.022`，再在键盘上逐键输入时第二次 `.` 没有进入文本。因此没有把地址改成 `10.0.2.2`，也没有点「连接 Wi-Fi（实验）」，没有得到已连接的实验取景。05 是连接面板，不是已连接画面。

截完 05 之后已停止 mock，并删除上述三条 NAT、两个 reverse 和 UDP 转发。

## 没有做的事

没有重新运行 TypeScript、Jest 或 `tools/check-*.sh`，没有 `assembleRelease`，没有上传或修改 GitHub release。真实 S5 与 Find X8 都没有参与这次界面复核。
