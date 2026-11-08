/** Native save status is already the notice. The type and LUT name are part of that line. */
const SAVED_STATUS = /^(?:动态)?照片已保存(?: · \S.*)?$/;

export function savedNoticeMessage(message: string): string | null {
  const text = message.trim();
  return SAVED_STATUS.test(text) ? text : null;
}
