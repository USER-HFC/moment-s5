import {Dispatch, SetStateAction, useEffect} from 'react';
import {AppState} from 'react-native';
import {camera, CameraState} from '../native';

/** getState reads cached native telemetry only; never enqueue camera I/O for the HUD. */
export default function useCameraReadings(state: CameraState, setState: Dispatch<SetStateAction<CameraState>>, visible: boolean) {
  useEffect(() => {
    if (!visible || !state.active || !camera) return;
    let current = true, pending = false;
    const read = async () => {
      if (!current || pending || AppState.currentState !== 'active') return;
      pending = true;
      try {
        const next = await camera!.getState();
        if (current && AppState.currentState === 'active') setState(next);
      } catch { /* A reading failure never interrupts preview or capture. */ }
      finally {pending = false;}
    };
    const timer = setInterval(() => {void read();}, 1000);
    const subscription = AppState.addEventListener('change', next => {if (next === 'active') void read();});
    return () => {current = false; clearInterval(timer); subscription.remove();};
  }, [state.active, state.demo, state.transport, setState, visible]);
}
