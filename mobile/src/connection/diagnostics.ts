import {BuildInfo} from '../buildInfo';

type Opener = () => void;
let opener: Opener | null = null;

/** The failure notice lives outside the settings tree, so App registers the page change. */
export function registerDiagnosticsOpener(open: Opener) {
  opener = open;
  return () => { if (opener === open) opener = null; };
}

export function openDiagnosticsPage() {
  opener?.();
}

// A shared log is copied and sent to other apps. Never let a camera serial ride along.
const SERIAL_LINE = /序列号|serial\s*number|serialnumber/i;
// CaptureEngine writes "<elapsed> <wall-clock millis> <message>". Elapsed time is boot time; the page shows the wall clock.
const STAMPED_LINE = /^(\d+)\s+(\d{12,16})\s+([\s\S]*)$/;

export function formatDiagnosticClock(epochMs: number) {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDiagnosticLine(line: string) {
  const match = line.match(STAMPED_LINE);
  if (!match) return line;
  const clock = formatDiagnosticClock(Number(match[2]));
  return clock ? `${clock} ${match[3]}` : line;
}

/** Native diagnostics append in time order, so the newest line stays last. */
export function presentDiagnostics(raw: string) {
  return raw.split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !SERIAL_LINE.test(line);
  }).map(formatDiagnosticLine).join('\n');
}

export function scrollDiagnosticsToEnd(view: {scrollToEnd: (options?: {animated?: boolean}) => void} | null) {
  view?.scrollToEnd({animated: false});
}

export type DiagnosticFacts = {
  versionName: string; versionCode: string; androidVersion: string; phoneModel: string; connection: string;
};

// Copied text is sent to other apps. A newline in a device string would look like an extra fact.
function singleLine(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

type DeviceConstants = {Release?: unknown; Version?: unknown; Model?: unknown; systemName?: unknown; osVersion?: unknown};

/** Platform's constant union does not share a name with these fields, so read them off a plain object. */
function deviceConstants(constants: object | null | undefined): DeviceConstants {
  if (!constants) return {};
  const source = constants as DeviceConstants;
  return {Release: source.Release, Version: source.Version, Model: source.Model, systemName: source.systemName, osVersion: source.osVersion};
}

/** Release is the Android version people recognize. API is only a fallback when Release is missing. */
export function androidVersionLabel(constants: object | null | undefined) {
  const device = deviceConstants(constants);
  // iOS reports systemName and osVersion instead of Release and Version.
  const ios = singleLine(device.osVersion);
  if (ios) return `${singleLine(device.systemName) || 'iOS'} ${ios}`;
  const release = singleLine(device.Release);
  if (release) return /^android\b/i.test(release) ? release : `Android ${release}`;
  const api = singleLine(device.Version);
  return api ? `Android API ${api}` : '未知';
}

export function phoneModelLabel(constants: object | null | undefined) {
  return singleLine(deviceConstants(constants).Model) || '未知';
}

/** Connection as a photographer would name it. Anything else stays「未连接」. */
export function connectionModeLabel(state: {active?: boolean; demo?: boolean; transport?: string | null} | null | undefined) {
  if (!state?.active) return '未连接';
  if (state.demo || state.transport === 'demo') return '演示';
  if (state.transport === 'wifi') return 'Wi-Fi';
  if (state.transport === 'usb') return 'USB';
  return '未连接';
}

const HEADER_FIELDS: Array<[string, keyof DiagnosticFacts]> = [
  ['App 版本', 'versionName'],
  ['构建号', 'versionCode'],
  ['系统版本', 'androidVersion'],
  ['手机型号', 'phoneModel'],
  ['连接方式', 'connection'],
];

/**
 * Only the five fields a bug report needs. Serial, fingerprint, git and account stay out:
 * those identify a person, and this block is copied into other apps.
 */
export function diagnosticFacts(
  build: Pick<BuildInfo, 'versionName' | 'versionCode'>,
  constants: object | null | undefined,
  connection: string,
): DiagnosticFacts {
  return {
    versionName: singleLine(build.versionName) || '未知',
    versionCode: singleLine(build.versionCode) || '未知',
    androidVersion: androidVersionLabel(constants),
    phoneModel: phoneModelLabel(constants),
    connection: singleLine(connection) || '未连接',
  };
}

/** Label / value pairs in report order, for the on-screen card. */
export function diagnosticRows(facts: DiagnosticFacts): Array<[string, string]> {
  return HEADER_FIELDS.map(([label, key]) => [label, facts[key]]);
}

export function diagnosticHeader(facts: DiagnosticFacts) {
  return diagnosticRows(facts).map(([label, value]) => `${label}：${value}`).join('\n');
}

/** Header first, then the already redacted log. An empty log still shares the header. */
export function diagnosticShareText(facts: DiagnosticFacts, log: string) {
  const head = diagnosticHeader(facts);
  const body = log.trim();
  return body ? `${head}\n\n${body}` : head;
}
