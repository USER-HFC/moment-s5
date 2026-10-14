# 初代 Panasonic LUMIX S5 无线接入研究

调研日期：2026-10-14。对象严格限定 **DC-S5（初代）**；DC-S5D、DC-S5M2/S5II、DC-S5M2X/S5IIX 的能力不得自动继承。本文仅研究协议、接入方案及验证方法，没有实现无线客户端，也没有连接实体相机。

证据标记：**【官方】**为 Panasonic / Android / Apple 文档；**【第三方实测】**为作者明确描述的实体设备结果，仍非本项目验证；**【源码】**表示代码确实存在，不等于相机实测；**【推断】**为由证据推导的工程判断；**【待实测】**为不能据公开资料承诺的 S5 行为。架构、工期、门槛和测试步骤均为本报告的建议，不是厂家规格。

## 1. 可行性结论

**建议有条件推进 Wi-Fi 原型；不能承诺现在就能完整替代 USB，也不能用 BLE 单独实现 Motion Photo。**【官方】初代 S5 支持 LUMIX Sync 的无线取景、拍摄和图片传输；BLE 提供配对、快门、定位和电源操作，取景与图像传输走 Wi-Fi。[S5 官方入口][P2S]、[取景拍摄][P4]、[图片传输][P6]、[BLE 快门][P7]

【推断】最合理的数据通路是 **Wi-Fi 上的 `cam.cgi` HTTP 控制 + UDP JPEG 取景 + UPnP/DLNA 索引及 HTTP 原片下载**，再复用现有快门前缓存、LUT、视频编码和 Motion Photo 打包。该协议在其他 LUMIX 上有可读源码；本次查阅的项目中，尚未找到“初代 S5、明确固件版本、连续取景 → 单张快门 → 本次 JPEG 与 SD 卡原文件一致”的完整公开验证，故此通路对 S5 仍是【推断/待实测】。[libgphoto2 无线驱动][O1]、[G9II Wi-Fi 源码][O5W]、[现有拍摄引擎](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java)

【推断】当前产品只保留**按下 App 快门前**约三秒画面，所以拍照时黑屏、快门后切到回放下载，并不必然破坏已冻结的片段；真正的可行性门槛是快门前帧流足够连续、可唯一确定新文件、可获取完整 JPEG。第一版应先手动开启并加入相机 Wi-Fi，成功后再增加 BLE 唤醒和配网。[缓存契约](../../app/src/main/java/cn/moment/lumix/FrameRing.java)、[拍摄边界](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java)

【官方】S5 虽被 **LUMIX SDK** 列为支持型号，但该 SDK 的 S5 路径是 Windows DLL / USB，不是 Android/iOS Wi-Fi SDK；官方 Tether 表也只列 S5 的 USB 接口。没有证据支持“把 `UsbS5` 的 PTP 容器改发 TCP 就可使用 S5 无线 Tether”。[SDK][P10]、[Tether 接口矩阵][P9]

## 2. 现有 USB 基线与逐功能比较

本仓库阅读基线为 `0918032aa73243b80627131e272f56da6b654606`。以下 USB 栏是**已实现的软件行为**，不是本项目已做 S5/Find X8 实测的声明；README 明确保留实体设备兼容性待验证。[README](../../README.md)、[DESIGN](../../DESIGN.md)

【源码】`UsbS5.open()` 限定型号 S5/DC-S5；USB 预览用 `0x9706`，快门 `0x9404`，AF `0x9405`，MF 步进 `0x9416`，曝光通过 `0x9108`，原文件通过标准 `GetObjectInfo/GetObject`；`Ptp` 校验容器和 JPEG。`CaptureEngine` 每次预览后再延迟 75 ms 调度，因此 **15 fps 是编码输出值，并非已测得的 USB 独立帧率**；它预先准备文件句柄基线、冻结快门前缓存、快门后最多等待 60 秒寻找新 JPEG，原片接收上限 64 MiB。[UsbS5](../../app/src/main/java/cn/moment/lumix/UsbS5.java)、[Ptp](../../app/src/main/java/cn/moment/lumix/Ptp.java)、[CaptureEngine](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java)、[编码器](../../app/src/main/java/cn/moment/lumix/VideoEncoder.java)

| 功能 / 约束 | USB：本仓库当前实现 | Wi-Fi：初代 S5 证据与边界 | BLE：初代 S5 证据与边界 |
| --- | --- | --- | --- |
| 连接 | OTG 授权 + PC(Tether) + Panasonic PTP。[代码](../../app/src/main/java/cn/moment/lumix/UsbS5.java) | 【官方】2.4 GHz AP/STA、5 GHz STA；可直接连相机或经 AP/手机热点。[规格][P1]、[连接][P3] | 【官方】BLE 4.2；Sync 注册后辅助 Wi-Fi 连接。[规格][P1]、[配对][P2B] |
| 连续 JPEG 取景 | `preview()` 拉取 JPEG，编码最长边 ≤960、输出 15 fps；实际源帧率待测。[README](../../README.md) | 【官方】Sync 有 live view；【源码】其他型号 UDP JPEG；S5 尺寸、独立帧率、延迟待测。[P4][P4]、[O1][O1] | 【推断】所查 BLE 功能没有图像流接口，不可作为三秒视频素材通路；官方取景使用 Wi-Fi。[P4][P4]、[P7][P7] |
| 拍照时取景是否连续 | `busy` 时停止轮询，产品仅用快门前画面。[引擎](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java) | 【待实测】可边显示取景边发拍摄；“快门不黑屏/连续帧无间断”无官方保证。[P4][P4] | 【官方】可发快门；没有对应 BLE 取景可讨论。[P7][P7] |
| 单张遥控快门 | 一次发送，不自动重发。[UsbS5](../../app/src/main/java/cn/moment/lumix/UsbS5.java) | 【官方】支持；【源码】`camcmd=capture`，S5 命令及应答待测。[P4][P4]、[O5W][O5W] | 【官方】Shutter Remote Control 支持拍照、Bulb、视频启停；S5 GATT 指令待捕获。[P7][P7] |
| 单次 AF / touch-AF | 有单次 AF，当前没有 touch-AF。[代码](../../app/src/main/java/cn/moment/lumix/UsbS5.java) | 【官方】Sync 有 AF / touch-AF；【源码】`oneshot_af`、`camctrl type=touch` 在 G9II；S5 待测。[P5][P5]、[O5W][O5W] | 【待实测】半按是否 AF 取决于机身设置；未证实独立 AF/触摸点服务。[P7][P7] |
| 近 / 远 MF 步进 | 相对步进，非绝对距离。[README](../../README.md) | 【官方】Sync MF 调节；【源码】`wide-fast/slow`、`tele-fast/slow` 等候选；S5/镜头支持需测试。[P5][P5]、[O1][O1]、[O5W][O5W] | 【待实测】未找到经 S5 实测的 MF 步进 GATT；暂不承诺。 |
| ISO / 光圈 / 快门读数 | `exposure()` 已实现。[代码](../../app/src/main/java/cn/moment/lumix/UsbS5.java) | 【官方】Sync 显示曝光参数；【源码】`getsetting` 可读 `iso/focal/shtrspeed`；S5 值域待测。[P4][P4]、[O1][O1] | 【待实测】未找到经 S5 实测的完整曝光读数服务；不作为第一版数据源。 |
| 本次原尺寸 JPEG | 新句柄/事件确认后 `GetObject`，保留原始字节及 EXIF。[引擎](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java) | 【官方】有原尺寸发送设置；【源码】DLNA 可区分原图和缩略图；S5 字节一致性、可见时间待测。[手册 p.445/466][P11]、[O1][O1] | 【推断】BLE 辅助自动传输，图片本体仍走 Wi-Fi。[P6][P6] |
| RAW / RAW+JPEG | 不下载或处理 RW2，要求 JPEG 或 RAW+JPEG。[README](../../README.md) | 【官方】S5 可向手机传 RAW/JPEG；【源码】`CAM_RAW`/`CAM_RAW_JPG`；第一版仍只取 JPEG。[手册 p.445][P11]、[O1][O1] | 【推断】不作大文件通路；RAW 留 SD 卡。[P6][P6] |
| 三秒缓存 + Motion Photo | `FrameRing`、LUT、H.264、XMP 已有。[README](../../README.md) | 【推断】帧流满足现有门槛、静态文件通过原片验证后可复用；视频质量不保证和 USB 相同。 | 【推断】单独不可行；可配合 Wi-Fi 唤醒/连接/遥控。 |
| 手机保持互联网 | 【推断】USB 不占 Wi-Fi 网络，互联网路由可独立。 | 【官方/推断】相机 AP 本身无互联网；按 socket 绑定相机网络，可保留默认蜂窝网络；双 STA 和热点方式需 Find X8 验证。[A1][A1]、[A2][A2]、[A3][A3] | 【推断】BLE 不替换手机 IP 网络；但无法替代图片传输。 |
| 唤醒 / 关机 | 本项目未实现。[UsbS5](../../app/src/main/java/cn/moment/lumix/UsbS5.java) | 【官方】Sync 通过 Bluetooth Remote Wakeup 进入 Wi-Fi 遥控。[P8][P8] | 【官方】需开启 Remote Wakeup；关机待命会耗电，不能等同完全断电后唤醒。[P8][P8]、[手册 p.434/440][P11] |
| 耗电 / 距离 | 【待实测】没有 USB 与无线的同条件数据。 | 【官方】低电量/弱信号会影响传输；【待实测】续航、米数、吞吐均无可靠 S5 数字。[手册 p.417][P11] | 【官方】待机唤醒仍耗电，GPS 使用增加手机耗电；实际范围待测。[手册 p.439/440][P11] |
| iOS | RN 页面存在，原生 USB 桥尚未接入。[README](../../README.md) | 【推断】协议可另做 iOS 原生桥；需要热点、本地网络与 HTTP 配置，不等于现有 iOS 已支持。[I1][I1]、[I2][I2]、[I3][I3] | 【推断】另做 CoreBluetooth 桥及权限；S5 UUID/握手验证可共享知识。[I5][I5]、[O6P][O6P] |

