# 迭代 5 · 连接面板与提醒（截图证据）

环境：Android 模拟器 `moment_s5_hud_e43_api35`，端口 5562，release APK（`assembleRelease`）。
没有实体相机；所有相机连接相关结论只来自模拟器、Jest 和主机测试。

| 文件 | 对应需求 | 说明 |
|---|---|---|
| `01-connection-segments.png` | 5.2 | 连接面板三段「USB / Wi-Fi / 演示」保持单行，「实验」是 Wi-Fi 旁的小角标。 |
| `02-connection-segments-1.3x.png` | 5.2 | 系统字体 1.3 倍下重新打开连接面板，三段仍单行，角标不换行。 |
| `03-wifi-step3.png` | 5.11 | Wi-Fi 页第 3 步为「确认相机 IP，一般不用改」，输入框已预填。 |
| `04-disconnect-banner-injected.png` | 5.5 | 「相机已断开」提示条与「重新连接」按钮。**测试注入**：临时在 `App` 里定时写入该提示以便截图；最终提交前已移除注入并重新构建。 |
| `05-usb-attach-prompt-injected.png` | 5.6 | 「检测到相机 · 连接」提示条，不会自动连接。**测试注入**：同上，临时写入提示状态；原生广播与去重逻辑由 `check-native-host.sh` 覆盖。 |
| `06-remembered-demo-method.png` | 5.4 | 先进入演示，再强制停止并重新打开 App，连接面板直接停在「演示」。用演示验证了偏好存储的写入与读取；Wi-Fi IP 的写入/恢复另有 Jest 覆盖。 |

5.4 的 Wi-Fi 记忆和 5.5 的主动/意外断开区分由 Jest 覆盖，见
`mobile/__tests__/ConnectionSessionApp.test.tsx`、`SessionNotice.test.ts`、`Connection.test.tsx`。
5.6 的原生广播判定由 `tests/NativeBugfixChecks.java` 的主机检查覆盖。
