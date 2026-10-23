# S5 PTP / Wi-Fi 协议问题与修复

分支：`fix/s5-ptp-wifi-protocol`（基于 `feat/s5-wifi-beta`）。

依据：
- libgphoto2 `camlibs/ptp2` 的松下 PTP 实现（属性编码、GetProperty 布局）。
- lumix-remote 公开的协议笔记和实机 DC-S5（固件 2.03）证据，包括 LUMIX Sync 2.0.17 的连接流程、实机 DLNA 目录和取景数据报。

**以下修复均未在真实 S5 上验证。** 回归测试只针对自写的主机端假设备（fake bulk transport 和 HTTP/UDP mock）。

## PTP（USB）

| # | 问题 | 后果 | 修复 |
|---|---|---|---|
| P1 | 单次 `bulkTransfer` 最多等 3 秒，超时返回 -1 就直接中止会话。外层设置的 15 秒期限实际不起作用 | 机身回复慢于 3 秒（写 SD 卡、AF 搜索、长曝光）就会断开整个 USB 会话 | 在容器的第一个字节到达前，超时会继续等到期限为止；容器中途超时仍然致命，因为被取消的传输可能丢了字节。快门 `0x9404` 的期限放宽到 60 秒。-1 在 200 ms 内返回的算真实故障，连续 3 次就退出 |
| P2 | 当前 ISO 和光圈取自 ListProperty（`0x9108`）的描述值；libgphoto2 读的是 `ISO_Param 0x02000021` / `Aperture_Param 0x02000041`（GetProperty `0x9402`） | HUD 可能显示过时的值或 0 | 先读 GetProperty `0x9402`，不支持时回退到 ListProperty，并把 `0x9402` 加入白名单 |
| P3 | 快门值解码错误：`0xFFFFFFFF`（B 门）显示成很大的秒数；1/1.3 被截成 "1/1"；值为 0 时显示 "1/0" | 曝光读数错误 | 新增 `Ptp.shutterLabel()`，规则与 libgphoto2 一致：B 门、整秒/十分之一秒、分数快门 |
| P5 | `0x9416` ManualFocusDrive 的近/远档位写反：「远」发的是 `0x02`（近 1 档），「近」发的是 `0x03`（远 1 档） | 近焦、远焦按钮方向颠倒，调焦越调越偏 | 按 libgphoto2 修正：近 1 档 = `0x02`、远 1 档 = `0x03`（近 2 档 `0x01`、远 2 档 `0x04` 暂不使用），由 `Ptp.focusStep()` 统一给出 |
| P4 | OpenSession 未使用事务号 0；响应容器缺少校验 | — | 已在 `feat/s5-wifi-beta` 修复，`main` 分支仍有此问题 |

## Wi-Fi

| # | 问题 | 后果 | 修复 |
|---|---|---|---|
| W1 | 原片 JPEG 校验要求 EOI 之后没有任何字节 | 实机 DLNA 的 `size` 是 512 的整数倍（6471168、7464448），lumix-remote 下载到的文件长度也等于这个值，说明原片带填充。**每张真实原片都会被拒收** | 校验到 EOI 为止，允许尾部填充或 MPF 数据 |
| W2 | 取景数据报只在前 1024 字节里找 `FF D8`，并要求 EOI 之后没有字节 | 数据报头里的 MAC 地址可能含 `FF D8`，导致定位错误；带尾部字节的帧全部被丢弃 | 先按 S5 头部的 `be16(30..31)+32` 取 JPEG 起点，失败再搜索 `FF D8 FF`，最后截到 EOI |
| W3 | `accctrl` 回复 `ok_under_research*` 时被当作拒绝 | 首次配对时，机身弹出确认框的同时连接已经失败 | 每秒重试一次，最多等 90 秒，超时后发送 `req_acc_can` |
| W4 | `accctrl` 的 value 固定为 `"0"` | 所有安装共用同一个设备 ID | 改为 `4D454930-0100-1000-8001-` 加每次安装随机生成的 12 位十六进制，保存在 `files/wifi-client-id` |
| W5 | 没有 UPnP GENA SUBSCRIBE | lumix-remote 实测：不订阅时 S5 的 `startstream` 返回 ok 但不发任何帧 | 在 accctrl 之后、任何模式切换之前订阅 `CMS_event`，启动 NOTIFY 接收，等待 `mod_Play` 事件（最多 30 秒）；续订只带 SID，关闭时 UNSUBSCRIBE |
| W6 | 保活每 2 秒一次，任何一次失败就断开；每次保活还附带 3 个 `getsetting` | Wi-Fi 稍有抖动就断开；轮询过密也是 S5 卡死的诱因之一 | 1 Hz `getstate`；`err_busy` 不算失败；`err_reject`、连续 3 次失败或 30 秒内没有任何成功回复才断开。曝光每 5 秒读一次，播放模式或机身忙时不读 |
| W7 | 模式、码流相关命令遇到 `err_busy` 立即失败 | 机身短暂忙碌就会导致连接或拍摄失败 | `recmode`、`playmode`、`startstream` 按 LUMIX Sync 的做法重试 5 次、每次间隔 1 秒。快门仍然不重试 |
| W8 | 每次拍摄都遍历整张卡，且最多 10000 个条目 | 实机卡约有 12 个文件夹 × 960 张，**超过上限直接失败**；即使没超限，每张也要发 100 多个 SOAP 请求 | 基线只取根目录和最新文件夹；之后只列出新增的容器或 `childCount` 变化的容器。分页期间目录变化时改为重试，不再中止 |
| W9 | 浏览失败后切到 `playmode`，浏览完马上切回 `recmode` 并重新开流，而且每 600 ms 轮询都重复一次 | 频繁切换模式是 lumix-remote 记录的 S5 卡死诱因 | 进入播放模式后一直停留到原片下载完毕，再执行一次 `recmode` 和 `startstream`。切回失败只结束会话，已下载的原片保留 |

## 尚未处理（需要真机数据）

- **快门前要做一次播放模式往返**：S5 只在播放模式下提供卡目录，所以拍摄前建立基线时需要切到 playmode 再切回 recmode。是否能改用事件或 `get_content_info` 来替代，需要抓包确认。
- **User-Agent**：LUMIX Sync 发送的是 `LUMIX Sync`，但还没有证据表明 S5 会根据它改变行为，因此没有改动。
- **CloseSession `0x9103` 的参数**：libgphoto2 的注释写的是不带参数，本项目沿用了 tethr 传入的 `0x00010001`，没有改动。

## 验证

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
bash tools/check-core.sh   # 62 core checks
bash tools/check-usb.sh    # 9 USB PTP checks（新增）
bash tools/check-wifi.sh   # 104 Wi-Fi checks
```

`tools/check-native-host.sh` 需要 `.tools/android-all.jar` 和 `react-android.jar`，本机没有这两个文件，所以这次没有运行。