## 3. 无线接口、连接模式与固件边界

### 3.1 初代 S5 的网络模式

【官方】日本 S5 规格列出 **2.4 GHz（STA/AP，802.11b/g/n）**、**5 GHz（仅 STA，802.11a/n/ac）**、BLE 4.2、WPA/WPA2。部分地区 5 GHz 不可用，应按机身销售地区核对；不能承诺“原版 S5 自建 5 GHz 热点”。[日本规格][P1]、[地区规格][P1E]

| 拓扑 | 证据与工程含义 |
| --- | --- |
| 手机加入相机 AP | 【官方】`Wi-Fi → New Connection → Remote Shooting & View` 显示 SSID；首次确认手机名称，可用密码/QR。它是相机 AP 的普通 Wi-Fi 关联，**不要把 UI 的“直连”假定为 Android `WifiP2pManager` 协议**。【推断】最适合第一轮测试。[连接步骤][P3] |
| 相机与手机加入同一路由器 | 【官方】进入 Remote Shooting & View 后按 DISP，选择 `Via Network`；双方加入同一 AP。【推断】能同时联网，并便于路由器抓包；应关闭 AP 客户端隔离。[P3][P3] |
| 相机加入手机热点 | 【官方】Sync 帮助专列 `Connecting via Tethering`，手机作移动路由器。【待实测】Find X8 热点频段、相机 WPA2 兼容性、宿主手机访问客户端和 UDP 路由；与 Android `startLocalOnlyHotspot()` 的“无互联网本地热点”不是同一功能。[P3][P3]、[本地热点 API][A10] |

【官方】手册的 Wi-Fi `[PC]` 是把已有照片发送到共享文件夹的功能，需要 PC 文件共享/工作组设置；它与 PC(Tether) 的遥控会话不同。官方 Tether 接口表里 S5、S5II、GH6、G9II 都列 **USB**，S5IIX 列 **USB/Ethernet**，BGH1/BS1H 才列 **USB/Ethernet/Wi-Fi**。因此“后继型号支持 Tether/Lab”并不能证明 S5 或这些后继型号都有 Wi-Fi PC tether。[手册 p.451–453][P11]、[Tether 表][P9]

【源码/待实测】libgphoto2 的 `lumix` 是 HTTP 无线驱动；`ptp2` 另有通用 PTP/IP 后端，型号表没有给 Panasonic S5 列出专门的 WLAN 路径。公开证据没有确认 S5 提供 PTP/IP 服务，**这不是已证明所有模式下不存在该服务**；可在已授权实机上检查默认 TCP 15740，但“端口开放”也不足以证明 Panasonic USB 扩展可用。[lumix 驱动][O1]、[PTP/IP 型号表][O1P]、[默认端口][O1PP]

### 3.2 版本边界

| 型号 / 软件 | 公开记录 | 结论 |
| --- | --- | --- |
| 初代 S5 + Sync | 【官方】Sync 1.0.8（2020-09-09）增加 S5；1.0.9（2020-11-24）适配 S5 固件 2.0。[Sync 更新记录][P2] | 基础无线遥控不是 S5II 才有；不要把 2.0 当无线功能首次出现的版本。 |
| 初代 S5 固件 | 【官方】目前支持页列 **2.9，2025-07-29**，内容为安全强化和稳定性改进；2.8 为 2024-10-09。[P12][P12] | 【待实测】2.9 是否改变 HTTP/BLE 认证、密码要求或会话行为，更新说明未公开细节。先记录当前版本并以 2.9 为主要验收条件，不为兼容旧客户端建议降级。 |
| 当前 Sync | 【官方】支持页列 2.0.17（2026-07-22）；S5 仍在适用型号中。[P2][P2] | 用当前 App 做抓包基准；旧手册/旧开源示例不是最新握手保证。 |
| S5II / S5IIX | 【官方】分别在固件 3.1 / 2.1（2024-10-09）加入 Lab 兼容，3.2 / 2.2（2025-01-23）增加 Lab 遥控等功能，且该次变更包含强制 Wi-Fi 密码等安全调整。[S5II][P13]、[S5IIX][P14] | 是独立固件能力，不能套给初代 S5。 |
| G9II / GH6 | 【官方】G9II 2.2 加入 Lab，2.3 加入 Lab 遥控；当前 Lab 兼容列表含 G9II，**不含初代 S5、GH6**；GH6 在 Sync/Tether 列表中。[G9II][P15]、[Lab][P16]、[Sync][P2]、[Tether][P9] | 不应把“GH6 有 Tether”写成“GH6 有 Lab/Wi-Fi tether”。 |

## 4. 已知协议与可参考实现

本节命令来自其他型号的协议观察/源码，除单独标记外均为 **S5 待实测候选**，不是 Panasonic 发布的 S5 网络 API。

### 4.1 HTTP 控制、发现和认证

【源码】旧 GX80 笔记常用 AP 地址 `192.168.54.1`，HTTP 80 上的 `/cam.cgi`；媒体目录通常在 TCP 60606，下载通常在 TCP 50001。地址/服务路径对 S5 应通过连接网络、SSDP `LOCATION`、UPnP device description 解析或用户指定 IP 获得，不能固化旧机身 UUID 路径。[GX80 笔记][O3]、[lumix 驱动][O1]、[pylumix][O4C]

| 用途 | 已见请求 | 证据与边界 |
| --- | --- | --- |
| 旧访问登记 | `mode=accctrl&type=req_acc&value=<client-id>&value2=<device-name>` | 【源码】GX80 用 MEI0 风格 UUID；libgphoto2 用 `value=0`；机身可弹出确认。`setsetting&type=device_name` 是后续注册。S5 2.9 接受的流程待测。[O3][O3]、[O1][O1] |
| 较新会话认证 | `req_acc_g` → 计算 response → `req_acc_e`，后续带 `X-SESSION_ID` | 【源码】G9II 客户端存在这套 challenge/response 与设备名登记，不能将其常量或重试逻辑直接当 S5 认证。[O5W][O5W] |
| 状态 / 保活 | `mode=getstate` | 【源码】既读状态也用于流保活；间隔由实测决定，不能只在 UI 操作时发送。[O1][O1]、[O5W][O5W] |
| 能力与菜单 | `mode=getinfo&type=capability/allmenu/curmenu/lens` | 【源码】适合建立固件/镜头能力白名单，不应凭型号名强开全部命令。[O3][O3]、[O5W][O5W] |
| 摄录 / 回放模式 | `mode=camcmd&value=recmode/playmode` | 【源码】下载/列目录示例会切 playmode；对连续取景的影响必须实测。[O1][O1]、[O4C][O4C] |
| 开 / 关取景 | `mode=startstream&value=<phone-udp-port>` / `mode=stopstream` | 【源码】49152 与 49199 都出现；这里的 value 是**客户端接收端口**，不是“相机固定在该 UDP 端口提供 RTSP”。[O3][O3]、[O1][O1] |
| 取景质量候选 | `mode=setsetting&type=liveviewsize&value=vga`，及查询 `getsetting` | 【源码】旧机身有该设置；QVGA/VGA 候选不代表 S5 可用尺寸，先查 capability/allmenu 并读 JPEG SOF。[O1][O1]、[作者协议帖子][F1] |
| 快门 / AF | `mode=camcmd&value=capture` / `oneshot_af` | 【源码】存在于 G9II 客户端；每次快门只能发送一次，HTTP 200 和 `result=ok` 也不等于文件已存盘。【建议】禁止 HTTP 库自动重试快门。[O5W][O5W] |
| MF 相对移动 | `mode=camctrl&type=focus&value=wide-fast/wide-slow/tele-fast/tele-slow` | 【源码】旧驱动与 G9II 使用相对步进词汇；近/远方向、速度、镜头响应由实测校准。[O1][O1]、[O5W][O5W] |
| Touch AF 候选 | `mode=camctrl&type=touch&value=x/y&value2=on` | 【源码】G9II 源码描述坐标范围 0–1000；S5 的范围、旋转/裁切映射和是否误触快门均待测。[O5W][O5W] |
| 曝光读取 / 调整 | `mode=getsetting&type=iso/focal/shtrspeed`；`mode=setsetting&type=...&value=...` | 【源码】值可能是枚举或编码分数，不能把 `shtrspeed` 字符串直接当微秒，`focal` 在这里是光圈设置名。[O1][O1] |

