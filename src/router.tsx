import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'

/**
 * HashRouter: aman untuk GitHub Pages (tanpa rewrite server).
 * Halaman form dimuat lebih dulu; halaman lain (dan semua kode 3D) dipecah per route.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/lapor" replace /> },
      {
        path: 'lapor',
        lazy: async () => ({ Component: (await import('@/routes/LaporPage')).default }),
      },
      {
        path: 'status',
        lazy: async () => ({ Component: (await import('@/routes/StatusPage')).default }),
      },
      {
        path: 'dashboard',
        lazy: async () => ({ Component: (await import('@/routes/DashboardPage')).default }),
      },
      {
        path: 'petugas/*',
        lazy: async () => ({ Component: (await import('@/routes/PetugasPage')).default }),
      },
      {
        path: 'desain',
        lazy: async () => ({ Component: (await import('@/routes/DesignPage')).default }),
      },
      {
        path: '*',
        lazy: async () => ({ Component: (await import('@/routes/NotFoundPage')).default }),
      },
    ],
  },
])
