import { render } from '@testing-library/react'
import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'

/** Render dengan LazyMotion (komponen `m` wajib) dan router memori. */
export function renderWithApp(ui: ReactElement, initialEntry = '/') {
  const router = createMemoryRouter([{ path: '*', element: ui }], {
    initialEntries: [initialEntry],
  })
  return render(
    <LazyMotion features={domAnimation} strict>
      <RouterProvider router={router} />
    </LazyMotion>,
  )
}
