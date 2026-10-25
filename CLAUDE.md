# CLAUDE.md — E-Logbook SPU

Logbook digital penyimpanan sementara limbah B3 untuk satu lokasi: **SPU**.
Rencana lengkap & keputusan: `docs/PLAN.md`. Patuhi file ini di setiap fase.

## Batasan biaya & status (Amandemen 1)

- **100% gratis**, kecuali langganan Claude Code: GitHub Pages (repo publik) + GitHub Actions, Supabase Free, Cloudflare Turnstile, SMTP bawaan Supabase, domain bawaan Pages.
- Fitur yang butuh layanan/paket berbayar (custom SMTP, image transformation, PITR, branching, custom domain, SaaS lain) → **BERHENTI dan tanya dulu**. Jangan menambahkannya sendiri, termasuk layanan pihak ketiga "gratis" yang belum disetujui.
- Status **PROTOTIPE**: README dan banner aplikasi menyatakan belum untuk catatan resmi. Banner dipertahankan sampai pindah ke paket berbayar.
- Data uji coba **wajib dummy** (seed, demo, e2e, screenshot). Jangan pernah menulis nama atau telepon asli di kode, seed, test, atau issue.

## Stack

- Vite 8 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`) + Tailwind 4
- `motion` (Framer Motion) via `LazyMotion` + `m.*` (mode `strict`, jangan pakai `motion.*`)
- React Router 8 **HashRouter** (`createHashRouter`) — aman untuk GitHub Pages
- React Three Fiber + drei (Fase 5–6, **lazy** saja), Recharts (Fase 4)
- Supabase: Postgres, Auth (magic link + OTP), Realtime broadcast, Storage, Edge Functions (Deno)
- zustand untuk state lintas komponen (scene director, UI)
- Test: Vitest + Testing Library (unit), pgTAP (RLS, Fase 1), Playwright (e2e, Fase 7)
- pnpm 10, Node ≥ 22

## Perintah

| Perintah         | Fungsi                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev`       | server dev (`http://localhost:5173/#/`)                                             |
| `pnpm lint`      | ESLint, `--max-warnings=0`                                                          |
| `pnpm typecheck` | `tsc -b --noEmit`                                                                   |
| `pnpm test`      | Vitest (unit)                                                                       |
| `pnpm build`     | typecheck + build produksi (`VITE_BASE=/<repo>/` untuk Pages)                       |
| `pnpm size`      | anggaran JS halaman form ≤ 180 KB gzip + larangan three.js (jalankan setelah build) |
| `pnpm check`     | semua di atas berurutan — **wajib hijau sebelum lapor/commit fase**                 |
| `pnpm format`    | Prettier                                                                            |

## Struktur

- `src/config/` — **satu-satunya** sumber dimensi/aturan: `spu-building.ts` (bangunan & kapasitas), `waste-groups.ts` (kelompok G1–G8), `site-layout.json` (peta site, Fase 6), `env.ts`.
- `src/domain/` — fungsi murni tanpa React (kapasitas, slot planner, umur lot, telepon, tiket). Setiap file wajib punya `*.test.ts`.
- `src/design/` — `tokens.css` (warna, font, durasi) dan `motion.ts` (token motion). Jangan menulis hex/durasi/easing di komponen.
- `src/components/` — UI generik & layout. `src/features/<fitur>/` — fitur. `src/routes/` — halaman (dimuat lazy).
- `src/state/` — store zustand (termasuk `scene-director.ts`).
- `supabase/` — migrasi, seed, tes pgTAP, Edge Functions.

## Aturan keamanan (wajib)

- Repo publik: **tidak ada secret** di kode, `.env.example`, atau workflow. Frontend hanya boleh memegang URL Supabase, anon key, dan site key Turnstile. Service role key, secret Turnstile, salt hash IP → **hanya** di secrets Edge Function.
- Semua tabel: RLS aktif; `anon` tidak punya grant ke tabel. Publik hanya lewat RPC/view agregat tanpa PII (nama pengirim, telepon, IP).
- Submit publik **hanya** lewat Edge Function `submit-waste` (verifikasi Turnstile di server, validasi skema, rate limit per hash IP, idempotency key).
- Data terverifikasi **append-only**: tidak ada UPDATE/DELETE pada `stock_movements`, `lots`, `outbound*`, `audit_log`, dan submission yang sudah diverifikasi/ditolak. Koreksi = movement baru dengan alasan + referensi entri asal. Ditegakkan dengan trigger + RLS, dan diuji.
- Stok = `SUM(stock_movements)`. Jangan menyimpan saldo yang bisa diubah.
- Bucket storage privat; akses lewat signed URL berumur pendek.
- Realtime publik hanya event broadcast tersanitasi ("data berubah"); klien memuat ulang RPC agregat.
- Setiap perubahan skema/RLS wajib disertai test pgTAP. Test RLS dijalankan di CI (`db-tests.yml`) setiap kali `supabase/**` berubah, dan wajib hijau sebelum merge.
- `anon` **tanpa SELECT** ke tabel mentah mana pun. Publik hanya memanggil `public_status()` (persen kapasitas bulat + ada/tidak ada limbah) dan `ping()`. Fungsi agregat lain hanya untuk petugas.
- Kolom aktor (`created_by`, `verified_by`) tanpa FK ke `auth.users` (nama di-snapshot), agar restore ke DB kosong tidak gagal.
- Repo publik: `.gitignore` mencakup `.env*`, backup, ekspor, dan kunci (`*.age`, `*.gpg`, `*.dump`, `backup/`, `exports/`, ...). Gitleaks berjalan di CI (`secret-scan.yml`). Workflow tidak boleh mencetak data atau secret ke log, karena log Actions repo publik bisa dibaca semua orang.

