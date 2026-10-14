# 初代 DC-S5 Wi-Fi 实机测试工具

这套工具把[研究报告](../../docs/research/wireless-connection.md)的 T1–T5 和 T10 抓包准备变成可执行步骤。适用对象是**初代 DC-S5**，不是 S5D、S5II 或 S5IIX；命令仍是待实测候选。没有连接过实体相机，仓库里的[证据](../../evidence/s5-wifi-mock/REPORT.redacted.md)全部来自本地 mock，不能据此宣布 S5 2.9 可用。

只需要 macOS 的 Python 3.9+ 标准库，**不用 pip**。已在 `/usr/bin/python3` 3.9.6 上以 `-I` 隔离模式运行。所有全局参数放在子命令**之前**，所有步骤沿用同一个 `--out "$RUN"`，这样发现结果、会话和目录基线才能关联。不要把相机命令放进自动重试脚本。

## 0. 机身和网络准备

1. 在机身菜单确认型号、固件（预计 2.9，以实际为准）、销售地区；记下镜头型号、SD 卡/卡槽、macOS、Find X8 的 Android/ColorOS build 和 LUMIX Sync 版本。不要记录序列号或完整 SSID 到可分享笔记。
2. 有足够电量、卡上有空间。照片设为 **JPEG L、单张、短快门**（如 1/125 s）；先只用一张卡，后续再测 RAW+JPEG/双卡。关闭 **Auto Transfer/自动传输**；关闭 Touch Shutter。第一次建议关闭自动回放，后续再分别测试开启和长曝光。
3. 机身进入 **Wi-Fi → New Connection/新连接 → Remote Shooting & View/遥控拍摄及观看**，按机身实际菜单显示的 SSID/密码，在 Mac 控制中心的 Wi-Fi 中手动加入。Mac 提示无互联网是预期现象；工具不以互联网是否可达判断相机连接。
4. 关闭其他遥控客户端（包括 Find X8 的 Sync）。机身出现设备确认时核对自己设置的设备名再接受。需要抓官方 Sync 时另开一个独立会话；不要让两个控制端争用，也不要同时按机身/手机快门。
5. 直连 AP 时，查看 Mac Wi-Fi 的 TCP/IP 路由器地址及相机菜单；同一路由器时查看 DHCP 租约。`192.168.54.1` **只是旧机型的常见候选值**，必须改成这台 S5 的真实 IPv4 地址。工具不扫网段，不解析任意主机名。

Mac 常把 Wi-Fi 命名为 `en0`，但必须先核实：

```sh
networksetup -listallhardwareports
route -n get 192.168.54.1  # 用实际相机 IP 替换
```

保持互联网：给 Mac 接以太网或独立 USB 网络接口；系统设置 → 网络 → 服务顺序，将有互联网的接口放前面，相机 Wi-Fi 的本地子网路由仍走 Wi-Fi。用 `route -n get "$CAMERA_IP"` 核实相机接口，再用 `route -n get default` 核实默认路由。不要期待同一块 Mac Wi-Fi 同时加入相机 AP 和家用 AP。也可让相机和 Mac 都加入家用路由器：机身 Remote Shooting & View 中按 **DISP → Via Network/通过网络**，选择同一个 AP，并关闭客户端隔离；路由器模式的地址通常不同。初代 S5 自建 AP 是 2.4 GHz；5 GHz 只考虑机身地区允许的 STA 模式。

## 1. 用户起步的前五条命令（T1、T2）

在已加入相机网络后，**逐条执行，遇到错误先停下看下一节**。第二条里的 IP 必须先修改；以下路径是本工作区，可以改成你自己的仓库路径。这里没有自动认证。

```sh
cd /Users/murder/orca/workspaces/moment-s5/scan-bugfix
export CAMERA_IP=192.168.54.1 RUN="$PWD/s5-field-runs/$(date +%Y%m%d-%H%M%S)"
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" discover
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" probe
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" liveview --seconds 60 --port 49152
```

