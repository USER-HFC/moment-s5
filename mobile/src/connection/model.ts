export type WifiConnectionOptions = {manual: boolean; cameraIp: string; ssid?: string; password?: string; debugEndpoint?: string; udpPort?: number};
export type ConnectionForm = {manual: boolean; cameraIp: string; ssid: string; password: string; debug: boolean; debugEndpoint: string; udpPort: string};
export const initialConnectionForm: ConnectionForm = {manual: true, cameraIp: '192.168.54.1', ssid: '', password: '', debug: false, debugEndpoint: '10.0.2.2:18080', udpPort: '49152'};

export function connectionOptions(form: ConnectionForm, debugAllowed: boolean): WifiConnectionOptions {
  if (form.debug) {
    if (!debugAllowed) throw new Error('模拟相机调试仅限 debug APK');
    const endpoint = form.debugEndpoint.trim();
    if (!/^[A-Za-z0-9.-]+:[0-9]+$/.test(endpoint) || Number(endpoint.split(':')[1]) < 1 || Number(endpoint.split(':')[1]) > 65535) throw new Error('请输入调试主机:端口');
    const udpPort = Number(form.udpPort);
    if (!/^[0-9]+$/.test(form.udpPort) || !Number.isInteger(udpPort) || udpPort < 1 || udpPort > 65535) throw new Error('UDP 端口须为 1–65535');
    return {manual: true, cameraIp: form.cameraIp.trim(), debugEndpoint: endpoint, udpPort};
  }
  const cameraIp = form.cameraIp.trim();
  const ip = cameraIp.split('.');
  if (ip.length !== 4 || ip.some(part => !/^[0-9]{1,3}$/.test(part) || Number(part) > 255)) throw new Error('请输入相机 IPv4 地址');
  if (!form.manual && !form.ssid.trim()) throw new Error('请输入相机 Wi-Fi SSID');
  return {manual: form.manual, cameraIp, ...(form.manual ? {} : {ssid: form.ssid, password: form.password})};
}
