export type NoticeAction = {label: string; onPress: () => void};

/** Notice bar contract: `{message, action}`. `durationMs` overrides the default dismiss. */
export type Notice = {message: string; action?: NoticeAction; durationMs?: number};

export function noticeOf(message: string, action?: NoticeAction): Notice {
  return action ? {message, action} : {message};
}
