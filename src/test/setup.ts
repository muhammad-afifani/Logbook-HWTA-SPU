import '@testing-library/jest-dom/vitest'

// jsdom tidak mengimplementasikan beberapa API peramban yang dipakai UI.
// (Test berlingkungan Node, mis. guard repo, tidak punya window.)
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:uji')
    URL.revokeObjectURL = vi.fn()
  }
}
