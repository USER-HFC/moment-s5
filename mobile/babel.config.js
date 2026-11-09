module.exports = api => {
  // Jest renders with plain React Native; className is passed through and checked by intent, not by computed style.
  const test = api.env('test');
  return {
    presets: [
      ['module:@react-native/babel-preset', {}],
      ...(test ? [] : ['nativewind/babel']),
    ],
    plugins: [
      // Reanimated's plugin has to stay last.
      'react-native-reanimated/plugin',
    ],
  };
};
