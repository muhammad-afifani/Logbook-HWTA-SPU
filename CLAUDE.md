# CLAUDE.md — E-Logbook SPU

Logbook digital penyimpanan sementara limbah B3 untuk satu lokasi: **SPU**.
Rencana lengkap & keputusan: `docs/PLAN.md`. Patuhi file ini di setiap fase.

## Batasan biaya & status (Amandemen 1)

- **100% gratis**, kecuali langganan Claude Code: GitHub Pages (repo publik) + GitHub Actions, Supabase Free, Cloudflare Turnstile, domain bawaan Pages.
- SMTP bawaan Supabase **hanya mengirim ke anggota tim organisasi Supabase**. Jangan bergantung padanya untuk alur petugas: tidak ada magic link, OTP email, atau email reset password.
- Fitur yang butuh layanan/paket berbayar (custom SMTP, image transformation, PITR, branching, custom domain, SaaS lain) → **BERHENTI dan tanya dulu**. Jangan menambahkannya sendiri, termasuk layanan pihak ketiga "gratis" yang belum disetujui.
- Status **PROTOTIPE**: README dan banner aplikasi menyatakan belum untuk catatan resmi. Banner dipertahankan sampai pindah ke paket berbayar.
- Data uji coba **wajib dummy** (seed, demo, e2e, screenshot). Jangan pernah menulis nama atau telepon asli di kode, seed, test, atau issue.

## Stack

- Vite 8 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`) + Tailwind 4
- `motion` (Framer Motion) via `LazyMotion` + `m.*` (mode `strict`, jangan pakai `motion.*`)
- React Router 8 **HashRouter** (`createHashRouter`) — aman untuk GitHub Pages
- React Three Fiber + drei (Fase 5–6, **lazy** saja), Recharts (Fase 4)
- Supabase: Postgres, Auth (**email + password**), Realtime broadcast, Storage, Edge Functions (Deno)
- zustand untuk state lintas komponen (scene director, UI)
- Test: Vitest + Testing Library (unit), pgTAP (RLS, Fase 1), Playwright (e2e, Fase 7)
- pnpm 10, Node ≥ 22

## Perintah

| Perintah                    | Fungsi                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | server dev (`http://localhost:5173/#/`)                                                                                                                       |
| `pnpm lint`                 | ESLint, `--max-warnings=0`                                                                                                                                    |
| `pnpm typecheck`            | `tsc -b --noEmit`                                                                                                                                             |
| `pnpm test`                 | Vitest (unit)                                                                                                                                                 |
| `pnpm build`                | typecheck + build produksi (`VITE_BASE=/<repo>/` untuk Pages)                                                                                                 |
| `pnpm size`                 | anggaran JS halaman form ≤ 180 KB gzip + larangan three.js (jalankan setelah build)                                                                           |
| `pnpm check`                | semua di atas berurutan — **wajib hijau sebelum lapor/commit fase**                                                                                           |
| `pnpm format`               | Prettier                                                                                                                                                      |
| `pnpm db:start` / `db:stop` | Supabase CLI lokal (butuh Docker)                                                                                                                             |
| `pnpm db:check`             | reset + migrasi + seed → pgTAP (`db:test`) → smoke Edge Functions (`db:smoke`) → anon via HTTP (`db:anon`) — **wajib hijau setiap kali skema/fungsi berubah** |

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
- Repo publik: `.gitignore` mencakup `.env*`, backup, ekspor, dan kunci (`*.age`, `*.gpg`, `*.dump`, `backup/`, `exports/`, ...). Gitleaks berjalan di CI (`secret-scan.yml`) memakai CLI v8.30.1 yang dipin versi + SHA-256 (bukan gitleaks-action, jadi tanpa lisensi). Selalu pakai `--redact`. Workflow tidak boleh mencetak data atau secret ke log, karena log Actions repo publik bisa dibaca semua orang.

## Form publik & submit-waste (Fase 2)

