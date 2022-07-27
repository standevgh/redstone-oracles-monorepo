module.exports = {
  preset: "ts-jest",
  roots: ["<rootDir>/"],
  testMatch: ["**/test/**/?(*.)+(spec).+(ts)"],
  transform: {
    "^.+\\.(ts|js)$": "ts-jest",
  },
  testEnvironment: "node",
  testRunner: "jest-circus/runner",
  transformIgnorePatterns: ["<rootDir>/node_modules/(?!@assemblyscript/.*)"],
  setupFiles: ["<rootDir>/.jest/setEnvVars.js"],
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
};
