import pluginImport from "eslint-plugin-import";

export default [
  {
    files: ["js/**/*.js", "scripts/**/*.js", "config/**/*.js", "tests/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest"
    },
    plugins: {
      import: pluginImport
    },
    rules: {
      "import/no-unresolved": "error"
    }
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs"
    }
  }
];
