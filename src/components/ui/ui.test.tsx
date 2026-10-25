import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { domAnimation, LazyMotion } from 'motion/react'
import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { Combobox } from './Combobox'
import { Stepper } from './Stepper'

function Host({ options }: { options: string[] }) {
  const [v, setV] = useState('')
  return <Combobox id="c" value={v} onChange={setV} options={options} />
}

describe('Combobox', () => {
  const options = ['PT Dummy', 'PT Contoh Abadi', 'CV Uji']

  it('menyaring saran, panah + Enter memilih, ketik bebas tetap boleh', async () => {
    const user = userEvent.setup()
    render(<Host options={options} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await user.type(input, 'pt')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'PT Dummy',
      'PT Contoh Abadi',
    ])
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(input).toHaveValue('PT Contoh Abadi')
    await user.clear(input)
    await user.type(input, 'Perusahaan Baru')
    expect(input).toHaveValue('Perusahaan Baru')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('Escape menutup daftar; ARIA expanded mengikuti', async () => {
    const user = userEvent.setup()
    render(<Host options={options} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Stepper', () => {
  function Counter({ start = 1 }: { start?: number }) {
    const [n, setN] = useState(start)
    return <Stepper id="s" label="Jumlah kemasan" value={n} onChange={setN} min={1} max={5} />
  }
  it('+/- dengan batas min/max dan input angka', async () => {
    const user = userEvent.setup()
    render(<Counter />)
    const minus = screen.getByRole('button', { name: 'Kurangi jumlah kemasan' })
    const plus = screen.getByRole('button', { name: 'Tambah jumlah kemasan' })
    expect(minus).toBeDisabled()
    await user.click(plus)
    await user.click(plus)
    expect(screen.getByRole('textbox', { name: 'Jumlah kemasan' })).toHaveValue('3')
    const field = screen.getByRole('textbox', { name: 'Jumlah kemasan' })
    await user.clear(field)
    await user.type(field, '99')
    expect(field).toHaveValue('5')
    expect(plus).toBeDisabled()
  })
})

describe('BottomSheet', () => {
  function Sheet({ onClose }: { onClose: () => void }) {
    return (
      <LazyMotion features={domAnimation} strict>
        <button>pemicu</button>
        <BottomSheet open onClose={onClose} title="Pilih jenis">
          <input aria-label="cari" />
          <button>satu</button>
        </BottomSheet>
      </LazyMotion>
    )
  }
  it('dialog modal berlabel, fokus masuk, Esc menutup, Tab terkunci di dalam', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    const dialog = await screen.findByRole('dialog', { name: 'Pilih jenis' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    await user.tab()
    await user.tab()
    await user.tab() // melewati elemen terakhir → kembali ke elemen pertama di dalam dialog
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
