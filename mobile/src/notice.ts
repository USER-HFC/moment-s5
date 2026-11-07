export type NoticeAction = {label: string; onPress: () => void};

/** Shared with the upcoming notice bar: `{message, action}`. */
export type Notice = {message: string; action?: NoticeAction};

export function noticeOf(message: string, action?: NoticeAction): Notice {
  return action ? {message, action} : {message};
}
