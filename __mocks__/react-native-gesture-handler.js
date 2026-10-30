const { View } = require('react-native');

function chain() {
  const gesture = {
    activeOffsetY: () => gesture,
    enabled: () => gesture,
    failOffsetX: () => gesture,
    minDistance: () => gesture,
    onBegin: () => gesture,
    onEnd: () => gesture,
    onFinalize: () => gesture,
    onStart: () => gesture,
    onUpdate: () => gesture,
    runOnJS: () => gesture,
  };
  return gesture;
}

module.exports = {
  GestureHandlerRootView: View,
  GestureDetector: View,
  Gesture: {
    Exclusive: () => chain(),
    Pan: () => chain(),
    Race: () => chain(),
    Simultaneous: () => chain(),
    Tap: () => chain(),
  },
};
