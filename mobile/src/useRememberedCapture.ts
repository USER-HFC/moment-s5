import {useEffect, useRef, useState} from 'react';
import {CaptureMemory, captureView, loadPreferences, saveCaptureSettings} from './preferences';
import {Guide} from './referenceFrame';

type ShotState = {motion: boolean; grid: boolean; guide: Guide; timerEnabled: boolean; delay: number};
type Update<T> = T | ((current: T) => T);

const INITIAL: ShotState = {motion: false, grid: true, guide: 'off', timerEnabled: false, delay: 10};
const TIMER_SECONDS = [2, 5, 10, 30];

function applyUpdate<T>(current: T, value: Update<T>) {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value;
}

function memoryOf(state: ShotState): CaptureMemory {
  return {
    motion: state.motion,
    grid: state.grid,
    guide: state.guide,
    timerSeconds: state.timerEnabled && TIMER_SECONDS.includes(state.delay) ? state.delay : 0,
  };
}

/**
 * Restores the last photo/motion mode, grid, reference frame and timer when that preference is on.
 * The latest choice is always written, so turning the preference on later still has this session.
 */
export default function useRememberedCapture() {
  const [motionEnabled, setMotionState] = useState(INITIAL.motion);
  const [grid, setGridState] = useState(INITIAL.grid);
  const [guide, setGuideState] = useState<Guide>(INITIAL.guide);
  const [timerEnabled, setTimerState] = useState(INITIAL.timerEnabled);
  const [delay, setDelayState] = useState(INITIAL.delay);
  const shot = useRef<ShotState>(INITIAL);
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const prefs = await loadPreferences();
      if (!live || touched.current || !prefs?.rememberCapture) return;
      const view = captureView(prefs.capture);
      const next: ShotState = {motion: view.motionEnabled, grid: view.grid, guide: view.guide, timerEnabled: view.timerEnabled, delay: view.delay};
      shot.current = next;
      setMotionState(next.motion); setGridState(next.grid); setGuideState(next.guide); setTimerState(next.timerEnabled); setDelayState(next.delay);
    })();
    return () => { live = false; };
  }, []);

  const commit = (next: ShotState) => {
    shot.current = next;
    touched.current = true;
    void saveCaptureSettings(memoryOf(next));
  };
  const setMotionEnabled = (value: Update<boolean>) => {
    const motion = applyUpdate(shot.current.motion, value);
    setMotionState(motion); commit({...shot.current, motion});
  };
  const setGrid = (value: Update<boolean>) => {
    const next = applyUpdate(shot.current.grid, value);
    setGridState(next); commit({...shot.current, grid: next});
  };
  const setGuide = (value: Update<Guide>) => {
    const next = applyUpdate(shot.current.guide, value);
    setGuideState(next); commit({...shot.current, guide: next});
  };
  const setDelay = (value: Update<number>) => {
    const next = applyUpdate(shot.current.delay, value);
    setDelayState(next); commit({...shot.current, delay: next});
  };
  const setTimerEnabled = (value: Update<boolean>) => {
    const next = applyUpdate(shot.current.timerEnabled, value);
    setTimerState(next); commit({...shot.current, timerEnabled: next});
  };
  return {motionEnabled, setMotionEnabled, grid, setGrid, guide, setGuide, timerEnabled, setTimerEnabled, delay, setDelay};
}