`discover` 向**指定 IP 的 UDP 1900**发送一次单播 SSDP M-SEARCH，并只接受该 IP 的响应，解析 LOCATION 的 device description（型号、暴露的固件、service/control URL），另读 getstate。为了严格限定目标，它不向整个 LAN 组播；相机若不回答单播 SSDP，不等于它不支持 UPnP。无 LOCATION 时只尝试该 IP 上已知的两个 description 路径；有实际抓包路径时可以明确指定：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" discover --description-url "http://${CAMERA_IP}:60606/Lumix/Server0/ddd"
```

不要凭模板猜 control URL。以 `discovery.json` 中 `ContentDirectory` 的 `controlURL` 为准；工具只接受属于给定相机 IP 的 HTTP URL，并且**不跟随任何重定向**。若固件不暴露 firmware，JSON 是 `null`，请在现场笔记手填机身版本。

`probe` 只读 getstate、capability/allmenu/curmenu/lens，以及 iso/focal/shtrspeed/liveviewsize；`focal` 是光圈候选名，不是焦距。`probe.json` 中每项都有协议结果，HTTP 200 也可能是 `err-unsuitable-app`、`err-busy` 或 `err-param`；个别设置不支持不能推成全部功能不支持。至少一项成功时退出 0，仍必须人工核对关键 getstate/能力项；全部失败退出 4。它从不登记身份、写设置或切模式。

### T1 认证分支：只执行已确认的那个流程

若 getstate/probe 提示访问拒绝，先抓自己的官方 Sync 首次连接（第 6 节），辨别 req_acc 或 req_acc_g/e。禁止循环尝试身份，不降级固件，不把 G9II 的常量当作 S5 2.9 的认证保证。

默认 HTTP User-Agent 是真实的 `Moment-S5-field-test/1`。若自己的 Sync 抓包证明 S5 要求特定 User-Agent，可明确在子命令之前加 `--user-agent "LUMIX Sync"`（以实际捕获值为准），并在后续同一会话保持相同参数；工具不会因拒绝自动切换 App 身份。

**如果抓包确认使用旧 req_acc**，明确执行一次登记，在机身接受真实设备名，再重新运行 probe：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --timeout 15 --out "$RUN" auth --flow legacy --client-id 0 --device-name moment-s5-field
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" probe
```

**如果确认使用 gen2**，可先明确请求一次 challenge：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" auth --flow gen2 --challenge-only
```

这只发 `req_acc_g`，私有 `auth.json` 保存 challenge，退出 0 表示取到挑战，**不表示已认证**。工具支持两种明确的完成方式：

- `--gen2-profile <private JSON>`：先请求一个新 challenge，用你从**这台 S5**验证的变换参数计算 response，再发 `req_acc_e`。JSON 字段是 `camera_ip`、`verified_model: "DC-S5"`、`challenge_order: "little"` 或 `"big"`、`value_words` 和 `value2_words`；每个 word 是 8 个十六进制字符。此通用实现仅支持四字节挑战与逐 word XOR 的协议；仓库**不附带相机常量**。若 S5 不是这个协议，应停在 challenge 证据，不能伪造通过。
- `--response-file <private JSON>`：只发 `req_acc_e`，不另取挑战；JSON 必须含 `camera_ip`、`value`、`value2`，对应当前仍有效的那次挑战。旧抓包的 response 不应盲目重放。未知协议需把脱敏摘要带回再完善本地 profile。

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" auth --flow gen2 --gen2-profile tools/s5-wifi/private/verified-s5-profile.json
# 或：使用自己计算的、本会话有效的 response 文件
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" auth --flow gen2 --response-file tools/s5-wifi/private/current-response.json
```