【源码】HTTP 返回既可能是 XML `<camrply><result>…</result>…`，也可能是逗号分隔的认证响应。`err-unsuitable-app` 等是协议层拒绝，HTTP 状态码不能代替结果解析。【建议】收到未知认证/固件时退出并记录脱敏诊断，不循环尝试不同身份。[旧客户端][O2]、[G9II 解析器][O5W]

### 4.2 UDP 取景

【源码】libgphoto2、pylumix、G9II StreamReceiver 都从 UDP 数据中寻找 JPEG SOI；实现细节不能证明 S5 每个 datagram 都包含一个完整帧。S5 的包头、JPEG 尾、重复帧、截断、IP 分片及可能的应用分包都必须抓包确认，不能照搬 USB 的 180 字节预览偏移。[O1][O1]、[O4C][O4C]、[O5S][O5S]、[USB JPEG 解析器](../../app/src/main/java/cn/moment/lumix/Ptp.java)

【待实测】没有可靠的 S5 Wi-Fi 原始 JPEG 尺寸、独立帧率或端到端延迟数字。旧协议报告 QVGA/VGA；G9II 示例编码器配置 `640x480 / 30` 是客户端参数，**不是 S5 规格，也不是 30 个新画面/秒的测量**。报告不把它换算成“Wi-Fi 约 30 fps”。[协议报告][O1I]、[G9II 接收器][O5S]

【建议】原生 UDP 接收线程独立于 HTTP 控制/下载，先 bind socket 再 startstream；以单调时钟记录完成帧接收时间，设置有界队列与包/帧大小上限。仅在确认 S5 应用分包格式后实现重组；校验 SOI/EOI、JPEG 尺寸并丢弃残帧，不用任意拼接掩盖丢包。将每秒完整帧数、独立画面数、丢帧率、最长 gap 与末帧年龄分开报告。

### 4.3 DLNA / UPnP 目录和原文件

【源码】常见流程是 `playmode` → HTTP SOAP `ContentDirectory:1#Browse` → 从外层 `<Result>` 解析其转义的 DIDL-Lite XML → 逐项读取 `<res protocolInfo=...>`。旧端点常是 `http://<camera>:60606/Server0/CDS_control`，资源 URL 则常为 `http://<camera>:50001/DO....JPG/RW2`。S5 必须以 device description 提供的服务/控制 URL 为准。[O1][O1]、[O4C][O4C]

| 资源标记（其他机型已见） | 解释及选择规则 |
| --- | --- |
| `PANASONIC.COM_PN=CAM_ORG` | 【源码】原 JPEG 候选。[O1][O1] |
| `CAM_RAW_JPG` | 【源码】RAW+JPEG 对中的 JPEG 资源候选，不能因为 MIME 为 octet-stream 就排除。[O1][O1]、[O5W][O5W] |
| `CAM_RAW` | 【源码】RAW 资源，可能 RW2；与 `CAM_RAW_JPG` 区分。[O1][O1] |
| `CAM_LRGTN` / thumbnail / resized | 【源码】浏览用预览，不能降级为 `original.jpg`。[O1][O1] |
| `OriginalFileName` / size / resolution | 【源码】部分机型在属性里暴露原名/大小；S5 是否提供以及是否可靠待测。[O5W][O5W] |

【官方】S5 手册允许发送 JPEG、RAW，发送尺寸含 `Original` 和缩小选项。因此“无线只能得到小图”不是 S5 的硬限制；但**原尺寸与原始字节是两个验收条件**，只有与 SD 卡文件比较 SHA-256 / 文件长度 / EXIF 后，才能承诺原片无重编码。[手册 p.445/466][P11]

【建议】连接准备阶段建立基线，键至少含卡槽、对象 ID/URL、文件名与 size；快门后轮询目录增量，辅以状态/事件，等 SD 写入和文件可读。不能照搬 pylumix 的“最后一个目录项就是新图”，因为该实现假设追加顺序并取第一个 `<res>`；双卡、RAW+JPEG、多控制端及旧文件均可使这种规则选错。[pylumix 实现][O4C]、[Sync 双卡与排序说明][P6B]

【建议】如新图归属有歧义则保存失败诊断，不挑“最大的文件号”；单次遥控阶段限制其他客户端/机身并行快门。在不知道发出的 `capture` 是否被执行时，重新列目录可以重试，**快门不能重发**。完整 JPEG 不可得时，当前 Motion Photo 验收失败，不用缩略图掩盖。

### 4.4 BLE：S5 已知 UUID 与仍未知的控制服务

【第三方实测】`tobiasbrummer/lux-lat-long-log` 明确报告 **初代 S5** 的 BLE GPS 写入、EXIF 对照、关机后再开机重连；作者用 Pixel 8 Pro HCI snoop 与 ESP32 验证。文档未给出机身固件版本，且范围是定位/时钟/会话，**不构成 S5 无线快门、主动唤醒或 Wi-Fi activation 已实现的证据**。[项目状态][O6]、[协议记录][O6P]

| S5 观测中的 service UUID | characteristic UUID | 功能 / 权限（作者记录） |
| --- | --- | --- |
| `054ac620-3214-11e6-ac0d-0002a5d5c51b` | `8d08a420-3213-11e6-8aca-0002a5d5c51b` | 会话初始化，16-byte MEI0 风格 payload，Write。[O6P][O6P] |
| 同上 | `cd7a71a0-3213-11e6-8f56-0002a5d5c51b` | 手机设备名，ASCII，Write。[O6P][O6P] |
| `34738720-3214-11e6-b66b-0002a5d5c51b` | `ead55e60-3216-11e6-a42e-0002a5d5c51b` | 时钟写入（10 bytes），Write；完整语义仍有作者标注的不确定部分。[O6P][O6P] |
| 同上 | `4cf487c0-32a7-11e6-a50d-0002a5d5c51b` | ready/status，Notify，观察到 `01`。[O6P][O6P] |
| `1d74afe0-3214-11e6-8ab4-0002a5d5c51b` | `daff1bc0-3216-11e6-91c8-0002a5d5c51b` | GPS payload（16 bytes），Write。[O6P][O6P] |
| 同上 | `37701b80-32a7-11e6-bb83-0002a5d5c51b` | GPS ready/status，Notify。[O6P][O6P] |

【第三方实测】该作者观察到没有 SMP bonding / 链路加密、使用应用层登记；顺序为 session-init → device-name → 等待 ready 通知 → time → GPS；缩短顺序会断连，固定 MEI0 曾被接受，BLE 地址会变化。**仅限其 S5 观察，不能推为 Panasonic 所有固件无需认证，尤其不能宣称 2.9 可用静态 token。**【建议】按 UUID 发现 characteristic，不硬编码 ATT handle、不以固定 MAC 识别相机；不为核心拍摄擅自改时钟或注入 GPS。[O6P][O6P]

【源码】G9II 项目分别实现 Sync/Lab 风格 challenge/response；Sync 模式用 handle `0x0068` 的 `01/02/04/05` 序列处理快门，`activate_accesspoint()` / `connect_to_accesspoint()` 涉及 `0x004A/0x0030/0x004E`，Lab 又有不同路径。**这些 handle 不可移植到 S5，S5 的 shutter / Wi-Fi enable / SSID / credential / wake characteristic UUID 和 payload 本次未确认。**应抓官方 Sync 的对应动作，再映射到实际 GATT UUID 后实现。[G9II BLE 源码][O5B]

【官方】S5 设置了 Remote Wakeup 后可在 OFF 状态由 Sync 的 Remote shooting 打开并连接 Wi-Fi；单纯 Shutter Remote Control 则不能从 OFF 开机，仅可按设置从 Sleep 返回。因此“GPS 项目重连成功”“BLE 快门”“从休眠唤醒”“从 OFF 待命开机”要作为四个不同验收项。[电源帮助][P8]、[手册 p.434/440][P11]

### 4.5 项目清单、维护与许可

以下“最近活动”统一采用 **GitHub 仓库 `pushed_at`（UTC 日期）**，不采用 `updated_at` 或发布版本日期，也不代表 Panasonic 模块最近改过。每行元数据链接包含查询当天的维护/许可信息；代码引用尽量固定提交。未写验证型号的项目应视为未证实，不能把其宣传列表当实机测试。[GitHub 元数据接口][Ometa]

