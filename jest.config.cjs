const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  "preset": "jest-expo",
  "resolver": "react-native-worklets/jest/resolver.js",
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^heroui-native(?:/.*)?$": "<rootDir>/__mocks__/heroui-native.js",
    "^react-native-gesture-handler$": "<rootDir>/__mocks__/react-native-gesture-handler.js",
    "\\.(css)$": "<rootDir>/__mocks__/style.js"
  },
  "testPathIgnorePatterns": [
    "/node_modules/",
    "/src/app/"
  ],
  "restoreMocks": true,
  "clearMocks": true,
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}"
  ],
  "coverageThreshold": {
    "global": {
      "statements": 86,
      "branches": 76,
      "functions": 83,
      "lines": 90
    }
  },
  // Keep every Expo preset rule while allowing the patched decoder's ESM source.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('/node_modules/', '/node_modules/(?!decode-uri-component/)'),
  ),
};
