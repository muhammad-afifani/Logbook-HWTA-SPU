import { render, screen } from '@testing-library/react'
import { domAnimation, LazyMotion } from 'motion/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import LaporPage from './LaporPage'

describe('AppShell', () => {
  it('menampilkan navigasi utama dan label lokasi tetap SPU', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <AppShell />, children: [{ path: 'lapor', element: <LaporPage /> }] }],
      { initialEntries: ['/lapor'] },
    )
    render(
      <LazyMotion features={domAnimation} strict>
        <RouterProvider router={router} />
      </LazyMotion>,
    )
    expect(
      await screen.findByRole('heading', { name: 'Lapor limbah B3 masuk' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Navigasi utama' })).toHaveLength(2)
    expect(screen.getAllByText('SPU').length).toBeGreaterThan(0)
    // Tidak ada pemilih lokasi.
    expect(screen.queryByRole('combobox', { name: /lokasi/i })).toBeNull()
  })
})
