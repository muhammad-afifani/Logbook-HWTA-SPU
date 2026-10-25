import { useSceneDirector } from './scene-director'

const d = () => useSceneDirector.getState()

describe('scene director', () => {
  beforeEach(() => d().clear())

  it('hanya satu adegan aktif; sisanya antre', () => {
    d().request({ id: 'a', kind: 'camera' })
    d().request({ id: 'b', kind: 'countup' })
    expect(d().active?.id).toBe('a')
    expect(d().queue.map((s) => s.id)).toEqual(['b'])
    d().finish('a')
    expect(d().active?.id).toBe('b')
    d().finish('b')
    expect(d().active).toBeNull()
  })

  it('finish dengan id yang bukan adegan aktif diabaikan', () => {
    d().request({ id: 'a', kind: 'x' })
    d().finish('zzz')
    expect(d().active?.id).toBe('a')
  })

  it('prioritas tinggi didahulukan, urutan masuk dipertahankan', () => {
    d().request({ id: 'a', kind: 'x' })
    d().request({ id: 'b', kind: 'x', priority: 'low' })
    d().request({ id: 'c', kind: 'x' })
    d().request({ id: 'd', kind: 'x', priority: 'high' })
    expect(d().queue.map((s) => s.id)).toEqual(['d', 'c', 'b'])
  })

  it('adegan dengan mergeKey sama digabung', () => {
    d().request({ id: 'a', kind: 'x' })
    d().request({ id: 'b', kind: 'toast', mergeKey: 'B105d', payload: 4 })
    d().request({ id: 'c', kind: 'toast', mergeKey: 'B105d', payload: 4 }, (prev, next) => ({
      ...prev,
      payload: (prev.payload as number) + (next.payload as number),
    }))
    expect(d().queue).toHaveLength(1)
    expect(d().queue[0]?.payload).toBe(8)
  })
})
