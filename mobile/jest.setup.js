const mockGestures = [];
function mockGesture(kind) {
  const handlers = {kind};
  const builder = {
    runOnJS: () => builder,
    enabled: () => builder,
    manualActivation: () => builder,
    numberOfTaps: () => builder,
    maxDistance: () => builder,
    activeOffsetX: () => builder,
    activeOffsetY: () => builder,
    onBegin: (fn) => { handlers.onBegin = fn; return builder; },
    onStart: (fn) => { handlers.onStart = fn; return builder; },
    onUpdate: (fn) => { handlers.onUpdate = fn; return builder; },
    onEnd: (fn) => { handlers.onEnd = fn; return builder; },
    onFinalize: (fn) => { handlers.onFinalize = fn; return builder; },
    onTouchesMove: (fn) => { handlers.onTouchesMove = fn; return builder; },
  };
  mockGestures.push(handlers);
  return builder;
}

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    Gesture: {
      Pinch: () => mockGesture('pinch'),
      Pan: () => mockGesture('pan'),
      Tap: () => mockGesture('tap'),
      Native: () => mockGesture('native'),
      Simultaneous: () => mockGesture('simultaneous'),
      Exclusive: () => mockGesture('exclusive'),
    },
    GestureDetector: ({children}) => children,
    GestureHandlerRootView: ({children, style}) => React.createElement(View, {style}, children),
    __gestures: mockGestures,
  };
});
/* global jest */
