export const LOW_CAMERA_BATTERY_PERCENT = 15;
export const LOW_CAMERA_BATTERY_MESSAGE = '相机电量低';

export type BatteryNoticeSession = {connection: boolean; warned: boolean};

/** A real percent at or under the limit. Missing and out-of-range readings are not low. */
export function cameraBatteryLow(percent: number | null | undefined) {
  return typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= LOW_CAMERA_BATTERY_PERCENT;
}

/**
 * One warning for each connection. Dropping again after a recovery stays quiet.
 * Disconnecting clears it, so the next connection can warn again.
 * A missing reading does not use up the one warning.
 */
export function noteLowCameraBattery(session: BatteryNoticeSession, active: boolean, percent: number | null | undefined): BatteryNoticeSession & {notify: boolean} {
  if (!active) return {connection: false, warned: false, notify: false};
  const warned = session.connection ? session.warned : false;
  if (warned || !cameraBatteryLow(percent)) return {connection: true, warned, notify: false};
  return {connection: true, warned: true, notify: true};
}
