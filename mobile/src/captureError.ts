/** Screen copy for failures the camera bridge already logged verbatim. */

const PTP_RESPONSE: Record<string, string> = {
  '2002': '相机没有完成这次操作，请再试一次',
  '2003': '相机连接已失效，请重新连接',
  '2005': '相机不支持这个操作',
  '2006': '相机不接受这个设置',
  '2007': '照片没有传完，请再拍一张',
  '200c': '存储卡已满，请空出空间后再拍',
  '200f': '相机拒绝了这次操作',
  '2013': '相机读不到存储卡，请检查卡是否插好',
  '2018': '这次拍摄已结束，请再按快门',
  '2019': '相机正忙，请稍后再按快门',
  '201d': '相机不接受这个设置',
  '201e': '相机已经连着，请先断开再连',
  '201f': '这次操作被取消了，请再试一次',
};

const RULES: [RegExp, string][] = [
  [/机身未在时限内确认|认证超时/, '相机没有确认连接，请在相机上点允许'],
  [/Wi-Fi 认证被拒绝|请在机身接受设备登记/, '相机拒绝了连接，请在相机上点允许'],
  [/加密握手，但没有返回随机数/, '相机无法完成连接，请更新相机固件后再试'],
  [/不是松下 LUMIX/, '这不是松下相机，请改用 USB 连接'],
  [/未读取到相机 DLNA|实验协议不兼容/, '没有找到相机，请确认 IP，并在相机上打开 Wi-Fi 遥控'],
  [/网络不可达/, '连不上相机，请确认手机连着相机的 Wi-Fi，并在「设置」里允许本 App 访问本地网络'],
  [/连接相机超时/, '连不上相机，请确认相机 IP，并在相机上打开 Wi-Fi 遥控'],
  [/相机拒绝连接/, '相机没有在等待连接，请在相机上打开 Wi-Fi 遥控拍摄'],
  [/未收到完整取景帧/, '收不到取景画面，请检查相机是否在拍摄模式，以及手机网络'],
  [/未声明 Wi-Fi AF/, '这台相机的 Wi-Fi 不能自动对焦，请改用 USB'],
  [/未声明 Wi-Fi MF/, '这台相机的 Wi-Fi 不能手动对焦，请改用 USB'],
  [/快门结果不确定或被拒绝/, '快门没有确认，请查看相机存储卡后重新连接'],
  [/Wi-Fi 拍摄期间连接中断/, '拍摄时 Wi-Fi 断了，请查看相机存储卡里的照片'],
  [/未找到本次唯一原 JPEG/, '没有找到刚拍的照片，请改成单张 JPEG，并查看存储卡'],
  [/无法确认本次照片|出现多个新原 JPEG/, '拍到了多张新照片，无法确定是哪一张，请查看相机存储卡'],
  [/Wi-Fi 原片长度|原片长度不符/, '照片没有完整传来，请再拍一张'],
  [/无法切回拍摄模式/, '相机没有回到拍摄，请重新连接'],
  [/目录在分页时变化|未能建立完整快门前目录基线/, '相机还在准备，请稍后再按快门'],
  [/对焦步进/, '相机没有执行对焦，请在相机里打开手动对焦后再试'],
  // Before the generic USB / Wi-Fi disconnect rules: this one says why and what to do.
  [/App 切到后台/, '切到后台时相机会断开，回来后请重新连接'],
  [/拍摄期间连接中断/, '拍摄中断了，请检查数据线，并在相机存储卡里查看这张照片'],
  [/USB 已拔出|USB 已断开|USB 超时或已断开|USB 写入失败或超时|USB 读取失败|相机已断开|相机会话已失效/, '相机已断开，请检查数据线'],
  [/没有 USB 访问权限|USB 访问未授权/, '手机没有允许连接相机，请重新点连接并允许'],
  [/USB 接口被其他应用占用/, '相机被其他应用占用了，请关闭后再连'],
  [/没有 PTP 双向端点|仅支持 Panasonic PTP/, '相机没有进入电脑连接，请在相机里选择 PC(Tether)，并检查数据线'],
  [/未找到 USB 相机/, '没有发现相机，请检查数据线，并在相机里选择 PC(Tether)'],
  [/未获准控制 USB 相机/, '手机没有允许本 App 控制相机，请到「设置」里允许后再连接'],
  [/USB 会话打开超时/, '相机没有响应，请重新插拔数据线后再连'],
  [/未发现 Panasonic/, '没有发现相机，请检查数据线、OTG，并在相机里选择 PC(Tether)'],
  [/不支持 USB 主机/, '这台手机不能用 USB 连接相机'],
  [/超过当前 64 MB|超过接收上限/, '这张照片太大，当前无法接收'],
  [/Wi-Fi 已断开|Wi-Fi 连接已取消/, '相机的 Wi-Fi 断开了，请重新连接'],
  [/相机拒绝 Wi-Fi 指令/, '相机没有接受这个操作，请稍后再试'],
];

/** Known failures become a short suggestion. Anything else is shown unchanged. */
export function userFacingError(raw: string): string {
  const text = raw.trim();
  if (!text) return raw;
  for (const [pattern, message] of RULES) if (pattern.test(text)) return message;
  const code = text.match(/响应\s*0x([0-9a-fA-F]{4})/);
  if (code) return PTP_RESPONSE[code[1].toLowerCase()] ?? '相机没有完成这次操作，请稍后再试';
  return raw;
}

/** A known failure replaces the engineering prefix. Unknown text keeps it. */
export function captureFailureNotice(detail: string): string {
  if (!detail) return '照片处理失败';
  const friendly = userFacingError(detail);
  return friendly === detail ? `照片处理失败：${detail}` : friendly;
}