只有确认官方 S5 会话需要发两次 `req_acc_e` 时才加 `--exchanges 2`；默认一次，缺少 session 就报错，绝不自行补发。若已确认要随后登记设备名，可加 `--register-name`。成功取得 `X-SESSION_ID` 时保存到 `"$RUN/.session.json"`（权限 600，绑定相机 IP 和 cam.cgi 端口）；后续显式使用同一 RUN 自动带该 header。退出/重新开机或更换网络后，建立新的 RUN 和一次新登记。原始响应只落私有 raw 目录。

## 2. 连续取景和门槛（T2）

取景时让相机拍到**数字秒表、移动图案或缓慢移动物体**，否则静态场景可能被判作重复帧。UDP socket 先 bind，随后 recmode/startstream，后台接收线程独立于 HTTP 保活；默认每 2 秒 getstate，可用 `--keepalive 1` 调整。Ctrl-C 和正常结束都会尝试一次 stopstream，并保留测量；网络已断时工具无法保证相机收到 stopstream，需要手动退出机身 Wi-Fi。

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --timeout 5 --out "$RUN" liveview --seconds 60 --port 49152 --keepalive 2 --raw-datagrams 30 --samples 3
```

结果包括 `liveview.json`、`liveview/sample-*.jpg` 和 `liveview/datagrams.json`（前 K 个 UDP datagram 的边界、长度、来源端口和十六进制）。默认要求每个 datagram 含完整 JPEG，允许 JPEG 前有固定/未知前缀；校验 SOI/EOI、segment 长度、SOS 和 SOF 尺寸，不做熵解码。帧上限 2 MiB，原片 64 MiB，三秒 ring 的图片总量上限 64 MiB；达到上限会保守失败。UDP 仅接受指定相机 IP，忽略其他来源。

如果收到包却没有完整帧：保留数据，不自动把任意包串起来。先用 Wireshark/私有 datagram 样本确认分包规则；仅当已经确认**每包固定 header、连续包序号、header 后的 JPEG 字节无额外尾部**时，才能启用 `sequence` 重组，例如实测 header=2、序号=前两字节大端：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" liveview --seconds 60 --port 49152 --framing sequence --header-bytes 2 --sequence-offset 0 --sequence-bytes 2 --sequence-endian big
```

**这个两字节格式只在 mock 中验证，不是 S5 包头规格。** 序号缺失、乱序、重复会丢弃未完成帧；不擅自猜测新的 S5 格式。不知道包序号时不报告假精确的丢包率（`loss_rate: null`），分别报告无效 datagram、残帧和帧 gap。

| 指标 | 通过条件/解释 |
| --- | --- |
| 完整帧率 | 校验通过的 JPEG 数 / 实际单调时间；与包数区分 |
| 独立帧率 | 窗口内不同完整 JPEG 的 SHA-256 数 / 3 s，目标 ≥10 fps，争取 ≥15；这是字节变化代理，EXIF/噪声变化也可能使 hash 变化，不是视觉语义去重 |
| 三秒窗口 | 必须已采集满 3 s；测最终窗口及每 0.5 s 取样的滑动窗口 |
| 最长 gap | 三秒窗口中 ≤500 ms，包含窗口起点和末尾空白；整体最长 gap 另列，包含初始开流时间 |
| 末帧年龄 | 相对窗口结束 ≤500 ms；旧帧不会让 stalled stream 通过 |
| 源尺寸 | JPEG SOF 实测，不能把 VGA 放大后称原生 960p |

`liveview` 最终窗和所有测得的滑动窗通过且无保活错误，退出 0；否则退出 5。时间戳是 Mac 完成接收时刻，**不是相机曝光时间或端到端显示延迟**；测显示延迟需要外部视频同时拍到秒表和屏幕。

## 3. 对焦和一次快门（T3）

