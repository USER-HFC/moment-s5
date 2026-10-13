import {useEffect, useState, useSyncExternalStore} from 'react';
import {AppState, NativeModules} from 'react-native';
import {cameraEvents} from '../native';
import {createScopePanelState, ScopePanelAction, updateScopePanelState} from './panelState';
import {decodeScopeFrame, ScopeFrame} from './protocol';

// CameraWorkspace unmounts for the album; keep the open set and positions for this JS session.
let session = createScopePanelState();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
const snapshot = () => session;
export const changeScopePanel = (action: ScopePanelAction) => {
  session = updateScopePanelState(session, action);
  listeners.forEach(listener => listener());
};
export function useScopePanels() {return useSyncExternalStore(subscribe, snapshot, snapshot);}

type ScopeApi = {setScopesEnabled?: (enabled: boolean, rotateClockwise: boolean, sourceAspectRatio: number) => void};
const scopeApi = NativeModules.MomentLumix as ScopeApi | undefined;

export function useScopeData(requested: boolean, rotateClockwise: boolean, sourceAspectRatio: number) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [data, setData] = useState<ScopeFrame | null>(null);
  const [stale, setStale] = useState(false);
  const supported = typeof scopeApi?.setScopesEnabled === 'function' && !!cameraEvents;
  const enabled = requested && foreground && supported;
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => setForeground(next === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setData(null);setStale(false);
    if (!enabled) {scopeApi?.setScopesEnabled?.(false, rotateClockwise, sourceAspectRatio); return;}
    let receivedAt = 0;
    const sub = cameraEvents?.addListener('cameraScopes', (event: unknown) => {
      const decoded = decodeScopeFrame(event);
      if (!decoded || decoded.rotation !== (rotateClockwise ? 90 : 0) || decoded.sourceAspectRatio !== sourceAspectRatio) return;
      receivedAt = Date.now();setData(decoded);setStale(false);
    });
    scopeApi?.setScopesEnabled?.(true, rotateClockwise, sourceAspectRatio);
    const timer = setInterval(() => setStale(receivedAt > 0 && Date.now() - receivedAt > 800), 500);
    return () => {scopeApi?.setScopesEnabled?.(false, rotateClockwise, sourceAspectRatio);sub?.remove();clearInterval(timer);};
  }, [enabled, rotateClockwise, sourceAspectRatio]);
  return {data, stale, supported};
}
