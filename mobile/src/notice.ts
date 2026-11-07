export type NoticeAction = {label: string; onPress: () => void};

/** Notice bar contract: `{message, action}`. */
export type Notice = {message: string; action?: NoticeAction};

export function noticeOf(message: string, action?: NoticeAction): Notice {
  return action ? {message, action} : {message};
}