## Visibilitas data (Amandemen 1)

| Siapa                 | Boleh melihat                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Publik (tanpa login)  | Persen kapasitas SPU, status ada/tidak ada limbah, status tiket miliknya (tanpa PII), peta site tanpa data stok |
| Petugas/admin (login) | Semua detail: kg, lot, jenis, grafik, alert, 3D interior + what-if, nama pengirim, telepon, foto                |

## Backup & keep-alive (Amandemen 1)

- Keep-alive: workflow terjadwal tiap 3 hari memanggil RPC `ping()` dengan anon key.
- Backup (Fase 7):
  - Harian, `pg_dump --data-only` tabel utama, dienkripsi `age` sebelum commit.
  - Disimpan di repo **privat** terpisah memakai kredensial scope minimum. Retensi 90 hari.
  - Skrip restore + dokumentasi uji restore ke DB kosong. Restore **wajib diuji**.

## Aturan data & lokal

- Lokasi tetap "SPU": tampil sebagai label, **tanpa** dropdown lokasi; tetap disimpan di kolom `site`.
- UI bahasa Indonesia. Tanggal tampil `dd/MM/yyyy` (Intl `id-ID`), angka `1.234,5`.
- Instan waktu → `timestamptz`. Tanggal kalender (tanggal masuk/keluar) → `date`. Zona waktu dari `app_config.timezone` (default `Asia/Makassar`).
- Batas simpan default 30 hari; umur hari ke-0 = tanggal terima. Ambang warna: kuning ≥ 21, oranye ≥ 26, merah ≥ 30.
- Kelompok segregasi & zona = **usulan, wajib direview K3** — tampilkan label itu di UI terkait.
- Kode janggal `A3330-1`, `B354-4` → `needs_review = true`.

## Aturan motion ("Living Logbook")

- Gerak menjelaskan perubahan data (masuk, status berubah, kapasitas bergeser), bukan hiasan.
- DOM: animasikan **hanya `transform` dan `opacity`**. Pengecualian: path-draw SVG kecil (`pathLength`) untuk centang/cincin/grafik.
- Durasi/easing/spring **hanya** dari `src/design/motion.ts`: mikro 120–200 ms, transisi 300–500 ms, adegan 700–1200 ms, easing `cubic-bezier(0.22, 1, 0.36, 1)`, spring untuk elemen fisik.
- `prefers-reduced-motion`: ganti dengan fade sederhana (`useReducedMotion` + variants `*Reduced`/`stepFade`), matikan gerak kamera & partikel. `MotionConfig reducedMotion="user"` sudah dipasang global.
- Satu orkestrasi: adegan utama (kamera 3D, count-up besar, intro) wajib lewat `useSceneDirector` — maksimal satu adegan berjalan.
- Haptic ringan hanya saat sukses (`haptic()` di `motion.ts`).

## Mobile & performa

- Mobile-first; uji 360×640, 390×844, 768, 1280. `viewport-fit=cover`, safe-area (`--safe-*`), `100dvh`, tanpa ketergantungan hover, target sentuh ≥ 48 px.
- Bottom navigation < `lg`, sidebar ≥ `lg`.
- Halaman form: JS awal ≤ 180 KB gzip, **tidak boleh** mengimpor three.js/R3F, supabase-js, atau Recharts. ESLint melarang import `three`/`@react-three/*` di luar `src/features/spu3d` & `src/features/site3d`; `pnpm size` memeriksa closure bundle.
- 3D: `React.lazy`, DPR dibatasi, `PerformanceMonitor`, InstancedMesh, tier kualitas rendah/sedang/tinggi, fallback denah SVG 2D.
- Font self-hosted di `public/fonts` (subset latin, `font-display: swap`): Plus Jakarta Sans (UI), JetBrains Mono (kode limbah/lot/tiket).

## Desain

- Dark default + light (`data-theme` di `<html>`). Warna lewat token Tailwind (`bg-bg`, `text-fg-muted`, `text-accent`, `text-warn`, `text-danger`, `glass`).
- Kontras WCAG AA diuji di `src/design/contrast.test.ts` — tambah pasangan baru ke test.
- Warna kelompok G1–G8 = palet kategorikal tervalidasi; warna **tidak boleh berdiri sendiri** (selalu sertakan kode/label/legenda).
- Fokus keyboard terlihat; visual 3D wajib punya ringkasan teks.

## Alur kerja

- Kerjakan per fase; akhiri fase dengan `pnpm check` (+ test DB bila relevan), commit, push ke branch kerja, lalu minta review beserta cara mengetes.
- Jangan menambah dependensi berat tanpa alasan di laporan fase; cek dampak ke `pnpm size`.
