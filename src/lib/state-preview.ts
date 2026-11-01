/**
 * Screenshot and development builds can open `/state-preview` to force a
 * screen state. Release builds leave the flag unset, and the route redirects
 * home without rendering the fixture.
 */
export function statePreviewEnabled(
  dev = typeof __DEV__ !== 'undefined' && __DEV__,
  flag = process.env.EXPO_PUBLIC_BOLO_STATE_FIXTURES,
) {
  return dev === true || flag === '1';
}