| 项目 / 语言 | 最近 push | 许可与可复用性 | 型号证据；初代 S5 是否确认 |
| --- | --- | --- | --- |
| [peci1/lumix-link-desktop][O2]，Java + HTML/JS | 2021-01-08；已归档。[元数据][M2] | **BSD-3-Clause 仅覆盖 fork 自 2.0.0 起的改动**；README 明言原始程序许可不清，不能把整库标为可直接 BSD 复用。[许可说明][O2] | README 实测 GH3；大部分兼容 GH4/G6/GM1/FZ1000/GX80/GX85；**未列 S5**。[O2][O2] |
| [cleverfox/lumixproto][O3]，协议笔记 | 2018-07-18。[元数据][M3] | 无 LICENSE / GitHub license=null，适合作为事实线索，不直接拷贝表达或代码。[树][O3T] | GX80 协议；**未确认 S5**。[O3][O3] |
| [palmdalian/python_lumix_control][O7]，Python | 2017-07-05。[元数据][M7] | MIT。[LICENSE][O7L] | README 泛称 Panasonic Wi-Fi、参考 GH3 研究，未给严谨实测列表；**未确认 S5**。[O7][O7] |
| [abichinger/pylumix][O4]，Python | 2026-02-09。[元数据][M4] | MIT。[LICENSE][O4L] | README 称 Image App capable，无型号实测列表；有完整客户端但认证结果/新文件选择需加强，**未确认 S5**。[O4][O4]、[代码][O4C] |
| [gphoto/libgphoto2][O1R]，C | 2026-10-05（整个仓库）。[元数据][M1] | 项目 LGPL-2.1；`lumix.c` 文件头为 LGPL-2.0-or-later；直接链接/移植需按具体文件许可证处理。[O1][O1]、[M1][M1] | HTTP `Panasonic:LumixGSeries` 仍标 experimental；issue 作者可测试 G80/GH4，**没有该 issue 的 S5 无线实测**；通用 PTP/IP 存在不证明 S5 支持它。[O1][O1]、[O1I][O1I]、[O1P][O1P] |
| [Aikhjarto/LUMIX-G9II-Remote-Control][O5]，Python/bleak | 2024-12-31。[元数据][M5] | GPL-3.0；作为协议证据阅读，不能未经许可分析复制成 MIT App 代码。[LICENSE][O5L] | 明确目标 DC-G9II/G9M2，HTTP/UDP/BLE 都有代码；**不确认 S5**。[O5][O5] |
| [tobiasbrummer/lux-lat-long-log][O6]，C++/ESP32 + Python | 2026-07-04。[元数据][M6] | MIT。[LICENSE][O6L] | **S5 BLE GPS、EXIF、重连硬件验证**；未说明固件版本，未验证本项目的无线取景/下载闭环。[O6][O6]、[O6P][O6P] |
| [auberginehill/panasonic-html-image-app][O8]，HTML/JS | 2019-05-17。[元数据][M8] | BSD-3-Clause 元数据；继承 lumix-link 的来源，保留原许可不清的审查风险。[LICENSE][O8L]、[O2][O2] | 旧 Image App 请求目录；**未给 S5 实机验证**。[O8][O8] |
| [davidkim9/LumixController][O9]，JS/Electron | 2017-03-07。[元数据][M9] | 无许可证文件，GitHub license=null，不能直接复用。[目录][O9T] | 代码有拍摄/下载，README 甚至要求重设文件编号/配置 offset；未列明确验证机型，**不确认 S5**。[O9][O9] |
| [laurentmmeyer/lumix-gx80][O10]，Python | 2026-06-27。[元数据][M10] | 无许可证文件。[目录][O10T] | 作者记录 GX80 原文件批量下载，不是 S5 实测；只作协议和验证线索。[作者实测][F2] |
| [LennyObez/studio-camera][O11]，Kotlin Multiplatform | 2026-02-24。[元数据][M11] | 自定义 source-available，限制商业/再分发，不是一般开源许可。[LICENSE][O11L] | README 宣称 Panasonic cam.cgi + UDP；核查提交时 `core/data/camera/panasonic/` **仅 `.gitkeep`**，不可当成熟 Kotlin 实现或 S5 证据。[目录树][O11T] |
| [larszu/lz-camera-bridge][O12]，TypeScript | 2026-10-13。[元数据][M12] | Proprietary，禁止未经书面同意复用/移植源代码。[LICENSE][O12L] | README 列 S1/S5/GH5/GH6 并标 verified，但说明其 verified 可指公开文档/参考核查；**没有据此确认原 S5 实机闭环**。[O12][O12] |

【检索结论】Home Assistant 官方列表中的 Panasonic 集成主要是其他产品；本次没有找到带初代 S5 实机说明的成熟专用 HA 集成。`gkoh/furble` 的 Panasonic 支持 issue 提到 HA 自动化设想，不能把设想算作已支持；如以后桥接 MQTT/HTTP，应建立在已经验证的客户端之上。[官方集成目录][H1]、[furble issue][H2]

## 5. Motion Photo 的性能与质量判断

### 5.1 三秒缓冲是否成立

【推断】若 S5 能向 phone 稳定提供连续完整 JPEG，缓存三秒不需要相机“预录”新功能；它是手机保存已收到的帧。拍照后可以先 stopstream，再进入 playmode 下载，完成后回 recmode 并重新填满缓冲。这个顺序适应现有 pre-only 设计，但一次照片下载期间不能继续宣称“下一张已缓存三秒”。[现有引擎](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java)、[其他机型模式切换][O4C]

【建议门槛】维持 `FrameRing` 的三秒窗口及 ≤500 ms 最长 gap，不放宽成“有旧帧就能拍”；另加独立帧率、末帧年龄、预览停滞检测。目标可先设“典型场景 ≥10 个新画面/秒，争取 ≥15”，这是产品验收建议，不是 S5 已知能力。15 fps 编码器复制帧不会提高源画面信息量。[缓存实现](../../app/src/main/java/cn/moment/lumix/FrameRing.java)、[编码器](../../app/src/main/java/cn/moment/lumix/VideoEncoder.java)

【待实测】官方“边取景边遥控拍照”没有说明曝光、写卡、auto review、AF 或 mode switch 是否暂停流。【官方】Auto Transfer 开启时 `[Wi-Fi Function]` 不可用；不要设计成同时开启该功能与 Remote Shooting & View 来免费获得原图推送。第一版显式拉取 JPEG，Auto Transfer=OFF。[遥控][P4]、[Auto Transfer 限制][P6]

### 5.2 图片速度、RAW 与动态质量

【待实测】不存在可引用的“初代 S5 原片一定 N 秒下载完”数据。按照片大小 `S` 和**实测**有效吞吐 `R` 估算，传输下限 `T ≈ 8S/R`；例如假设 12 MiB JPEG、20 Mbit/s，有效传输约 5 秒，尚不含写卡、索引刷新、模式切换和解码。这是算例，不是 S5 实测；重复拍摄节奏可能明显慢于使用线缆。

【官方/源码】RAW 可无线传输，不代表当前 App 会开发 RW2；RAW+JPEG 的下载应挑 JPEG 原始资源，RAW-only 若只有内嵌预览就不满足本项目原尺寸 JPEG 契约。第一阶段继续要求 JPEG 或 RAW+JPEG，并保存原卡文件不删除。[手册 p.445][P11]、[资源类型][O1]、[当前边界](../../README.md)

【推断】静态照片通过 SD 卡 SHA-256 对照后可与 USB 保持相同质量/EXIF；动态部分由 Wi-Fi JPEG 源尺寸、压缩、裁切、更新率决定，可能只有 VGA 或其他尺寸，并且在干扰下抖动更大。≤960 是输出上限，不能把小流放大到 960 后称为同等细节。手机麦克风、LUT 和现有封装可复用，但 Wi-Fi 取景时间戳是**接收时间**，相机画面延迟与网络快门延迟应分别校准。[编码/音频现状](../../README.md)、[无线源未定][O5S]

【待实测】耗电和范围没有可靠定量结论。【官方】S5 要求传输时电量充足，低电量或信号变差可断连/造成不完整传输；Remote Wakeup 在 OFF 时继续运行 BLE。**【推断】**持续 Wi-Fi、JPEG 处理与屏幕显示会增加系统负载，BLE 待命不能代表持续无线取景的耗电；应在同一镜头/亮度/设置下量测。[手册 p.417/440][P11]、[BLE 低功耗定位][P1]

## 6. Android 接入与 Find X8 验证约束

### 6.1 相机 AP 与互联网共存

【官方】Android 10+ 的 `WifiNetworkSpecifier` / `requestNetwork()` 可请求本地设备网络，连接需系统用户授权；请求中去掉 `NET_CAPABILITY_INTERNET`。该 API 自身不为 App/设备提供互联网。收到 `onAvailable(Network)` 后，再用这个明确的 Network 通讯并持有 callback，结束时释放。[A1][A1]

【官方/建议】优先相机 HTTP 用 `network.openConnection()` 或基于 `network.getSocketFactory()` 的独立客户端，UDP 用 `network.bindSocket(DatagramSocket)`（在 connect 之前）；互联网业务保留默认网络。`ConnectivityManager.bindProcessToNetwork(cameraNetwork)` 会让该进程未来 socket/DNS 都偏向相机网络，适合隔离的诊断/原型，却会令该进程互联网请求也走无网 AP；如使用，断开必须 `bindProcessToNetwork(null)`。已创建的 socket 还需单独管理，不能靠解绑复活连接。[Network API][A2]、[ConnectivityManager][A3]

【官方/待实测】支持 STA 并发的设备可把本地网络放在 secondary STA；应查询 `isStaConcurrencyForLocalOnlyConnectionsSupported()`，**不能因 Find X8 有 Wi-Fi 多天线/加速营销就认定一定支持所需双 STA**。单 STA 设备上“相机 AP + 蜂窝互联网”与“两条 Wi-Fi 同时在线”是不同情况。[WifiNetworkSpecifier][A4]、[OPPO 产品资料][C1]

### 6.2 权限与原生网络

