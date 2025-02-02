/* eslint-disable one-var */
/* eslint-disable id-length */
/* eslint-disable @stylistic/quote-props */
/* eslint-disable no-magic-numbers */
import globals from "globals";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import node from "eslint-plugin-n";
import stylistic from "@stylistic/eslint-plugin";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const baseTsRules = {
    ...js.configs.all.rules,
    ...ts.configs.all?.rules,
    "@typescript-eslint/max-params": [
        "error",
        {
            "max": 7
        }
    ],
    "@typescript-eslint/naming-convention": [
        "error",
        {
            "format": null,
            "selector": "enumMember"
        }
    ],
    "@typescript-eslint/no-invalid-void-type": "off",
    "@typescript-eslint/no-magic-numbers": "off",
    "@typescript-eslint/no-unsafe-type-assertion": "off",
    "@typescript-eslint/no-unused-vars": [
        "error",
        {
            "caughtErrorsIgnorePattern": "^ignoreErr"
        }
    ],
    "@typescript-eslint/prefer-readonly-parameter-types": "off",
    "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
            "allowNullableNumber": true,
            "allowNullableString": true
        }
    ],
    "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
            "considerDefaultExhaustiveForUnions": true
        }
    ],
    "func-style": "off",
    "max-len": [
        "error",
        {
            "code": 130,
            "ignoreComments": true,
            "ignoreRegExpLiterals": true,
            "ignoreTemplateLiterals": true
        }
    ],
    "max-lines": [
        "error",
        1000
    ],
    "max-lines-per-function": [
        "error",
        300
    ],
    "max-params": "off",
    "max-statements": [
        "error",
        50
    ],
    "multiline-ternary": "off",
    "no-console": "off",
    "no-continue": "off",
    "no-empty": [
        "error",
        {
            "allowEmptyCatch": true
        }
    ],
    "no-inline-comments": "off",
    "no-plusplus": "off",
    "no-ternary": "off",
    "no-undef-init": "off",
    "no-undefined": "off",
    "no-useless-assignment": "off",
    "no-void": [
        "error",
        {
            "allowAsStatement": true
        }
    ],
    "one-var": "off"
};

const styleRules = {
    ...stylistic.configs["all-flat"].rules,
    "@stylistic/array-bracket-spacing": "off",
    "@stylistic/array-element-newline": "off",
    "@stylistic/arrow-parens": [
        "error",
        "as-needed",
        {
            "requireForBlockBody": true
        }
    ],
    "@stylistic/dot-location": [
        "error",
        "property"
    ],
    "@stylistic/function-call-argument-newline": "off",
    "@stylistic/function-paren-newline": [
        "error",
        "consistent"
    ],
    "@stylistic/implicit-arrow-linebreak": "off",
    "@stylistic/indent-binary-ops": "off",
    "@stylistic/lines-around-comment": "off",
    "@stylistic/lines-between-class-members": "off",
    "@stylistic/multiline-ternary": [
        "error",
        "always-multiline"
    ],
    "@stylistic/newline-per-chained-call": "off",
    "@stylistic/no-confusing-arrow": "off",
    "@stylistic/object-curly-spacing": [
        "error",
        "always"
    ],
    "@stylistic/object-property-newline": "off",
    "@stylistic/padded-blocks": [
        "error",
        {
            "blocks": "never"
        }
    ],
    "@stylistic/quote-props": [
        "error",
        "as-needed"
    ],
    "@stylistic/quotes": [
        "error",
        "double",
        {
            "allowTemplateLiterals": true
        }
    ],
    "@stylistic/space-before-function-paren": [
        "error",
        {
            "anonymous": "always",
            "asyncArrow": "always",
            "named": "never"
        }
    ]
};

const nodeRules = {
    ...node.configs["flat/recommended"].rules,
    "n/hashbang": "off",
    "n/no-missing-import": [
        "error",
        {
            "resolvePaths": [import.meta.dirname]
        }
    ]
};

export default [
    {
        settings: {
            n: {
                tryExtensions: [".ts", ".mjs"],
                version: ">= 22.0.0"
            }
        }
    },
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/backup/**"
        ]
    },
    {
        files: ["*.json"],
        ignores: [".vscode/**", "package-lock.json"],
        language: "json/json",
        ...json.configs.recommended,
        plugins: {
            json
        }
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            globals: {
                ...globals.node,
                NodeJS: "readonly"
            },
            parser: tsParser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: "."
            }
        },
        linterOptions: {
            reportUnusedDisableDirectives: "warn"
        },
        plugins: {
            "@stylistic": stylistic,
            "@typescript-eslint": ts,
            n: node
        },
        rules: {
            ...baseTsRules,
            ...styleRules,
            ...nodeRules
        }
    },
    {
        files: ["**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022
        },
        linterOptions: {
            reportUnusedDisableDirectives: "warn"
        },
        plugins: {
            "@stylistic": stylistic
        },
        rules: {
            ...styleRules,
            ...js.configs.all.rules
        }
    },
    {
        files: ["**/*.md"],
        language: "markdown/commonmark",
        plugins: {
            markdown
        },
        rules: Object.fromEntries(
            Object.keys(markdown.rules).map(rule => [`markdown/${rule}`, "error"])
        )
    }
];
