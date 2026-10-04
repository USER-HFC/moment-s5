function mockGesture() {
  const builder = {
    runOnJS: () => builder,
    onBegin: () => builder,
    onUpdate: () => builder,
    onEnd: () => builder,
  };
  return builder;
}

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {Pinch: mockGesture},
  GestureDetector: ({children}) => children,
  GestureHandlerRootView: ({children, style}) => { const React = require('react'); const {View} = require('react-native'); return React.createElement(View, {style}, children); },
}));