| 项目 | 要求及方案 |
| --- | --- |
| 基础网络 | 【官方】局域网 socket 通讯需要 `INTERNET`；观察/请求网络按调用声明 `ACCESS_NETWORK_STATE`、`CHANGE_NETWORK_STATE` 等，不把互联网可达作为相机连接的就绪条件。[A3][A3]、[A11][A11] |
| Android 13+ Wi-Fi | 【官方】管理附近 Wi-Fi 连接请求 `NEARBY_WIFI_DEVICES` 运行时权限；不推导位置才可 `neverForLocation`。直接 `startScan/getScanResults` 仍需要 `ACCESS_FINE_LOCATION`；不要一概写“Android 13 不用定位”。建议使用已知 SSID/QR 与 specifier，尽量避免主动广泛扫描。[A5][A5] |
| BLE | 【官方】Android 12+ central 扫描/连接需 `BLUETOOTH_SCAN`、`BLUETOOTH_CONNECT`；不做 peripheral 则通常不需 ADVERTISE。`neverForLocation` 有过滤部分 beacon 的可能，S5 广播必须验证；若主动获取 GPS/geotag，另申请实际定位权限。[A6][A6] |
| UDP 与 multicast | 【源码/官方】live view 接收端口通常是单播 UDP，不能因“UDP”就一直持有 MulticastLock；SSDP 发现用组播时才短暂使用该锁、声明 `CHANGE_WIFI_MULTICAST_STATE` 并及时释放。[O1][O1]、[A7][A7] |
| 明文 HTTP | 【官方】target 28+ 默认不允许明文 HTTP；要给相机专用客户端配置明确策略。动态 IP 的配置不能简单等同固定域名白名单。【建议】只允许已确认相机网络/地址/端口，不跟随资源重定向到任意外网，XML 禁止外部实体。[A8][A8] |
| 后台与生命周期 | 【官方】BLE 进程被杀会断连，后台启动 foreground service 有限制。第一版沿用现有“离开前台停止采集并释放连接”；若将来确需后台连接，再设计 `connectedDevice` FGS/CompanionDeviceService，不依赖永久扫描或 WorkManager 维持 15 fps。[A9][A9]、[现有行为](../../README.md) |
| 新 Android 版本 | 【官方】Android 16 本地网络限制为 opt-in；当前文档规定 target 37+（Android 17）需 `ACCESS_LOCAL_NETWORK`，target≤36 不应提前请求此新权限。实施时按实际 target/系统重新核对，避免只写 API 33 权限矩阵。[A11][A11] |

【建议】HTTP 控制、UDP 接收和文件下载留在 Java/Kotlin 原生层；RN 只接收状态/参数/已有预览事件，不把每个包经 JS 线程再拼接。保留有界帧队列，下载流式落临时文件，长度/格式通过后原子发布；取消时关闭所有 socket，递增 session epoch，使上一网络的数据无法配对下一次快门。

### 6.3 ColorOS / OPPO Find X8

【官方】Find X8 首发 ColorOS 15；OPPO 较早 ColorOS 文档有双 Wi-Fi/网络加速等功能，官方帮助也说明单条数据流不能因为双 Wi-Fi 自动提速。**【待实测】**这些资料没有证明 Find X8 某一当前固件可稳定接收 S5 AP 的 UDP、支持特定双 STA 或不切走无互联网网络。[Find X8 发布][C1]、[历史 ColorOS 手册][C2]、[OPPO 双 Wi-Fi 帮助][C3]

【建议测试矩阵】记录 Find X8 型号/地区、ColorOS 完整 build、Android 版本、App target；分别测试蜂窝开/关、智能选网/双网络加速开/关、VPN开/关、屏幕旋转、锁屏/返回、30 分钟监看。先用 `adb shell dumpsys connectivity` 确认相机网络和默认蜂窝网络，再看 socket 绑定与回调；“系统提示无互联网”不直接算相机故障。只有抓到回调/路由变化后才归因 ColorOS，避免把未验证的 OEM 怪癖写成确定原因。

## 7. iOS 简要评估

【官方/建议】使用 `NEHotspotConfiguration` 配合 Hotspot Configuration entitlement 加入已知相机 SSID；`apply` 会提示用户授权，完成回调只证明配置已应用，不证明已关联或 IP 网络已就绪，应再验证服务可达；另保留手动到设置加入的入口。`joinOnce=true` 的配置会在后台超过15秒、设备休眠等条件下移除并断开，生命周期需实测，不能据 Android 实现宣称 iOS 自动配网完成。[entitlement][I1]、[apply][I1A]、[joinOnce][I1J]

【官方】本地相机 HTTP/UDP 通讯受 Local Network Privacy 影响，需 `NSLocalNetworkUsageDescription`；SSDP 组播/广播需相应 multicast entitlement，**单播 UDP 取景本身不需 multicast entitlement**。可在第一版通过已知 IP / QR 跳过组播发现；拒绝本地网络授权时要显式错误。[Apple TN3179][I2]、[multicast entitlement][I4]

【官方/建议】ATS 的局域网 HTTP 策略需按 `NSAllowsLocalNetworking` 等当前规则核对：Apple 文档指出 iOS 17 起不再默认放行 IP 地址，可在 `NSExceptionDomains` 添加 IP/CIDR 例外，不能照抄旧版本“局域网自动豁免”的假设。CoreBluetooth 要配置 `NSBluetoothAlwaysUsageDescription`；网络/蓝牙原生桥、权限生命周期和断网取消都要独立实现。现有 RN iOS 页面与 Android Motion Photo 输出并不等同 Apple Live Photo 支持。[ATS][I3]、[BLE 权限说明][I5]、[项目现状](../../README.md)

## 8. SDK、许可和稳定性风险

【官方】Panasonic 的公开产品叫 **LUMIX SDK / LumixRemoteControlLibrary**，提供 DLL、headers、API 文档和 sample；支持列表含 S5、S1/S1R/S1H、S5II/IIX、S9、GH5 家族、G9/G9II、GH6/GH7、BGH1/BS1H。页面指定 Windows 10 64-bit / Visual Studio 2015；S5 这一组下载 Beta1.00（2020-10-14）支持 USB，BGH1/BS1H Beta2.01（2022-08-08）有 USB/Ethernet。页面没有提供 S5 Wi-Fi、Android 或 iOS SDK。[SDK 下载说明][P10]

【官方】下载需接受 SDK EULA 并提供相机序列号。本研究**没有输入序列号、接受协议或下载 SDK 二进制**，只读取公开页面。EULA Article 1 限定开发/运行及不可分离分发 DLL 的条件；Article 6 禁止 SDK 的逆向（sample code 例外）；Article 8 限制将 GPL/LGPL 及类似强制许可义务软件与 SDK/Developed Software 结合；还有免责、终止和品牌条款。**不要把闭源 DLL/sample 自动当 MIT 素材。**[SDK 页面][P10]、[EULA][P10L]

【推断/待确认】公开的协议互操作事实与 SDK 软件、App 反编译成果、厂家商标是不同对象；上述 SDK EULA 不是“所有自写 HTTP 客户端均违法”的证据。本次没有取得并审阅当前 Sync 安装时完整 ToS，不能给出所有地区的合法性保证。建议基于自有 S5 的授权通讯记录独立实现，只借用许可清晰的代码并保留 NOTICE；发行前针对实际采用的资料/许可证/地区作专门核查，不修改固件、不规避机身确认。[SDK EULA][P10L]、[项目来源政策](../../NOTICE.md)

【推断】最大运行风险是未公开协议随安全固件改变、控制优先权被另一 App 抢占、模式切换中断流、SD 卡目录延迟，以及非幂等 `capture` 在网络超时后被重发。S5 2.9 确有安全更新但细节不明；较新型号的官方说明也展示连接/功能可因固件改变，所以应保存“型号+固件+App版本+镜头”的协议能力快照，默认关闭未验证命令。[S5 固件][P12]、[S5II 固件变化][P13]

## 9. 推荐架构（建议，不是本次实现）

在 `CaptureEngine` 与传输之间新增 `CameraTransport`，让 `UsbS5Transport` 包装现有 `UsbS5`，与 `WifiS5Transport` 并列；BLE 放在可选 `BleS5Bootstrap`，作为发现/登记/唤醒/网络激活通路。Wi-Fi 就绪后主拍摄只用**一个**控制通路发送快门，避免 BLE+HTTP 双触发。

```text
RN 拍摄 UI → CaptureEngine → CameraTransport
                            ├─ UsbS5Transport → UsbS5 / PTP
                            └─ WifiS5Transport
                               ├─ Android NetworkSession / iOS NetworkSession
                               ├─ 串行 HTTP 控制 + 保活
                               ├─ 独立 UDP 完整 JPEG 接收
                               └─ MediaCatalog + 新文件确认 + HTTP 下载
可选 BleS5Bootstrap → 登记 / 唤醒 / Wi-Fi 激活 → NetworkSession
完整 JPEG 帧 → 现有 LUT / FrameRing → VideoEncoder
本次原始 JPEG → 校验 → 原片保存 → MotionPhoto / MomentStore
```