先通过 T1/T2，查 capability，镜头允许时逐条手动执行；不同镜头分别标定方向和步长，每次调用只发一个命令，不做自动连续步进：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" af
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" focus --step wide-slow
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" focus --step tele-slow
```

还有 `wide-fast`、`tele-fast`，不能预设 wide/tele 对所有镜头等同近/远。Touch AF 范围尚未确认，本工具不写陌生 touch 坐标。曝光读数在 probe 中保存，本阶段不修改曝光设置。

只需单发快门、不查文件时：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" shoot
```

交互时输入完整 `SHOOT` 才发一次 `capture`；`--yes` 仅用于你已明确准备好的一次拍摄。**任何超时都不得直接重跑 shoot**：先看机身快门声、SD 卡和目录增量。工具没有捕获后重试、HTTP 库重试或重定向；HTTP 200 / result=ok 仍不代表文件已经写卡。重复执行一次新 CLI 调用本身就是一次新快门，不是恢复操作。

## 4. 目录基线、本次原片和 SD 对照（T4）

让画面含唯一纸面编号，限制其他快门来源。先建立完整基线，再单发一次快门并下载：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" catalog
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --timeout 15 --out "$RUN" shoot --baseline "$RUN/baseline.json" --download --wait-seconds 60
```

catalog 显式切 playmode，按 description 中 control URL 发 ContentDirectory Browse，解析 SOAP 的转义 `<Result>` 再解析 DIDL-Lite；递归访问 container、遍历分页。基线 `baseline.json` 保存对象 ID、parent/card slot（若暴露）、所有 res URL/flags/size/原文件名。分页期间 UpdateID/总数变化、循环或重复身份不能形成可信基线。

下载只选唯一新对象的 `CAM_ORG` 或 `CAM_RAW_JPG` 原 JPEG 候选；即使 MIME 是 octet-stream 也能识别 RAW+JPEG 的 JPEG，`CAM_RAW`、`CAM_LRGTN`、缩略图和带转换标记的资源不会降级替代。两张新 JPEG、同 ID 资源变更、两个原图 URL 都报歧义。拍摄前再次核对基线未被新照片污染；拍摄后目录稳定一秒才下载，但这不能排除稍晚的并行快门，所以现场必须限制其他控制端。

默认保存 `"$RUN/phone-original.jpg"`（名字用于复用 `--phone`，这里仍是 **Mac 下载文件**，不是已测得 Find X8 下载结果）；可用 `--download-to` 指定新路径。接收临时文件，检查 HTTP/DIDL 长度、JPEG 结构/尺寸和 EXIF 白名单，完成后原子改名；已有目标拒绝覆盖。JSON 保存大小、SHA-256、SOF 尺寸、Make/Model/Orientation/DateTimeOriginal/LensModel 等字段。只读目录查询可在拍摄 HTTP 超时后继续；capture 不会重发，超时状态会被保留。

结束 Wi-Fi 后用读卡器复制**同一次照片**的原卡文件（不要删卡、改名混淆双卡、通过 Photos 导出或重编码）；重新回到仓库运行：

```sh
python3 -I tools/s5-wifi/s5wifi.py --out "$RUN" verify --sd /Volumes/SDCARD/DCIM/100_PANA/P1000001.JPG --phone "$RUN/phone-original.jpg"
python3 -I tools/s5-wifi/s5wifi.py --out "$RUN" report --source "$RUN"
```

SD 路径是示例，换成 Finder 中复制/读到的真实文件。`verify.json` 的 size/SHA-256/dimensions/exif 都相等且 `passed: true` 才通过原始字节关卡；否则退出 7。全尺寸但 hash 不同不算原片保真。只有 JPEG 结构与哈希验证，无 Motion Photo 打包/视频编码；Find X8 官方 Sync 下载文件也可以用同一 `verify --phone <真实手机复制文件>` 另测。

## 5. 三秒 pre-only 采集闭环（T5 / P1）

先按 T4 建立一份**当前**基线。只在前面三秒窗与原片关卡通过后做这次明确拍摄：

```sh
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" catalog
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --timeout 15 --out "$RUN" shoot --baseline "$RUN/baseline.json" --download --download-to "$RUN/t5-original.jpg" --prebuffer-seconds 5 --post-seconds 2 --port 49152
```

输入 SHOOT 后工具回 recmode、bind/startstream，采集 5 秒；仅当最后三秒窗通过才冻结 ring 并**立即派发一次 capture**。失败退出 5 且不发快门。冻结的图片保存在 `prebuffer/pre-*.jpg`，manifest 中 `relative_to_capture_ms` 应全部 <0；快门后继续短暂收帧，记录流中断，再 stopstream/playmode 查目录下载。快门前图片写盘发生在派发之后，避免几十次文件写入拖慢快门；报告仍保存冻结/派发/应答/新条目可见/下载完成各时点。

`shoot.json.prebuffer.last_3s_gate.passed`、`prebuffer/manifest.json.pre_only`、唯一新文件与 SD hash 对照一起判断 P1。快门中黑屏可以接受，前窗不能用快门后帧补齐。注意：这是**采集与时序可行性**测试，没有改 App，也未验证现有视频编码与 Motion Photo 封装。发送 HTTP 到真实曝光的误差、30 分钟稳态、30 次拍摄、双卡和网络路由（T6–T9）仍要另测；每次拍摄建新 RUN/基线并单独确认，禁止快门自动循环。

若实际 S5 使用已确认的 sequence framing，T5 的 shoot 要带与 T2 完全相同的 header/序号参数。下载后回 recmode 的下一次拍摄必须重新填满三秒窗，不能复用旧 prebuffer。

## 6. 官方 LUMIX Sync 的 HTTP / DLNA 抓包

下面只捕获自己拥有的 S5/Find X8；每次只做一个动作，并记本地时间：连接/确认、开启取景、AF、一次短快门、回放、下载、退出。原始包保存在私有 RUN，不入仓库。

### A. 同一路由器

相机经 DISP → Via Network、手机和 Mac 加入同一 AP，关闭 AP isolation。**普通 Mac `tcpdump -i en0` 通常只能看到 Mac 自己的单播和广播，不能因同 LAN 就看到手机↔相机的单播。** 较可靠的是路由器/交换机镜像端口或路由器自身 tcpdump；OpenWrt 示例（接口名、硬件 offload 的可见性需现场核实）：

```sh
tcpdump -i br-lan -n -s 0 -U -w /tmp/s5-sync.pcap "host ${CAMERA_IP}"
```

Mac 自己跑本工具时，可以另一个终端抓**Mac↔相机**流量：

```sh
sudo tcpdump -i en0 -n -s 0 -U -w "$RUN/s5-mac.pcap" "host ${CAMERA_IP}"
```

Mac/Wireshark 的 monitor 模式依赖网卡/驱动；无线诊断的 Sniffer 会锁定信道并可能断开当前 Wi-Fi，建议另一个适配器/接收机，详见[Wireshark WLAN capture 指南](https://wiki.wireshark.org/CaptureSetup/WLAN)。802.11 WPA2 密文通常需要自己的密码和完整握手才能在本地解密，WPA3 等有更多限制；只有 radiotap/encrypted 包不是 HTTP 已被观测的证据。这里的 stdlib summarizer 不做 Wi-Fi 解密，monitor capture 请在 Wireshark/tshark 中解密后分析。抓不到包先检查接口、信道、隔离和 offload，不能据此判相机无协议。

### B. Android PCAPdroid（常常更容易）

Find X8 安装[PCAPdroid 官方版本与指南](https://emanuele-f.github.io/PCAPdroid/)，选择 LUMIX Sync 为目标，开始本地 VPN 捕获并导出 pcap。非 root 模式用 Android VpnService，只看到这部手机经 VPN 的流量；**如果 Sync 绑定本地 Wi-Fi Network 并绕过 VPN，就可能没有相机流量**。VPN 也可能影响连接，需对比 VPN 开/关。PCAPdroid 不能替代 LAN 镜像，不保证能捕获手机热点客户转发；相关边界见[官方 FAQ](https://emanuele-f.github.io/PCAPdroid/faq)。失败时转用路由器抓包、下面 Mac AP，或有 root 的测试设备（不要求用户 root 当前 Find X8）。

### C. Mac 作测试 AP / Internet Sharing

给 Mac 接以太网/独立上网接口；按[Apple Internet Sharing](https://support.apple.com/guide/mac-help/share-internet-connection-mac-network-users-mchlp1540/mac) 在系统设置 → 通用 → 共享配置，从以太网共享到 Wi-Fi。选相机兼容的 WPA2 或 WPA2/WPA3 混合及 2.4 GHz 信道；不要选 WPA3-only。相机用 **Via Network** 加入 Mac 的 AP，Find X8 也加入此 AP。不要启用 NAT64-only 网络，本工具需要 IPv4。

Mac 不能同时用同一 Wi-Fi 作 Internet Sharing AP 和加入相机 AP；本方案是相机作 STA。实际共享界面、WPA2 选项随 macOS 版本变动，以本机为准。开启后核实 `bridge100` 与实际相机 IPv4，再抓包：

```sh
ifconfig bridge100
sudo tcpdump -i bridge100 -n -s 0 -U -w "$RUN/s5-sync.pcap" "host ${CAMERA_IP}"
```

用 Sync 做连接和一次取景/回放动作，确认 capture 里出现手机↔相机 HTTP，再继续拍摄实验。`bridge100` 是常见接口而非保证；同 AP 站间流量若在驱动中直接转发，桥上仍可能看不到，换实际 bridge/member、镜像/路由器抓包。工具不会修改共享、路由或防火墙设置。

### 提取可分享的请求/响应摘要

```sh
python3 -I tools/s5-wifi/pcap_summarize.py "$RUN/s5-sync.pcap" --camera-ip "$CAMERA_IP" --out "$RUN/capture-summary"
python3 -I tools/s5-wifi/s5wifi.py --out "$RUN" report --source "$RUN"
```

生成 `capture-summary/pcap-summary.json` 和 `PCAP.redacted.md`：cam.cgi 参数（认证 value/value2 隐去）、HTTP status、XML/CSV 协议 result，以及 SOAPAction/Browse 数量和资源 flags。无 cam/DLNA 对时退出 4，不能据此判断协议不存在。支持经典 pcap 与 pcapng 的常见 Ethernet/VLAN、BSD loopback、raw IPv4、Linux cooked；按 TCP 序号去重/重组，仅分析完整连续前缀，不猜缺失响应。不支持 IPv6、IP 分片、radiotap/Wi-Fi/TLS 解密、TCP 32-bit 序号回绕，四元组复用也可能导致保守拒绝；大文件上限 256 MiB、单 TCP 流 16 MiB。

若已有 Wireshark/tshark，可以选择其解码器；它**不是必需依赖**：

```sh
python3 -I tools/s5-wifi/pcap_summarize.py "$RUN/s5-sync.pcapng" --camera-ip "$CAMERA_IP" --out "$RUN/capture-summary" --tshark
```

Wireshark 查看 `http || ssdp || udp.port == 49152 || udp.port == 49199`；非标准 HTTP 端口可用 Decode As。如是 TLS 加密，只能保留连接事实，本工具不会绕过加密，也不会从密文恢复认证。

## 7. BLE 抓包准备（T10）

Android 开发者选项打开 **Bluetooth HCI snoop log**（若有 Disabled/Filtered/Full，选 Full），重启蓝牙；ColorOS 菜单/日志策略以现场为准。按[AOSP 蓝牙调试步骤](https://source.android.com/docs/core/connect/bluetooth/verifying_debugging)采集，必要时先重新连接 Sync 让服务发现进入日志，**不用清空所有蓝牙配对**。

分别建立独立日志动作：首次注册、仅 Shutter Remote Control 一次快门、Sleep 唤醒、OFF+Remote Wakeup、Wi-Fi AP 激活、Via Network 连接。先记动作/本地时间，再立即导出；不要把这些动作混为一个“BLE 可用”。工具不向任何 BLE characteristic 写入。

```sh
adb devices
adb shell getprop ro.build.fingerprint > "$RUN/android-build.txt"
adb shell dumpsys bluetooth_manager > "$RUN/bluetooth-manager.txt"
adb shell dumpsys connectivity > "$RUN/connectivity.txt"
adb bugreport "$RUN/s5-ble-bugreport.zip"
```

adb 是可选的 Android platform-tools，不是 Python 依赖。bugreport 常含全机隐私，不上传整包。以下只从你自己的 zip 抽取 HCI 文件和 bugreport 文本到私有目录，不按 zip 路径写入文件系统：

```sh
python3 -I - "$RUN/s5-ble-bugreport.zip" "$RUN/ble" <<'PY'
import os, pathlib, sys, zipfile
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True, mode=0o700)
with zipfile.ZipFile(sys.argv[1]) as z:
    names = [n for n in z.namelist() if not n.endswith('/') and
             ('btsnoop' in pathlib.PurePosixPath(n).name.lower() or
              (pathlib.PurePosixPath(n).name.startswith('bugreport-') and n.endswith('.txt')))]
    for i, n in enumerate(names):
        target = out / ('%03d-' % i + pathlib.PurePosixPath(n).name)
        fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with z.open(n) as src, os.fdopen(fd, 'wb') as dst:
            while True:
                block = src.read(65536)
                if not block: break
                dst.write(block)
        print(target)
    if not names: print('No standalone HCI log/text found; inspect bugreport locally')
