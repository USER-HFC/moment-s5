import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

/** A foreground, monotonic countdown that always uses the current capture state. */
export default function useCaptureCountdown(onComplete: () => void, enabled: boolean) {
  const [waiting, setWaiting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const deadline = useRef<number | null>(null);
  const latest = useRef({onComplete, enabled});
  latest.current = {onComplete, enabled};

  const cancel = () => { deadline.current = null; setWaiting(false); };
  const start = (delay: number) => {
    if (!latest.current.enabled || AppState.currentState !== 'active') return;
    deadline.current = performance.now() + delay * 1000;
    setSeconds(delay); setWaiting(true);
  };

  useEffect(() => { if (!enabled) cancel(); }, [enabled]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') cancel(); });
    return () => { deadline.current = null; sub.remove(); };
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (deadline.current === null) return;
      if (!latest.current.enabled || AppState.currentState !== 'active') { cancel(); return; }
      const left = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setSeconds(left);
      if (left === 0) { cancel(); latest.current.onComplete(); }
    }, 100);
    return () => clearInterval(timer);
  }, [waiting]);

  return {waiting, seconds, start, cancel};
}
