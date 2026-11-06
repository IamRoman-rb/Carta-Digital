import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Módulos de contexto/UI que exportan hooks y utilidades junto a sus componentes.
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useAuth', 'useFloor', 'useCash', 'tablesLabel', 'useModifierForm', 'passwordRule', 'STAFF_ROUTES', 'cx', 'categoryIconNames'] },
      ],
    },
  },
  { files: ['src/main.jsx'], rules: { 'react-refresh/only-export-components': 'off' } },
  { files: ['vite.config.js'], languageOptions: { globals: globals.node } },
]);