建议接口暴露 `connect/close`、能力表、带 session epoch 和单调时间戳的预览、`autofocus/focusStep/readExposure`、`prepareCaptureBaseline`、**只派发一次的** `shutter`、`awaitNewJpeg/downloadOriginal`，不要让公共引擎依赖 PTP integer handle；Wi-Fi 资源 ID 可能是复合键/URL。

建议状态机：连接 → 身份/能力核对 → 准备索引 → 取景缓存 → 可拍 → 冻结按钮边界 → 快门单次派发 → 确认新 JPEG → 下载验证 → 合成 → 回到取景并重建三秒缓存。网络断开或结果不确定时退出当前会话，保留已收到的原片与失败元数据；参数轮询不得占住快门前工作队列。不要为下载重新自动建立并重发拍摄任务。

## 10. 分阶段实施计划与工期估算

以下按一名熟悉 Android 原生桥与相机协议的开发者估算，单位为人日；设备可随时使用，等待借机/反馈、商店审核与固件变化另计。估算是【推断】，不是交付承诺。

| 阶段 | 内容 | 估算 | 退出条件 |
| --- | --- | --- | --- |
| P0：无相机协议骨架 | 仅独立 client/fixture 设计，XML/认证/资源选择/UDP 校验、超时状态机；不接 App | 1–2 | 文档/录制响应可解析；明确标记没有硬件验证 |
| P1：原 S5 可行性关卡 | 当前固件、Sync 对照抓包、curl 认证、10 分钟取景、单次快门、新文件与原片 SHA 对比；先手动网络连接 | 2–3 | 通过下节 T1–T5；失败则停止声称完整 Wi-Fi Motion Photo 可行 |
| P2：Android Wi-Fi 通路 | NetworkSpecifier、socket 绑定、权限、HTTP/UDP、断线/取消；传输抽象并保留 USB | 3–5 | Find X8 相机数据与蜂窝互联网共存；权限拒绝/重连可靠 |
| P3：媒体闭环 | 预备目录基线、原片下载、三秒帧质量门槛、现有 LUT/编码/导出接入 | 3–5 | 30 次单拍无错配、无重复快门，原片校验通过；明确展示 Wi-Fi 动态质量 |
| P4：可靠性与诊断 | 双卡/慢写卡、低电量、旋转、30 分钟监看、版本与错误矩阵 | 2–3 | T6–T9 通过，USB 原行为未回归 |
| P5：可选 BLE | S5 HCI/GATT 精确捕获；会话、唤醒、Wi-Fi 激活；失败能手动连 Wi-Fi | 3–5 | T10 通过，且确认没有双发快门；不靠未知 handle |
| P6：可选 iOS | 热点/本地网络权限、UDP/HTTP/CoreBluetooth 原生桥及媒体流程 | 4–7 | 独立 iPhone 实机验收；Apple Live Photo 封装另立任务 |

建议 Android 核心（P0–P4）先按 **11–18 人日**评估；BLE 和 iOS 都做时共 **18–30 人日**。P1 没有通过，后续工期不应以“已支持 S5”为前提。

### 无相机可做的安全 PoC（本次只描述，不实现）

可以另做一个不含自动发现/真实快门调用入口的小型协议库，用公开示例或经授权、脱敏的 recorded fixtures 验证：XML `<result>` 错误不能被 HTTP 200 掩盖；CSV/session header；外层 SOAP → 内层 DIDL 两次解析；同一 item 多个 `<res>` 中选 `CAM_ORG/CAM_RAW_JPG` 而拒绝缩略图；双卡增量和歧义拒绝；完整/残缺/重复 UDP JPEG；网络超时后不重发快门。已有源码提供这些协议结构，故【推断】该 PoC 无相机可做，但它只验证解析/状态机，不验证 S5 握手、画质、时序或射频能力。[O1][O1]、[O4C][O4C]、[O5W][O5W]

fixtures 需记录来源 URL/提交、许可和目标机型；若许可不清，不复制原文/代码，使用自己生成的最小结构样例。GPS、SSID、密码、MAC、serial、session token 从记录中脱敏；原始 pcap/bugreport 不入仓库。S5 BLE 作者也明确排除含真实 GPS 的原始抓包。[O6][O6]

## 11. 必须在实体初代 S5 上验证的清单与操作

以下均为**未来测试步骤**，本次没有执行。必须用机身菜单/设备信息确认 `DC-S5`，记录固件、地区、镜头、卡槽/SD 卡、JPEG设置、手机/OS/Sync版本；先 JPEG L、单张、短快门、Auto Transfer=OFF，保存完整原片对照。关闭其他遥控 App；需要与 Sync 对照时分开会话。测试不得删卡文件、重置文件号、更新/降级固件或循环发快门。

### T1：连接、发现与实际认证

1. 用当前 Sync 分别连接相机 AP、路由器、Find X8 热点；记录 AP 实际频段、DHCP 地址、SSDP description 中型号/固件/服务 URL。
2. 在同一路由器上抓当前 Sync 的最初连接，确认是 `req_acc` 还是 `req_acc_g/e`、是否有 `X-SESSION_ID`、何时机身确认。初代 S5 2.9 不能拿 G9II 的认证常量冒充。
3. 只在已加入自己的相机网络、确定 IP 后运行以下 **旧协议候选**；`192.168.54.1` 只是旧 GX80 常见默认值，需要替换成实际值。不要用 curl 的自动重试选项。[旧请求来源][O1]、[O3][O3]

```sh
CAMERA_IP=192.168.54.1 # 改成 S5 的实测 IP
CAMERA_BASE="http://${CAMERA_IP}"

# 若抓包确认 S5 使用这个旧登记协议；机身屏幕需手动接受真实设备名。
curl --max-time 5 -i --get "${CAMERA_BASE}/cam.cgi" \
  --data-urlencode 'mode=accctrl' --data-urlencode 'type=req_acc' \
  --data-urlencode 'value=0' --data-urlencode 'value2=moment-s5-research'

curl --max-time 5 --get "${CAMERA_BASE}/cam.cgi" \
  --data-urlencode 'mode=getstate' -o getstate.xml
curl --max-time 5 --get "${CAMERA_BASE}/cam.cgi" \
  --data-urlencode 'mode=getinfo' --data-urlencode 'type=capability' -o capability.xml
curl --max-time 5 --get "${CAMERA_BASE}/cam.cgi" \
  --data-urlencode 'mode=getinfo' --data-urlencode 'type=allmenu' -o allmenu.xml
```

若 S5 实测使用 session header，后续请求带抓到并由合法登记获得的值；不要在日志/仓库保存它。成功条件是协议 `ok`、机身确认和型号读取一致，而非仅 HTTP 200；拒绝时保留脱敏响应并停止此候选流程。

### T2：UDP 帧结构、尺寸、更新率与延迟

先在测试电脑另一个终端开启 UDP listener（例如安装了 socat 的环境），再发送 startstream；同时用 pcap 保留 datagram 边界。listener 的平铺字节文件仅用于人工 JPEG 观察，不能拿它证明分包格式。[端口/帧来源][O1]、[O3][O3]

```sh
# 终端 A：监听客户端端口；只保存样本，不执行收到的数据。
socat -u UDP4-RECV:49152,reuseaddr - > preview-sample.bin

# 终端 B：已完成 T1 会话后执行；需要 session header 时自行加入。
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=camcmd&value=recmode"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=startstream&value=49152"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=getstate"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=stopstream"
```

在开启流期间，以基于实测需求的周期发 getstate（由测试客户端/Sync进行）；上述一次请求不保证无限保活。每个机身提供的 liveviewsize 都量测 60 秒：JPEG SOF尺寸、完整帧数、画面变化时的独立帧数、丢包/截断、最长 gap、包长及分片。用数字计时器/闪烁 LED 同时入相机画面，并外部高速录像拍到场景和手机屏幕，测量画面显示延迟的分布；UDP 到达间隔不是端到端延迟。

### T3：对焦、曝光与单次快门的流中断

先按 capability 验证只读曝光；然后分别测试单次 AF、touch-AF、MF 近/远慢步进，每个镜头单独标定；Touch Shutter 要明确关闭。以下是其他机型候选，只有 T1/T2 和能力核对后才依次人工执行；**capture 只运行一次**，需要重做测试时必须先核对 SD 卡是否已有本次照片。[命令来源][O5W]、[O1][O1]

```sh
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=getsetting&type=iso"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=getsetting&type=focal"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=getsetting&type=shtrspeed"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=camcmd&value=oneshot_af"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=camctrl&type=focus&value=wide-slow"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=camctrl&type=focus&value=tele-slow"
curl --max-time 5 "${CAMERA_BASE}/cam.cgi?mode=camcmd&value=capture"
```

记录按钮边界、HTTP 派发/应答、快门声/外部视频、SD access、最后/下一取景帧时间。分别短快门、1 秒、长曝光及机身 auto review 开/关；确认 HTTP 超时是否已经拍照，确认原片下载/回放会不会停止流，以及回 recmode 后是否需重新 startstream。成功条件是单次命令对应一张新 JPEG，无自动重拍；不要求快门期间无黑屏。

### T4：DLNA 和“本次原片”校验（核心关卡）

