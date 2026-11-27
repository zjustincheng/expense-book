export default {
  "*.{ts,tsx,js,mjs,cjs}": [
    "eslint --no-warn-ignored",
    "prettier --check --ignore-unknown",
  ],
  "*.{json,md,yml,yaml,css}": ["prettier --check --ignore-unknown"],
};
