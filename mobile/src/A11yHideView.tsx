import React from 'react';
import {requireNativeComponent, UIManager, View, type ViewProps} from 'react-native';

const nativeName = 'A11yHideView';
// The config callback runs on first mount. Tests have no view manager, so they keep a plain View.
const NativeHide = requireNativeComponent<ViewProps>(nativeName);

/** Same props as View. On Android, no-hide-descendants also drops descendants from the accessibility tree. */
export function A11yHideView(props: ViewProps) {
  if (UIManager.getViewManagerConfig(nativeName) == null) return <View {...props} />;
  return <NativeHide {...props} />;
}
