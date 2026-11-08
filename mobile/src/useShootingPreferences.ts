import {useEffect, useState} from 'react';
import {loadPreferences, subscribePreferences} from './preferences';

export type ShootingPreferences = {reverseFocus: boolean; shutterVibration: boolean};

const DEFAULTS: ShootingPreferences = {reverseFocus: false, shutterVibration: true};

/** Focus reversal and shutter vibration. Defaults match the native store until it answers. */
export default function useShootingPreferences(): ShootingPreferences {
  const [prefs, setPrefs] = useState(DEFAULTS);
  useEffect(() => {
    let live = true;
    const load = () => {
      void loadPreferences().then(value => {
        if (!live || !value) return;
        setPrefs({reverseFocus: value.reverseFocus, shutterVibration: value.shutterVibration});
      });
    };
    load();
    const unsubscribe = subscribePreferences(load);
    return () => { live = false; unsubscribe(); };
  }, []);
  return prefs;
}