PY
```

若 zip 只有文本中的 btsnooz，可从上面 AOSP 页面获取官方 `btsnooz.py`，在本地按 `python3 btsnooz.py BUG_REPORT.txt > BTSNOOP.log` 解出；该脚本不随工具打包。非 root 常无法 `adb pull /data/misc/bluetooth/logs`，bugreport 是首选。日志可能过滤/截断；完整日志与能看到 GATT UUID 的服务发现记录要一起检查。

Wireshark 打开 btsnoop，过滤 `btatt || btsmp`，按 Write/Notification 时间与具体动作对照；根据服务发现映射 **handle→UUID**，不要硬编码 G9II handles。来自研究文档的**S5 第三方 GPS/会话观察**如下，未证明当前 2.9 或 shutter/wake/Wi-Fi 的完整协议：

| service UUID | characteristic UUID | 已观察用途 |
| --- | --- | --- |
| `054ac620-3214-11e6-ac0d-0002a5d5c51b` | `8d08a420-3213-11e6-8aca-0002a5d5c51b` | 会话初始化，16-byte，Write |
| 同上 | `cd7a71a0-3213-11e6-8f56-0002a5d5c51b` | 设备名，ASCII，Write |
| `34738720-3214-11e6-b66b-0002a5d5c51b` | `ead55e60-3216-11e6-a42e-0002a5d5c51b` | 时钟，10-byte，Write |
| 同上 | `4cf487c0-32a7-11e6-a50d-0002a5d5c51b` | ready/status，Notify |
| `1d74afe0-3214-11e6-8ab4-0002a5d5c51b` | `daff1bc0-3216-11e6-91c8-0002a5d5c51b` | GPS，16-byte，Write |
| 同上 | `37701b80-32a7-11e6-bb83-0002a5d5c51b` | GPS ready/status，Notify |

这些 UUID 用于**辨认日志**；不要试写未知 characteristic，不注入 GPS、不改时钟、不复用静态 token。关闭 HCI snoop 后重启蓝牙，结束诊断。`pcap_summarize.py` 只做 HTTP，不解析 HCI；分享 BLE 结论时手写“动作→UUID→属性→通知/长度→固件”的去标识表，不分享定位 payload、设备名、MAC 或会话原字节。

## 8. 输出、退出码和隐私

默认输出是当前目录 `s5-field-runs/<timestamp>`，已 gitignore；`tools/s5-wifi/private/` 也被忽略。私有目录默认 700，JSON/raw/session 文件默认 600；自定义已有目录不会擅自修改你的权限。不要把真实结果放进 `evidence/s5-wifi-mock/`。

| 退出码 | 含义 |
| --- | --- |
| 0 | 当前命令成功，或 gen2 challenge-only 获取成功；仍按 JSON 判断具体关卡 |
| 2 | 参数/本地 profile/URL 范围错误 |
| 3 | 网络错误/超时，没有自动重试 |
| 4 | 相机协议拒绝、XML/SOAP/格式错误、无可提取 HTTP 对 |
| 5 | 三秒帧流关卡失败 |
| 6 | 本次新文件/基线/原图资源有歧义或超时未找到 |
| 7 | SD 与下载文件不一致 |
| 130 | 用户取消/Ctrl-C；快门状态不确定时人工核对 |

`--verbose` 会打印脱敏 HTTP 元信息；原始响应一直保存在私有 `raw/`。HTTP timeout 是每次 socket 操作超时，不是全部实验的总时限。目录轮询允许只读查询，非幂等操作从不自动重发。每次 invocation 的关键 JSON 会覆盖同 RUN 的同名结果，raw 日志使用独立名字；不同实验/拍摄用新 RUN 保存完整历史。

`report` 汇总结果 JSON、递归清除 SSID、密码、MAC、serial、UDN、session token、GPS、auth fields、原始包和绝对本地路径，生成 `REPORT.redacted.md`。**仍需自己审阅后才粘贴**：不要分享 raw 响应、pcap/pcapng、bugreport/Android 日志、session/profile/response JSON、Wi-Fi 密码/QR、GPS、真实照片或可识别场景；自由文本若有无标签的个人资料，先手动删除。脱敏报告保留型号、固件、指标和 SHA-256，便于带回诊断。

## 9. 无相机的自测与来源

```sh
python3 -I -m unittest discover tools/s5-wifi -v
python3 -I tools/s5-wifi/run_mock_smoke.py
# 同一闭环再验证明确的序号分包（只代表 mock 格式）：
python3 -I tools/s5-wifi/run_mock_smoke.py --framing sequence --evidence s5-field-runs/mock-sequence-evidence
```

mock runner 用 loopback 的随机 HTTP/SSDP/UDP 端口启动相机，实际子进程执行 discover → auth → probe → liveview → catalog → shoot → verify → report，核对服务器 capture_count=1、pre-only manifest、SD 字节一致；把脱敏报告留在 `evidence/s5-wifi-mock/`，私有 JPEG/原始响应在 gitignored 的 run 目录。也可以两个终端手动使用 `python3 -I tools/s5-wifi/mock_camera.py --http-port 18080 --ssdp-port 11900`，客户端加 `--camera-ip 127.0.0.1 --http-port 18080`；discover 加 `--ssdp-port 11900`。Ctrl-C 停 mock，mock SD 文件与 request 计数写入它的 `--out`。

全部代码、灰阶 JPEG encoder 和最小 XML/CSV/pcap fixtures 为本项目独立编写，沿用仓库 [MIT LICENSE](../../LICENSE)。协议事实来自[本项目研究 §4/§5/§11](../../docs/research/wireless-connection.md)，没有复制 GPL/许可不明项目的实现或抓包，也没有取得 SDK、修改固件或改 App。Gen2 profile 与未知 UDP 格式保持实机验证边界；mock 不能替代实体 S5/Find X8 验收。