在快门前建立目录基线，快门后轮询新对象；测 recmode 下可否 Browse，必要时快门后切 playmode。以下 SOAP 是旧 endpoint 的模板；**`CDS_CONTROL` 必须替换为 S5 description 公布的 control URL**，再由 XML 解析器读取 Result/DIDL。[SOAP 模板来源][O4C]、[O1][O1]

```sh
CDS_CONTROL="http://${CAMERA_IP}:60606/Server0/CDS_control" # 用发现结果替换
cat > browse.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
 s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
 <s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"
  xmlns:pana="urn:schemas-panasonic-com:pana">
  <ObjectID>0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>
  <StartingIndex>0</StartingIndex><RequestedCount>20</RequestedCount><SortCriteria/>
  <pana:X_FromCP>LumixLink2.0</pana:X_FromCP>
 </u:Browse></s:Body>
</s:Envelope>
XML
curl --max-time 10 "${CDS_CONTROL}" \
  -H 'Content-Type: text/xml; charset="utf-8"' \
  -H 'SOAPAction: "urn:schemas-upnp-org:service:ContentDirectory:1#Browse"' \
  --data-binary @browse.xml -o browse-response.xml
```

分页遍历直到拿到需要的基线/增量，不能只用前 20 项证明“卡上只有 20 张”。选新 item 的原 JPEG URL（`CAM_ORG` 或经验证的 `CAM_RAW_JPG`），确认主机/端口属于相机；复制解析出的实际值到变量后下载，不自行拼接 DO/编号。[资源规则来源][O1]

```sh
# 下列路径为文档示例，必须替换成新 item 的真实原 JPEG URL。
ORIGINAL_URL="http://${CAMERA_IP}:50001/DO00000000.JPG"
curl --max-time 60 --dump-header original-headers.txt \
  "${ORIGINAL_URL}" -o wifi-original.jpg

# sd-original.jpg 用读卡器复制本次 SD 卡文件；不删除机身原片。
shasum -a 256 wifi-original.jpg sd-original.jpg
cmp wifi-original.jpg sd-original.jpg
# 如果装了 exiftool，检查像素、时间、方向和 EXIF：
exiftool -ImageWidth -ImageHeight -DateTimeOriginal -Orientation wifi-original.jpg
```

量测 `shutter → item可见 → HTTP可读 → 全部接收 → 校验完` 的分段延迟和有效吞吐；JPEG L/M、RAW+JPEG、RAW-only 都试。全尺寸但 SHA 不同须查明 EXIF/重编码差异，不能标“原始字节保留”。重复测试 30 次，以拍到唯一编号/图案确认每次文件归属；双卡同名不能误配。

### T5–T10：稳态、异常、射频与 BLE

| 编号 | 必须验证什么 | 建议步骤 / 通过条件 |
| --- | --- | --- |
| T5 | 三秒 pre-only 闭环 | 实际收到帧的单调时间戳建立三秒窗，过门槛后冻结，单发快门、取 T4 原图、复用既有封装；断流不能插入快门后帧；按按钮至曝光的误差另测。 |
| T6 | 连续与 mode switch | 至少 30 分钟 UDP取景、30 次单拍；记录内存/帧 gap、保活、playmode/recmode 重新启动、镜头切换后的能力更新。 |
| T7 | SD/双卡/错误 | RAW+JPEG 分卡、卡槽切换、慢卡/满卡/无卡、长曝光、另一 App 争用；归属不明就报错，不能退回旧图。 |
| T8 | Android/OEM 路由 | 按第 6 节矩阵测蜂窝并行、自动切网、权限拒绝/撤销、网络丢失；`dumpsys connectivity` 与 native callbacks 证明实际绑定，后台停止后回到 App 必须重填缓冲。 |
| T9 | 范围/耗电 | 相同镜头、屏幕亮度、取景模式/曝光，USB与2.4 GHz AP/5 GHz STA各量测30分钟电量变化；距离1/5/10m及隔墙逐级记录丢帧/吞吐/重连，记录具体环境，不能推为通用最大范围。 |
| T10 | S5 BLE 精确协议 | 官方 Sync 分别做注册、仅快门、Sleep唤醒、OFF Remote Wakeup、Wi-Fi AP 激活/路由器连接；抓HCI，对每个写入映射实际UUID、属性、通知、认证。记录固件并核对 O6 UUID；陌生 characteristic 不试写，不复用 G9II handle。 |

**抓包建议：**【源码/官方】G9II 作者提供路由器 tcpdump 与 Android HCI snoop 方法，Android 官方也提供 Bluetooth bugreport 调试说明。只能捕获自己的相机/测试手机，记录可能含 credential/location，分享前脱敏。[作者抓包说明][O5]、[Android 官方调试][A12]

```sh
# OpenWrt 等测试路由器：CAMERA_IP 先改成该网络中 S5 的真实地址。
# br-lan 是否可见端口转发流量由路由器实际 bridge/offload 决定，必要时调整接口。
tcpdump -i br-lan -s 0 -w s5-sync.pcap "host ${CAMERA_IP}"

# 测试电脑与相机直接连接时，改成电脑真实 Wi-Fi 接口。
tcpdump -i en0 -s 0 -w s5-client.pcap "host ${CAMERA_IP}"

# 只检查自有相机的候选 PTP/IP 端口，不发拍摄操作。
nc -vz -w 3 "${CAMERA_IP}" 15740

# Android：先在开发者选项开启 Bluetooth HCI snoop logging，必要时重启蓝牙。
adb bugreport s5-ble-bugreport.zip
adb shell dumpsys connectivity > connectivity.txt
```

Wireshark 关注 `http`、`udp.port == 49152 || udp.port == 49199`、`ssdp`、`btatt` / `btsmp`。AP 抓包失败不能推断相机未发包：路由器 offload、站间转发、权限、接口选择都要核对。BLE 原始日志完整性（系统可能截断/过滤）、GATT handle→UUID、是否 SMP 加密都需复查；一份 GPS 会话不能覆盖主动唤醒或认证差异。

## 12. 参考资料

下面的引用均在 2026-10-14 调研；厂家网页、固件/平台政策和 GitHub 活动字段会变化。官方型号入口所链接的 Sync 通用页面按 **S5 入口的导航关系**使用；具体固件不一致时，以实机菜单与通讯为最终兼容性证据。

- Panasonic： [初代 S5 日本规格][P1]、[地区规格][P1E]、[Sync 支持及更新记录][P2]、[S5 型号入口][P2S]、[配对][P2B]、[Wi-Fi / 路由器 / 热点][P3]、[取景与参数][P4]、[AF/MF/touch-AF][P5]、[图片/自动传输][P6]、[导入/双卡][P6B]、[BLE快门][P7]、[电源操作][P8]、[Tether型号接口表][P9]、[SDK][P10]、[SDK EULA][P10L]、[S5 高级说明书][P11]、[S5 2.9更新][P12]、[S5II更新][P13]、[S5IIX更新][P14]、[G9II更新][P15]、[Lab适用型号][P16]。
- 协议与实现： [libgphoto2 lumix源码][O1]、[PTP/IP源码][O1P]、[作者讨论 issue 409][O1I]、[lumix-link-desktop][O2]、[GX80协议笔记][O3]、[pylumix][O4]、[G9II项目][O5]、[S5 BLE项目][O6]、[S5 GATT记录][O6P]、[Python早期客户端][O7]、[HTML Image App][O8]、[JS LumixController][O9]、[GX80下载脚本][O10]、[Kotlin项目声明与目录][O11]、[TypeScript桥接项目][O12]。
- 第一手补充观察： [GH3/GH4协议作者论坛讨论][F1]、[GX80作者抓取原片记录][F2]；这些不是 S5 实测。 [Home Assistant 集成目录][H1]、[furble Panasonic支持讨论][H2]。
- Android： [Wi-Fi Network Request][A1]、[Network socket绑定][A2]、[ConnectivityManager][A3]、[双STA条件][A4]、[Wi-Fi权限][A5]、[BLE权限][A6]、[MulticastLock][A7]、[明文网络配置][A8]、[BLE后台限制][A9]、[本地热点][A10]、[局域网权限演进][A11]、[Bluetooth调试][A12]。
- Apple / OPPO： [HotspotConfiguration entitlement][I1]、[apply配置与授权][I1A]、[joinOnce][I1J]、[TN3179局域网权限][I2]、[ATS局域网配置][I3]、[组播entitlement][I4]、[蓝牙用途说明][I5]、[Find X8发布][C1]、[历史ColorOS手册][C2]、[双Wi-Fi帮助][C3]。
- 本项目： [README](../../README.md)、[DESIGN](../../DESIGN.md)、[UsbS5.java](../../app/src/main/java/cn/moment/lumix/UsbS5.java)、[Ptp.java](../../app/src/main/java/cn/moment/lumix/Ptp.java)、[CaptureEngine.java](../../app/src/main/java/cn/moment/lumix/CaptureEngine.java)、[FrameRing.java](../../app/src/main/java/cn/moment/lumix/FrameRing.java)、[VideoEncoder.java](../../app/src/main/java/cn/moment/lumix/VideoEncoder.java)、[NOTICE](../../NOTICE.md)。

