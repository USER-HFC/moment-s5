/**
 * Import first in a test file that checks Android-only wording or controls (OTG, the volume-key
 * shutter, API levels). Jest's React Native preset renders as iOS by default.
 */
import {Platform} from 'react-native';

Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
