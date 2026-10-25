import { m, useReducedMotion } from 'motion/react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { SITE } from '@/config/env'
import { page, pageReduced } from '@/design/motion'
import { useTheme } from '@/lib/theme'
import { IconMoon, IconSun } from '@/components/ui/icons'
import { NAV_ITEMS } from './nav'

function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M32 8 54 21v22L32 56 10 43V21z"
        fill="var(--c-accent-soft)"
        stroke="var(--c-accent)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M22 30h20M22 38h13" stroke="var(--c-text)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Label lokasi tetap — tidak ada pemilih lokasi. */
export function SiteBadge() {
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-surface-strong px-2.5 font-mono text-xs font-semibold tracking-wide text-fg"
      title="Lokasi"
    >
      <span className="text-fg-faint">Lokasi</span> {SITE}
    </span>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="grid size-12 place-items-center rounded-xl text-fg-muted transition-opacity hover:text-fg"
      aria-label={next === 'light' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
}

function Header() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md lg:hidden"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div
        className="flex h-[var(--header-h)] items-center gap-3 px-4"
        style={{
          paddingLeft: 'max(1rem, var(--safe-left))',
          paddingRight: 'max(0.25rem, var(--safe-right))',
        }}
      >
        <BrandMark />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-bold">E-Logbook</p>
          <p className="truncate text-[11px] text-fg-muted">Limbah B3 · Penyimpanan sementara</p>
        </div>
        <SiteBadge />
        <ThemeToggle />
      </div>
    </header>
  )
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-bg-elevated/70 px-4 py-5 backdrop-blur-md lg:flex">
      <div className="flex items-center gap-3 px-2">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-base font-bold">E-Logbook</p>
          <p className="text-xs text-fg-muted">Limbah B3</p>
        </div>
      </div>
      <div className="mt-4 px-2">
        <SiteBadge />
      </div>
      <nav aria-label="Navigasi utama" className="mt-6 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-opacity ${
                isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between px-2">
        <NavLink to="/desain" className="text-xs text-fg-faint underline-offset-4 hover:underline">
          Design system
        </NavLink>
        <ThemeToggle />
      </div>
    </aside>
  )
}

function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-md transition-transform duration-200 ease-out lg:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto grid h-[var(--bottom-nav-h)] max-w-lg grid-cols-4">
        {NAV_ITEMS.map(({ to, short, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-opacity ${
                  isActive ? 'text-accent' : 'text-fg-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-7 w-12 place-items-center rounded-full transition-[background-color] ${
                      isActive ? 'bg-accent-soft' : ''
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  {short}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function PageFallback() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-8 w-1/2" />
      <div className="skeleton h-28" />
      <div className="skeleton h-28" />
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const reduced = useReducedMotion()

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#konten"
        className="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('konten')?.focus()
        }}
      >
        Lewati ke konten
      </a>
      <Header />
      <Sidebar />
      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+1rem)] outline-none lg:pb-10"
        style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}
      >
        <p
          role="note"
          className="mx-4 mt-3 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-fg lg:mx-8 lg:mt-6"
        >
          <strong className="font-semibold text-warn">PROTOTIPE</strong> — belum untuk catatan
          resmi. Gunakan data dummy saja; jangan masukkan nama atau nomor telepon asli.
        </p>
        <Suspense fallback={<PageFallback />}>
          <m.div
            key={location.pathname}
            variants={reduced ? pageReduced : page}
            initial="initial"
            animate="animate"
          >
            <Outlet />
          </m.div>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}
