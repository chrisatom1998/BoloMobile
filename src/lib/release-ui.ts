/**
 * Private diagnostics are a development aid. Release builds, including App
 * Store screenshots, leave the row and the route out of the product.
 */
export function showPrivateDiagnostics() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