- Kiriman publik hanya lewat `submit-waste`. Urutan: CORS/metode → `Content-Type: application/json` (415) → body ≤ 64 KiB (413, dibaca bertahap) → validasi skema (422) → rate limit per hash IP (429 + `Retry-After`) → `idempotency_key` sudah tercatat? → verifikasi Turnstile (action `submit-waste`, hostname ∈ `ALLOWED_ORIGINS`) → `svc_create_submission` → signed upload URL.
- Kirim ulang dengan `idempotency_key` yang sudah tercatat mengembalikan tiket yang sama (200) **tanpa** Turnstile ulang, tanpa PII, dan URL unggah hanya diberikan selama status `pending` (bukti foto terverifikasi tidak boleh tertimpa). Kunci wajib UUID v4 (capability pemilik); klien membuatnya dengan `crypto.randomUUID()`/`getRandomValues`.
- Logika request ada di `_shared/submit-handler.ts` (DI, diuji Vitest); `index.ts` hanya merangkai `Deno.env` + `Deno.serve`. Log error hanya memuat tahap + status/kode, **tidak pernah** body, nama, telepon, pesan DB, atau kunci.
- `svc_*` yang menangkap `unique_violation` wajib membungkus counter + insert dalam satu blok `EXCEPTION` agar nomor tiket tidak bolong (lihat migrasi 08).
- Frontend form: API hanya lewat `@/lib/public-form/api` (fetch, tanpa supabase-js). Validasi **memakai modul yang sama dengan server** via alias `@shared` (`supabase/functions/_shared`): jangan menduplikasi aturan.
- Draft, foto, dan antrean kirim ulang disimpan **di perangkat** (localStorage / IndexedDB, cadangan memori). Antrean berisi nama & telepon di perangkat itu sendiri dan dihapus begitu terkirim.
- UI: target sentuh ≥ 48 px; `fieldset` di dalam flex/grid wajib `min-w-0` (bawaan peramban `min-inline-size: min-content` membuat isinya melebar melewati layar). Elemen `position: fixed` tidak boleh berada di dalam leluhur ber-`transform` (animasi halaman): render lewat portal ke `<body>` (lihat `StickyActionBar`, `BottomSheet`).
- React Compiler lint (`react-hooks` v7) aktif: tanpa `setState` sinkron di dalam efek, tanpa akses `ref.current` saat render, helper non-komponen tidak diekspor dari berkas komponen.
- Uji peramban sungguhan terhadap stack lokal (mengisi wizard, foto, antre offline, 360×640) dijalankan manual di Fase 2; suite Playwright otomatis di Fase 7.

## Realtime (status)

- Channel `spu:public` saat ini **publik**: anon bisa subscribe **dan mengirim event palsu** (`ops/checks/realtime-anon.mjs` R2 = GAGAL sampai usulan di `docs/PLAN.md` §8c diputuskan). Jangan membangun fitur yang mengandalkannya sebelum itu.

## Pola migrasi & database (Fase 1)

- Default privileges bawaan Supabase memberi anon/authenticated hak penuh pada objek BARU di `public`. **Jangan** mengubahnya (`ALTER DEFAULT PRIVILEGES` dilarang, diuji `src/test/repo-guards.test.ts`). Untuk setiap objek baru:
  - **Tabel/view:** `create` → `revoke all on table … from anon, authenticated` → grant minimal ke `authenticated` → `enable row level security` → policy hanya `to authenticated`.
  - **Fungsi:** `revoke execute … from public, anon, authenticated`, lalu grant eksplisit. `security definer` wajib `set search_path = ''` dan nama objek ditulis lengkap.
  - **Sequence:** `revoke all on all sequences in schema public from anon, authenticated`.
- Anon hanya boleh `ping()` dan `public_status()`. Fungsi untuk Edge Functions bernama `svc_*`, hanya untuk `service_role`. Helper internal di skema `app_private` (tidak diekspos API).
- Tanpa grant/policy/ALTER ke skema `auth`/`storage`. Satu-satunya sentuhan storage adalah baris bucket privat. Tidak ada policy `storage.objects`; signed URL hanya dari Edge Function.
- Kode error domain: `LB001` (append-only), `LB002` (validasi), `LB003` (tidak berwenang).
- Setiap tabel/fungsi baru: tambah ke `supabase/tests/database/*`, ke daftar tabel `ops/checks/anon-curl.sh`, dan perbarui jumlah relasi di test 01.
- Seed hanya master: `waste_groups`, `packaging_types`, `waste_types`, `app_config`. `pallet_slots` diisi RPC admin dari `computeLayout` (Fase 5).
- Edge Functions tanpa dependensi npm. Logika murni di `supabase/functions/_shared/` (diuji Vitest, dipakai ulang form). Typecheck lewat `tsconfig.functions.json` + `deno-shim.d.ts`. Fungsi publik `verify_jwt = false` (perlindungannya Turnstile + validasi + rate limit), `photo-url` `verify_jwt = true`.
- Edge runtime lokal tidak memuat ulang kode otomatis: `docker restart supabase_edge_runtime_e-logbook-spu`.
- Config Supabase: `[auth] enable_signup = false` (pendaftaran mati), `[auth.email] enable_signup = true` (provider email tetap aktif; kalau `false`, login ikut mati).