[P1]: https://panasonic.jp/dc/products/DC-S5/spec.html
[P1E]: https://www.panasonic.com/lv/consumer/foto-un-video-kameras/lumix-s-fotokameras/dc-s5.specs.html
[P2]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/index.html
[P2S]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/DC-S5.html?modelnm04=S5
[P2B]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/connect_bt.html
[P3]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/connect_wf.html
[P4]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/rem_basic.html
[P5]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/remote.html
[P6]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/frd.html
[P6B]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/playback.html
[P7]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/adv_sht_rmt.html
[P8]: https://av.jpn.support.panasonic.com/support/global/cs/soft/lumix_sync/en/adv_rem_wu.html
[P9]: https://av.jpn.support.panasonic.com/support/global/cs/soft/download/d_lumixtether2.html
[P10]: https://av.jpn.support.panasonic.com/support/global/cs/soft/tool/sdk.html
[P10L]: https://av.jpn.support.panasonic.com/support/global/cs/soft/tool/license_sdk_v2.html
[P11]: https://eww.pavc.panasonic.co.jp/dscoi/DC-S5/P_PP/DC-S5_DVQP2197ZD_full_eng.pdf
[P12]: https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/ff/dl/s5.html
[P13]: https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/ff/dl/s5m2.html
[P14]: https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/ff/dl/s5m2x.html
[P15]: https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/fts/dl/g9m2.html
[P16]: https://www.panasonic.com/global/consumer/lumix/lumix-lab.html
[O1R]: https://github.com/gphoto/libgphoto2
[O1]: https://github.com/gphoto/libgphoto2/blob/92171a382f185f617e95cb9acecf2d43688b19ab/camlibs/lumix/lumix.c
[O1P]: https://github.com/gphoto/libgphoto2/blob/92171a382f185f617e95cb9acecf2d43688b19ab/camlibs/ptp2/library.c
[O1PP]: https://github.com/gphoto/libgphoto2/blob/92171a382f185f617e95cb9acecf2d43688b19ab/camlibs/ptp2/ptpip.c
[O1I]: https://github.com/gphoto/libgphoto2/issues/409
[O2]: https://github.com/peci1/lumix-link-desktop/blob/59e98be8e87cd2da26a30de2e5fe5519165cd94d/README.md
[O3]: https://github.com/cleverfox/lumixproto/blob/14a27949ff408eab1f917167188f974841d08252/README.md
[O3T]: https://github.com/cleverfox/lumixproto/tree/14a27949ff408eab1f917167188f974841d08252
[O4]: https://github.com/abichinger/pylumix/blob/89a0da2e5f04c157f0ce9ffb77c63ad79bdb3356/README.md
[O4C]: https://github.com/abichinger/pylumix/blob/89a0da2e5f04c157f0ce9ffb77c63ad79bdb3356/src/pylumix/core.py
[O4L]: https://github.com/abichinger/pylumix/blob/89a0da2e5f04c157f0ce9ffb77c63ad79bdb3356/LICENSE
[O5]: https://github.com/Aikhjarto/LUMIX-G9II-Remote-Control/blob/25c91ebebd5d27ecf531405ee49b6d27e2c085d8/README.md
[O5W]: https://github.com/Aikhjarto/LUMIX-G9II-Remote-Control/blob/25c91ebebd5d27ecf531405ee49b6d27e2c085d8/src/LumixG9IIRemoteControl/LumixG9IIWiFiControl.py
[O5B]: https://github.com/Aikhjarto/LUMIX-G9II-Remote-Control/blob/25c91ebebd5d27ecf531405ee49b6d27e2c085d8/src/LumixG9IIRemoteControl/LumixG9IIBluetoothControl.py
[O5S]: https://github.com/Aikhjarto/LUMIX-G9II-Remote-Control/blob/25c91ebebd5d27ecf531405ee49b6d27e2c085d8/src/LumixG9IIRemoteControl/StreamReceiver.py
[O5L]: https://github.com/Aikhjarto/LUMIX-G9II-Remote-Control/blob/25c91ebebd5d27ecf531405ee49b6d27e2c085d8/LICENSE.md
[O6]: https://github.com/tobiasbrummer/lux-lat-long-log/blob/87e51686c8496ca20fa8b14433ba548383f8da5b/README.md
[O6P]: https://github.com/tobiasbrummer/lux-lat-long-log/blob/87e51686c8496ca20fa8b14433ba548383f8da5b/PROTOCOL.md
[O6L]: https://github.com/tobiasbrummer/lux-lat-long-log/blob/87e51686c8496ca20fa8b14433ba548383f8da5b/LICENSE
[O7]: https://github.com/palmdalian/python_lumix_control/blob/dea94a4bcf37c95c67fdd29adc3b9d95a235ab3b/README.md
[O7L]: https://github.com/palmdalian/python_lumix_control/blob/dea94a4bcf37c95c67fdd29adc3b9d95a235ab3b/LICENSE
[O8]: https://github.com/auberginehill/panasonic-html-image-app/blob/e3c5433a0d996af1ce5a947e8e8b06a95a5d2ffc/README.md
[O8L]: https://github.com/auberginehill/panasonic-html-image-app/blob/e3c5433a0d996af1ce5a947e8e8b06a95a5d2ffc/LICENSE.md
[O9]: https://github.com/davidkim9/LumixController/blob/26764f1ef1579fdd650f5d84d20894184d2f7cf2/README.md
[O9T]: https://github.com/davidkim9/LumixController/tree/26764f1ef1579fdd650f5d84d20894184d2f7cf2
[O10]: https://github.com/laurentmmeyer/lumix-gx80
[O10T]: https://github.com/laurentmmeyer/lumix-gx80/tree/98942509971a69cb18bdb8b5e21458025bc679b5
[O11]: https://github.com/LennyObez/studio-camera/blob/349594e7cca3e3a6221fa3399587ffca6350bb9c/README.md
[O11T]: https://github.com/LennyObez/studio-camera/tree/349594e7cca3e3a6221fa3399587ffca6350bb9c/core/data/camera/panasonic
[O11L]: https://github.com/LennyObez/studio-camera/blob/349594e7cca3e3a6221fa3399587ffca6350bb9c/LICENSE
[O12]: https://github.com/larszu/lz-camera-bridge/blob/6d49982923fb4823e5970ee868b458421f8f0a7c/README.md
[O12L]: https://github.com/larszu/lz-camera-bridge/blob/6d49982923fb4823e5970ee868b458421f8f0a7c/LICENSE
[Ometa]: https://docs.github.com/en/rest/repos/repos#get-a-repository
[M1]: https://api.github.com/repos/gphoto/libgphoto2
[M2]: https://api.github.com/repos/peci1/lumix-link-desktop
[M3]: https://api.github.com/repos/cleverfox/lumixproto
[M4]: https://api.github.com/repos/abichinger/pylumix
[M5]: https://api.github.com/repos/Aikhjarto/LUMIX-G9II-Remote-Control
[M6]: https://api.github.com/repos/tobiasbrummer/lux-lat-long-log
[M7]: https://api.github.com/repos/palmdalian/python_lumix_control
[M8]: https://api.github.com/repos/auberginehill/panasonic-html-image-app
[M9]: https://api.github.com/repos/davidkim9/LumixController
[M10]: https://api.github.com/repos/laurentmmeyer/lumix-gx80
[M11]: https://api.github.com/repos/LennyObez/studio-camera
[M12]: https://api.github.com/repos/larszu/lz-camera-bridge
[F1]: https://www.personal-view.com/talks/discussion/comment/203370
[F2]: https://meyer-laurent.com/pulling-photos-videos-panasonic-gx80-wifi
[H1]: https://www.home-assistant.io/integrations/
[H2]: https://github.com/gkoh/furble/issues/247
[A1]: https://developer.android.com/develop/connectivity/wifi/wifi-bootstrap
[A2]: https://developer.android.com/reference/android/net/Network
[A3]: https://developer.android.com/reference/android/net/ConnectivityManager
[A4]: https://developer.android.com/reference/android/net/wifi/WifiNetworkSpecifier
[A5]: https://developer.android.com/develop/connectivity/wifi/wifi-permissions
[A6]: https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
[A7]: https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock
[A8]: https://developer.android.com/privacy-and-security/security-config
[A9]: https://developer.android.com/develop/connectivity/bluetooth/ble/background
[A10]: https://developer.android.com/develop/connectivity/wifi/localonlyhotspot
[A11]: https://developer.android.com/privacy-and-security/local-network-permission
[A12]: https://source.android.com/docs/core/connect/bluetooth/verifying_debugging
[I1]: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.hotspotconfiguration
[I1A]: https://developer.apple.com/documentation/networkextension/nehotspotconfigurationmanager/apply(_:completionhandler:)
[I1J]: https://developer.apple.com/documentation/networkextension/nehotspotconfiguration/joinonce
[I2]: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
[I3]: https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking
[I4]: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast
[I5]: https://developer.apple.com/documentation/bundleresources/information-property-list/nsbluetoothalwaysusagedescription
[C1]: https://www.oppo.com/en/newsroom/press/find-x8-series-coloros-15-launch-camera-ai/
[C2]: https://ipics.oppo.com/oppo_nl/answer/ColorOS_11.1_User_Guide_V1.1.pdf
[C3]: https://support.oppo.com/eg/answer/?aid=neu9242
