module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
    "jest/globals": true,
  },
  plugins: ["jest"],
  extends: "eslint:recommended",
  overrides: [
    {
      files: ["test/**"],
      plugins: ["jest"],
      extends: ["plugin:jest/recommended"],
      rules: { "jest/prefer-expect-assertions": "off" },
    },
  ],
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    "no-console": "error",
  },
}
