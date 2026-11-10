import {useEffect, useState, useSyncExternalStore} from 'react';
import {AppState, NativeModules} from 'react-native';
import {cameraEvents} from '../native';
import {createScopePanelState, ScopePanelAction, updateScopePanelState} from './panelState';
import {decodeScopeFrame, ScopeFrame} from './protocol';

// Open set for this JS session. The capture screen stays mounted across the album, so this is not a resubscribe.
let session = createScopePanelState();
let revealHintShown = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
const snapshot = () => session;
export const changeScopePanel = (action: ScopePanelAction) => {
  session = updateScopePanelState(session, action);
  listeners.forEach(listener => listener());
};
export function useScopePanels() {return useSyncExternalStore(subscribe, snapshot, snapshot);}

/** The hint belongs to a camera connection. Leaving for the album does not remount the workspace. */
export function takeScopeRevealHint() {
  if (revealHintShown) return false;
  revealHintShown = true;
  return true;
}
export function resetScopeRevealHint() {revealHintShown = false;}

type ScopeApi = {setScopesEnabled?: (enabled: boolean, rotateClockwise: boolean, sourceAspectRatio: number) => void};
const scopeApi = NativeModules.MomentLumix as ScopeApi | undefined;

/** The scopes need the native frame analyser; iOS does not have one yet, so the drawer leaves the button out. */
export function scopesSupported() { return typeof scopeApi?.setScopesEnabled === 'function' && !!cameraEvents; }

export function useScopeData(requested: boolean, rotateClockwise: boolean, sourceAspectRatio: number) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [data, setData] = useState<ScopeFrame | null>(null);
  const [stale, setStale] = useState(false);
  const supported = scopesSupported();
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
