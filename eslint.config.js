import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Kode 3D hanya boleh di folder 3D (dimuat lazy) — halaman form tidak boleh menarik three.js.
const THREE_PATTERN = {
  group: ['three', 'three/*', '@react-three/*'],
  message: 'Kode 3D hanya boleh di src/features/spu3d atau src/features/site3d (dimuat lazy).',
}

// BATAS DATA PUBLIK (Amandemen 1): kode publik hanya boleh memakai kontrak
// src/lib/api/public-status.ts (persen kapasitas + ada/tidak ada limbah).
// Data petugas (kg, drum, lot, nama, telepon) dan 3D interior tidak boleh diimpor.
const PUBLIC_BOUNDARY_PATTERNS = [
  {
    group: ['@/features/officer', '@/features/officer/*', '**/features/officer/*'],
    message: 'Batas publik: modul petugas tidak boleh diimpor dari halaman publik.',
  },
  {
    group: ['@/features/spu3d', '@/features/spu3d/*', '**/features/spu3d/*'],
    message:
      'Batas publik: 3D interior khusus petugas. Pindah ke interior lewat route petugas, bukan import.',
  },
  {
    group: ['@supabase/*'],
    message:
      'Batas publik: halaman publik tidak boleh membawa supabase-js (pakai fetch ke Edge Function).',
  },
  {
    group: ['@/lib/supabase', '@/lib/supabase*', '@/lib/api/*', '!@/lib/api/public-status'],
    message: 'Batas publik: hanya boleh memakai @/lib/api/public-status.',
  },
]

/** File/folder yang tampil ke publik tanpa login. */
export const PUBLIC_FILES = [
  'src/features/site3d/**',
  'src/features/submit-form/**',
  'src/features/status-check/**',
  'src/features/public-dashboard/**',
  'src/routes/LaporPage.tsx',
  'src/routes/StatusPage.tsx',
  'src/routes/DashboardPage.tsx',
  'src/routes/SitePage.tsx',
]

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'supabase/functions',
      'playwright-report',
      'test-results',
      'src/test/fixtures/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { patterns: [THREE_PATTERN] }],
    },
  },
  {
    // Folder 3D boleh memakai three.js.
    files: ['src/features/spu3d/**', 'src/features/site3d/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Halaman publik: batas data publik. (site3d boleh three, tapi tetap terkena batas data.)
    files: PUBLIC_FILES,
    ignores: ['src/features/site3d/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [THREE_PATTERN, ...PUBLIC_BOUNDARY_PATTERNS] },
      ],
    },
  },
  {
    files: ['src/features/site3d/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: PUBLIC_BOUNDARY_PATTERNS }],
    },
  },
)
