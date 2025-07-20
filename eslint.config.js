import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		plugins: {
			import: importPlugin
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/', '*.config.js', '*.config.ts']
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/prefer-const': 'error',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'svelte/no-at-html-tags': 'off',
			'svelte/valid-compile': 'error',
			'svelte/no-reactive-functions': 'error',
			'svelte/no-reactive-literals': 'error',
			'import/order': [
				'error',
				{
					groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
					'newlines-between': 'always',
					alphabetize: {
						order: 'asc',
						caseInsensitive: true
					}
				}
			],
			'import/no-duplicates': 'error',
			'import/no-unresolved': 'off',
			'prefer-const': 'error',
			'no-var': 'error',
			'no-console': 'warn',
			'no-debugger': 'error'
		}
	}
];
