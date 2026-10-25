export type BuildInfo = {
  versionName: string; versionCode: string; builtAt: string; git: string;
  buildType: string; abi: string; minSdk: string;
};

export const UNKNOWN_BUILD: BuildInfo = {
  versionName: '未知', versionCode: '未知', builtAt: '未知', git: '未知',
  buildType: '未知', abi: '未知', minSdk: '未知',
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '未知';
}

/** Native constants are injected at build time. A missing bridge still renders 未知. */
export function buildInfoFromModule(module: {buildInfo?: Partial<BuildInfo> | null} | null | undefined): BuildInfo {
  const raw = module?.buildInfo;
  if (!raw) return UNKNOWN_BUILD;
  return {
    versionName: text(raw.versionName), versionCode: text(raw.versionCode), builtAt: text(raw.builtAt),
    git: text(raw.git), buildType: text(raw.buildType), abi: text(raw.abi), minSdk: text(raw.minSdk),
  };
}

export function minAndroidLabel(api: string) {
  if (api === '33') return 'Android 13（API 33）';
  return api === '未知' ? '未知' : `API ${api}`;
}

/** Build timestamps are UTC ISO strings; people compare them against local clock time. */
export function formatBuiltAt(raw: string) {
  const date = new Date(raw);
  if (!raw || raw === '未知' || Number.isNaN(date.getTime())) return raw;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** One block for bug reports, so nobody has to stitch rows together by hand. */
export function buildInfoText(build: BuildInfo) {
  return [
    `瞬间 Lumix ${build.versionName}（${build.versionCode}）`,
    `构建时间：${formatBuiltAt(build.builtAt)}`,
    `提交：${build.git}`,
    `构建类型：${build.buildType}`,
    `ABI：${build.abi}`,
    `最低 Android 版本：${minAndroidLabel(build.minSdk)}`,
  ].join('\n');
}
