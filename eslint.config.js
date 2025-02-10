{
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "prettier"
  ],
  "parserOptions": {
    "ecmaVersion": 2024,
    "sourceType": "module"
  },
  "rules": {
    // "indent": [
    //   "error",
    //   2,
    //   {
    //     "SwitchCase": 1
    //   }
    // ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "quotes": [
      "error",
      "double"
    ],
    "semi": [
      "error",
      "always"
    ],
    "no-console": 0
  }
}