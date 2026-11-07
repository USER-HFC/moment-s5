import {describe, expect, it} from '@jest/globals';
import {captureFailureNotice, userFacingError} from '../src/captureError';

describe('user-facing capture errors', () => {
  it('turns a busy PTP response into a shutter suggestion and hides the code', () => {
    expect(userFacingError('PTP 指令 0x9404，响应 0x2019（机身忙）')).toBe('相机正忙，请稍后再按快门');
    expect(userFacingError('PTP 指令 0x1001，响应 0x2019')).not.toContain('0x2019');
    expect(userFacingError('响应 0x201E（会话已打开）')).toBe('相机已经连着，请先断开再连');
  });

  it('uses one fallback for an unknown response code', () => {
    const message = userFacingError('PTP 指令 0x1001，响应 0x20AB');
    expect(message).toBe('相机没有完成这次操作，请稍后再试');
    expect(message).not.toMatch(/0x/i);
  });

  it('maps USB disconnect, Wi-Fi confirmation and a missing original', () => {
    expect(userFacingError('USB 已拔出 · 照片保留在机身或本机')).toBe('相机已断开，请检查数据线');
    expect(userFacingError('机身未在时限内确认 Wi-Fi 连接；已取消请求')).toBe('相机没有确认连接，请在相机上点允许');
    expect(userFacingError('未找到本次唯一原 JPEG；请用单张 JPEG/RAW+JPEG，检查 SD 卡；未重发快门')).toBe('没有找到刚拍的照片，请改成单张 JPEG，并查看存储卡');
  });

  it('keeps the more specific Wi-Fi and focus sentences ahead of the generic ones', () => {
    expect(userFacingError('Wi-Fi 拍摄期间连接中断；请检查机身 SD 卡原片')).toBe('拍摄时 Wi-Fi 断了，请查看相机存储卡里的照片');
    expect(userFacingError('拍摄期间连接中断；请检查机身 SD 卡中的原片')).toBe('拍摄中断了，请检查数据线，并在相机存储卡里查看这张照片');
    expect(userFacingError('机身未执行对焦步进（响应 0x2002）；部分机型需在菜单开启 AF+MF 或切到 MF')).toBe('相机没有执行对焦，请在相机里打开手动对焦后再试');
  });

  it('leaves unknown and already-saved text unchanged, including the short JPEG miss', () => {
    expect(userFacingError('未找到本次 JPEG')).toBe('未找到本次 JPEG');
    expect(userFacingError('附近 Wi-Fi 设备权限未授权；可在系统设置手动连接相机 Wi-Fi')).toContain('权限未授权');
    expect(userFacingError('实况已保存')).toBe('实况已保存');
    expect(userFacingError('传错照片')).toBe('传错照片');
    expect(userFacingError('')).toBe('');
  });

  it('does not rewrite a sentence that is already plain language', () => {
    expect(userFacingError('相机已断开，请检查数据线')).toBe('相机已断开，请检查数据线');
    expect(userFacingError('相机正忙，请稍后再按快门')).toBe('相机正忙，请稍后再按快门');
  });

  it('drops the processing prefix only after a known failure is translated', () => {
    expect(captureFailureNotice('')).toBe('照片处理失败');
    expect(captureFailureNotice('传错照片')).toBe('照片处理失败：传错照片');
    expect(captureFailureNotice('USB 已拔出 · 照片保留在机身或本机')).toBe('相机已断开，请检查数据线');
    expect(captureFailureNotice('机身未在时限内确认 Wi-Fi 连接；已取消请求')).not.toContain('照片处理失败');
  });
});
