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