## Login petugas (Keputusan K1)

- `supabase.auth.signInWithPassword`. Sign up dimatikan di Supabase. Kode tidak boleh memanggil `signUp`, `signInWithOtp`, atau `resetPasswordForEmail`.
- Akun dibuat admin di Supabase Dashboard (Authentication → Add user, _auto-confirm_). Role (`officer`/`admin`) diisi di tabel `profiles`.
- Petugas **tidak** diundang sebagai anggota organisasi Supabase.
- Lupa password → admin me-reset di Dashboard.

## Batas data publik (Keputusan K1)

- Kode publik (`src/features/site3d/**`, halaman lapor/status/dashboard publik; daftar `PUBLIC_FILES` di `eslint.config.js`) hanya boleh memakai `@/lib/api/public-status` untuk data stok.
- Kode publik dilarang mengimpor modul petugas, `spu3d`, supabase-js, atau API lain. Ditegakkan ESLint dan diuji di `src/test/public-boundary.test.ts`.
- `parsePublicStatus()` adalah whitelist (`capacityPct`, `hasWaste`, `updatedAt`). Jangan menambah field stok ke kontrak ini.
- Peta site publik: tanpa ikon, label, atau angka drum/stok. 3D interior dan what-if hanya di route petugas (`/petugas/3d`, dijaga `RequireRole`).

## Visibilitas data (Amandemen 1)

| Siapa                 | Boleh melihat                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Publik (tanpa login)  | Persen kapasitas SPU, status ada/tidak ada limbah, status tiket miliknya (tanpa PII), peta site tanpa data stok |
| Petugas/admin (login) | Semua detail: kg, lot, jenis, grafik, alert, 3D interior + what-if, nama pengirim, telepon, foto                |

## Backup & keep-alive (Amandemen 1)

- Keep-alive: workflow terjadwal tiap 3 hari memanggil RPC `ping()` dengan anon key.
- Backup (Fase 7):
  - Harian, `pg_dump --data-only` tabel utama, dienkripsi `age` sebelum commit.
  - Workflow berjalan **di repo privat** backup. Retensi 90 hari.
  - Workflow hanya memegang **kunci publik** `age` (recipient). Kunci privat **tidak pernah** masuk repo atau GitHub Secrets; kunci disimpan offline oleh pemilik.
  - Skrip restore + dokumentasi uji restore ke DB kosong. Restore **wajib diuji**, secara manual, memakai kunci offline.

## Aturan data & lokal

- Lokasi tetap "SPU": tampil sebagai label, **tanpa** dropdown lokasi; tetap disimpan di kolom `site`.
- UI bahasa Indonesia. Tanggal tampil `dd/MM/yyyy` (Intl `id-ID`), angka `1.234,5`.
- Instan waktu → `timestamptz`. Tanggal kalender (tanggal masuk/keluar) → `date`. Zona waktu dari `app_config.timezone` (default `Asia/Makassar`).
- Batas simpan default 30 hari; umur hari ke-0 = tanggal terima. Ambang warna: kuning ≥ 21, oranye ≥ 26, merah ≥ 30.
- Kelompok segregasi & zona = **usulan, wajib direview K3** — tampilkan label itu di UI terkait.
- Kapasitas: konfigurasi aktif `SPU_BUILDING = SPU_BUILDING_OPTION_B` (default konservatif, 42 slot = 168 drum). Opsi A hanya alternatif.
- Angka kapasitas **belum terverifikasi K3** (`K3_REVIEW.verified = false`). Containment belum dihitung. Jangan menampilkan kapasitas tanpa catatan ini di UI petugas/desain. `verified` hanya boleh diubah berdasarkan keputusan tertulis K3.
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
