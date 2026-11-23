// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "web-build/**",
      "android/**",
      "ios/**",
      "assets/**",
      "coverage/**",
    ],
  },
  {
    // Plain Node files (tests, build scripts, config) - not bundled into the app.
    files: ["test/**", "scripts/**", "config/**", "app.config.js", "metro.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]);
