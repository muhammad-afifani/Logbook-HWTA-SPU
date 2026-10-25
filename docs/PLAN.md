# Rencana E-Logbook SPU

> **Amandemen 1 (25/10/2026) sudah digabung ke dokumen ini.** Ringkasannya ada di §0. Bagian
> yang berubah diberi tanda **[A1]**.
>
> **Keputusan K1 (25/10/2026), persetujuan bersyarat Fase 0**, juga sudah digabung. Bagian
> yang berubah diberi tanda **[K1]**. Ringkasannya ada di §0b.

## 0. Amandemen 1 — ringkasan

1. **Biaya: 100% gratis** (kecuali langganan Claude Code).
   - Hosting di GitHub Pages (repo publik) + Actions.
   - Backend Supabase Free, captcha Turnstile, SMTP bawaan Supabase, domain bawaan Pages.
   - Fitur yang butuh layanan berbayar → **berhenti dan tanya dulu**.
2. **Status prototipe.**
   - README dan banner di aplikasi menyatakan "belum untuk catatan resmi".
   - Data uji coba wajib dummy. Nama/telepon asli baru boleh setelah RLS dan backup + restore teruji.
3. **Keep-alive:** GitHub Action tiap 3 hari memanggil RPC `ping()`.
4. **Backup gratis** (Fase 7, restore wajib diuji):
   - Ekspor harian tabel utama, dienkripsi `age`, disimpan di repo **privat** terpisah.
   - Disertai skrip restore dan dokumentasi uji restore ke database kosong.
   - Retensi 90 hari.
5. **Privasi repo publik:** `.gitignore` mencakup env, backup, dan ekspor. Gitleaks berjalan di CI.
6. **Visibilitas dashboard:**
   - Publik **hanya** melihat persen kapasitas SPU dan status ada/tidak ada limbah.
   - Semua detail (kg, lot, grafik, nama, telepon) hanya untuk petugas yang login.
7. **RLS:**
   - `anon` tanpa SELECT ke tabel mentah. Publik hanya membaca RPC agregat tersaring.
   - Test RLS jalan otomatis setiap kali skema berubah.

## 0b. Keputusan K1 — ringkasan

1. **Login petugas: email + password.**
   - Akun dibuat admin di Supabase Dashboard (Authentication → Add user, _auto-confirm_).
   - Petugas **tidak** diundang sebagai anggota organisasi Supabase.
   - Tidak ada magic link, OTP email, atau email reset password. Reset password dilakukan admin di Dashboard.
   - Catatan: SMTP bawaan Supabase hanya mengirim ke anggota tim organisasi. Aplikasi tidak boleh bergantung padanya untuk alur petugas.
2. **Backup:**
   - Workflow berjalan di repo **privat** backup.
   - Enkripsi `age` hanya memakai **kunci publik** (recipient) di workflow.
   - Kunci privat **tidak** disimpan di repo mana pun maupun di GitHub Secrets. Kunci itu disimpan offline oleh pemilik.
   - Uji restore wajib memakai kunci offline tersebut, sehingga dilakukan manual mengikuti prosedur terdokumentasi, bukan otomatis di CI.
3. **Kapasitas:**
   - Default konservatif = **Opsi B (42 slot = 168 drum)**. Opsi A tetap ada di config sebagai alternatif.
   - Angka ini **belum terverifikasi K3**: area/volume containment, lebar lorong minimum, jalur evakuasi, dan tinggi tumpukan maksimal.
   - Containment **belum dihitung** (rincian di §5).
4. **Gitleaks:**
   - Repo milik akun pribadi `muhammad-afifani`. Menurut README dan kode gitleaks-action, akun pribadi tidak butuh `GITLEAKS_LICENSE`.
   - Tetapi action itu tetap mewajibkan lisensi kalau panggilan API pengecekan tipe akun gagal.
   - Karena itu CI memakai **CLI gitleaks v8.30.1** (lisensi MIT, versi dan SHA-256 dipin), tanpa pengecekan lisensi sama sekali.
5. **3D interior & what-if: khusus petugas.**
   - Peta site publik tidak menampilkan ikon, label, atau data jumlah drum/stok.
   - Dijamin oleh 3 lapis (§7): RPC `public_status()`, parser whitelist `src/lib/api/public-status.ts`, dan aturan ESLint batas publik (diuji di `src/test/public-boundary.test.ts`).

## Konteks

Repo `muhammad-afifani/Logbook-HWTA-SPU` masih kosong (belum ada commit, branch kerja `ccr-5f13bd91-gymk5q`). Tujuannya membangun logbook digital penyimpanan sementara limbah B3 untuk satu lokasi (SPU), dengan:

- form publik (mobile-first)
- verifikasi oleh petugas
- stok append-only
- dashboard realtime
- visual 3D interior dan peta site

Aplikasinya statis di GitHub Pages dengan backend Supabase. Dokumen ini berisi rencana Fase 0–7. Kode baru ditulis setelah rencana ini disetujui.

Lingkungan yang sudah dicek di container:

- Node 22 dan pnpm 10 tersedia.
- Binari Postgres 16 tersedia.
- Daemon Docker **tidak** berjalan di container pengembangan (lihat Risiko).

Versi terbaru di npm per hari ini, yang akan dipin saat scaffold:

| Paket                  | Versi |
| ---------------------- | ----- |
| Vite                   | 8.3   |
| React                  | 19.3  |
| motion (Framer Motion) | 14.6  |
| @react-three/fiber     | 9.8   |
| @react-three/drei      | 10.7  |
| Tailwind               | 4.3   |
| Recharts               | 3.10  |

---

## 1. Pertanyaan klarifikasi

Setiap pertanyaan punya **default**. Kalau rencana disetujui tanpa jawaban, saya pakai default tersebut. Pertanyaan 1–2 baru dibutuhkan di Fase 1, sisanya paling lambat Fase 3/5.

1. **Kepanjangan SPU?** (dipakai di judul aplikasi, manifest PWA, dan metadata) Default: tetap ditulis "SPU", dengan subjudul "Tempat Penyimpanan Sementara Limbah B3".
2. **Zona waktu?** Default **WITA (Asia/Makassar)**, karena ada sungai besar dan jetty. Disimpan di `app_config.timezone` dan dipakai untuk semua perhitungan "hari ini", umur lot, dan rekap bulanan.
3. **Batas simpan "1 bulan" = 30 hari?** Default **ya, 30 hari kalender**.
   - Hari penerimaan dihitung umur 0. Kedaluwarsa = tanggal terima + 30. Merah mulai umur ≥ 30.
   - Batas bisa diubah global di config dan per jenis limbah.
   - Catatan: PP 22/2021 mengizinkan 90/180/365 hari. Angka 30 hari saya anggap kebijakan internal yang lebih ketat.
4. **Arti "blok 2×2" untuk penumpukan?** Ini yang paling berpengaruh ke angka kapasitas (lihat §5).
   - **[K1] Diputuskan:** default **Opsi B** (tafsiran ketat Kepdal 01/1995): blok = 2×2 drum = 1 pallet, gang 0,6 m antar pallet.
   - Opsi A (blok = 2×2 pallet) tetap di config sebagai alternatif.
5. **Posisi pintu roller dan pintu darurat?** Default: pintu roller di dinding pendek barat (lebar 4 m). Pintu darurat di dinding pendek timur, segaris dengan lorong utama.
6. **Alokasi zona per kelompok?** [K1] Dengan Opsi B, 7 tapak per baris dibagi ke 4 kelompok: G1, G2, G3, G4, G6, G8 masing-masing 2 tapak (6 slot = 24 drum), G5 dan G7 masing-masing 1 tapak (3 slot = 12 drum). Kalau oli (G1) jauh lebih dominan, saya bisa geser G7/G8 ke rak kecil supaya G1 dapat 2 blok. Mohon perkiraan volume per kelompok.
7. **Saran combobox Sumber/Entity vs privasi.** Saran dari "data sebelumnya" yang tampil di form publik otomatis membuka daftar entity ke publik. Ini bertentangan dengan agregat entity yang disembunyikan di dashboard. Default: saran hanya diambil dari tabel `suggestion_terms` yang sudah **disetujui petugas**. Nilai baru dari kiriman yang diterima masuk sebagai "usulan" dan bisa disetujui sekali klik.
8. **Foto maksimal 3: per kiriman atau per item?** Default **per kiriman** (total 3).
9. **Satu pallet boleh berisi drum dari lot berbeda?** Default boleh, asal kode limbah dan jenis kemasannya sama (top-up pallet parsial). Kalau tidak boleh, kapasitas efektif turun.
10. **Siapa yang boleh login?** [K1] Hanya akun email + password yang dibuat admin di Supabase Dashboard (Add user, auto-confirm). Pendaftaran mandiri (sign up) dimatikan. Admin pertama dibuat lewat skrip seed atau SQL di README.
11. **Format logbook cetak.** Saya pakai kolom yang Anda sebut, ditambah no manifest. Format final menunggu konfirmasi tim K3, dan template-nya dibuat terisolasi supaya mudah diubah.
12. **Tanggal masuk / tanggal keluar** disimpan sebagai `date` (tanggal kalender, bukan instan). Semua _timestamp_ (waktu kirim, verifikasi, audit) disimpan sebagai `timestamptz`. Mohon konfirmasi bahwa ini sesuai maksud "semua timestamp timestamptz".
13. **[A1→K1] Login petugas — DIPUTUSKAN:** email + password, akun dibuat admin, tanpa undangan org, tanpa email apa pun. Lihat §0b.1.
14. **[A1→K1] 3D interior & what-if — DIPUTUSKAN:** khusus petugas. Peta site publik tanpa data stok. Lihat §0b.5.
15. **[A1→K1] Lokasi workflow backup — DIPUTUSKAN:** di repo privat, hanya kunci publik `age`. Lihat §0b.2.

## 2. Asumsi

- Dimensi 16 × 9 × 5 m adalah **dimensi bersih interior**. Sumbu X = panjang (16), Y = lebar (9), Z = tinggi.
- Referensi aturan teknis penyimpanan (semuanya di config, **wajib direview K3**) mengacu ke Kepka Bapedal 01/1995:
  - jarak tumpukan ke dinding dan atap ≥ 1 m
  - drum maksimal 3 lapis, masing-masing beralas pallet berisi 4 drum
  - gang orang ≥ 60 cm
- Lorong utama sekaligus jalur evakuasi, lebar 1,5 m (cukup untuk hand pallet). Bisa diatur di config.
- Area penerimaan (tempat hologram pending) dan area bebas pintu: 3 m dari dinding pintu, selebar bangunan. Tidak dihitung sebagai kapasitas.
- Curb/secondary containment setinggi 0,15 m di sepanjang dinding, berada di dalam pita jarak dinding 1 m (tidak mengurangi slot).
- Kapasitas utama dihitung dalam **slot pallet**. Kg ditampilkan sebagai total stok, bukan batas.
- Kemasan non-drum, per slot:
  - IBC: 1 unit/slot, bisa ditumpuk 2.
  - Jumbo bag: 1/slot, tidak bisa ditumpuk (mengunci kolom di atasnya).
  - Jerigen/pail: 16/pallet, tumpuk 2.
  - Box/crate: 4/pallet, tumpuk 2.
  - Karung: 8/pallet, tumpuk 2.
  - Tabung gas: di rak, 12 tabung/rak, 1 rak mengisi satu tapak penuh.
  - Semua angka ini hanya estimasi dan bisa diedit admin.
- Kelompok segregasi G1–G8 dan matriks inkompatibilitas diberi label **"Usulan — wajib direview K3"** di UI dan di DB (`waste_groups.proposed = true`).
- Kode ticket `SPU-YYMM-NNNN-XXXX`:
  - NNNN = nomor urut per bulan (tabel counter, transaksi atomik).
  - XXXX = 4 karakter acak Crockford base32 tanpa 0/O/1/I/L (~1 juta kombinasi). Bersama rate limit, ini cukup untuk mencegah tebak.
- Nomor telepon dinormalisasi ke E.164 `+62…`.
  - Diterima: `08…`, `8…`, `62…`, `+62…`, dan nomor tetap `0xx…`.
  - Panjang nomor nasional (setelah 0) 9–12 digit.

## 3. Struktur folder

```
/
├─ CLAUDE.md                 # konvensi proyek (Fase 0)
├─ README.md                 # setup Supabase, Turnstile, deploy (Fase 7)
├─ .env.example              # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TURNSTILE_SITE_KEY, VITE_BASE
├─ index.html  vite.config.ts  tsconfig*.json  eslint.config.js  .size-limit.json
├─ public/                   # ikon PWA, robots.txt, offline.html
├─ src/
│  ├─ main.tsx  App.tsx  router.tsx          # HashRouter + lazy routes
│  ├─ config/
│  │  ├─ env.ts                              # baca import.meta.env, validasi
│  │  ├─ spu-building.ts                     # SEMUA dimensi & aturan kapasitas SPU
│  │  ├─ site-layout.json                    # posisi objek peta site (meter)
│  │  └─ quality-tiers.ts
│  ├─ design/  tokens.css  motion.ts  theme.ts  fonts.css
│  ├─ domain/                                # fungsi murni + unit test (tanpa React)
│  │  ├─ capacity/ computeLayout.ts  slotPlanner.ts  *.test.ts
│  │  ├─ lots/ ageing.ts  fifo.ts  *.test.ts
│  │  ├─ phone.ts  ticket.ts  dates.ts  segregation.ts  *.test.ts
│  ├─ lib/  api/ (submit.ts, status.ts, rpc.ts)  supabase.ts (lazy, officer/dashboard)
│  │        image-compress.ts  draft-store.ts  offline-queue.ts  haptics.ts  realtime.ts  csv.ts
│  ├─ state/  scene-director.ts (orkestrasi 1 adegan utama)  ui-store.ts   # zustand
│  ├─ components/ ui/ (Button, Field, Combobox, BottomSheet, Stepper, Toast, Skeleton,
│  │                   CountUp, CapacityRing, LiveDot, Badge, ProgressBar, SwipeCard)
│  │              layout/ (AppShell, BottomNav, Sidebar, Header)
│  ├─ features/
│  │  ├─ submit-form/   (Wizard, StepSender, StepItems, StepConfirm, WastePicker, SuccessTicket)
│  │  ├─ status-check/
│  │  ├─ auth/          (LoginForm email + password, RequireRole)  [K1]
│  │  ├─ dashboard/     (public widgets, charts)
│  │  ├─ officer/       (queue, verify, outbound, logbook, lots, master, export, print, alerts)
│  │  ├─ spu3d/         (LAZY: Scene, models/, WhatIf, InfoSheet, Fallback2D.svg)
│  │  └─ site3d/        (LAZY: SiteScene, procedural/, Hotspots, Intro)
│  └─ test/ setup.ts
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/  0001_schema.sql 0002_rls.sql 0003_rpc.sql 0004_append_only_audit.sql
│  │               0005_realtime.sql 0006_storage.sql
│  ├─ seed.sql                               # master limbah, kemasan, kelompok, config, slot
│  ├─ tests/  *.test.sql                     # pgTAP: RLS, append-only, RPC
│  └─ functions/ _shared/ (cors, turnstile, ratelimit, schema)
│                submit-waste/  check-status/  request-upload/
├─ e2e/                                      # Playwright (360x640, 390x844, 768, 1280)
└─ .github/workflows/ ci.yml  deploy-pages.yml  keepalive.yml  db-tests.yml
```

## 4. Skema DB (final yang diusulkan)

Ketentuan umum:

- Semua tabel ada di skema `public` dengan RLS aktif.
- Semua grant untuk `anon` dicabut.
- Enum: `user_role(officer, admin)`, `submission_status(pending, verified, rejected)`, `movement_type(inbound, outbound, correction)`.

| Tabel                             | Kolom inti                                                                                                                                                                                                                         | Catatan                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_config`                      | key pk, value jsonb, description, updated_at, updated_by                                                                                                                                                                           | timezone, backdate_max_days=7, default_storage_days=30, weight_diff_warn_pct=10, capacity_warn=[0.8,0.95], pending_alert_hours=24, ageing thresholds [21,26,30], public_show_entity=false |
| `profiles`                        | id→auth.users, full_name, role, active                                                                                                                                                                                             | Tanpa profile aktif = tidak punya akses                                                                                                                                                   |
| `waste_groups`                    | code (G1–G8), name, color, proposed, sort                                                                                                                                                                                          | Usulan K3                                                                                                                                                                                 |
| `group_incompatibilities`         | group_a, group_b, note                                                                                                                                                                                                             | Untuk alert segregasi                                                                                                                                                                     |
| `waste_types`                     | id, code uniq, name, group_code, color_override, default_packaging, kg_per_package, storage_zone, storage_days null, needs_review, active                                                                                          | A3330-1 & B354-4 `needs_review=true`                                                                                                                                                      |
| `packaging_types`                 | code, name, width_m, depth_m, height_m, shape, uses_pallet, units_per_pallet, stackable, max_stack_levels, model_kind, active                                                                                                      | drum200: Ø0,58 × 0,88, pallet 1,2×1,2, 4/pallet, tumpuk 3                                                                                                                                 |
| `submissions`                     | id, ticket_code uniq, site='SPU', entry_date date, source, sender_name, entity, phone_e164, notes, confirm_sealed/no_leak/labeled, status, reject_reason, submitted_at tz, idempotency_key uniq, ip_hash, verified_by, verified_at | PII: hanya officer                                                                                                                                                                        |
| `submission_items`                | id, submission_id, line_no, waste_type_id, packaging_code, package_count, package_count_estimated, weight_kg, actual_package_count, actual_weight_kg                                                                               | actual_* diisi saat verifikasi                                                                                                                                                            |
| `submission_photos`               | id, submission_id, storage_path, uploaded_at                                                                                                                                                                                       | bucket privat `submission-photos`                                                                                                                                                         |
| `lots`                            | id, lot_code uniq, site, submission_item_id uniq, waste_type_id, packaging_code, received_on date, expires_on date, initial_kg, initial_packages, created_by, created_at                                                           | Format `L2610-B105d-0007`                                                                                                                                                                 |
| `stock_movements`                 | id, lot_id, type, qty_kg (bertanda), qty_packages (bertanda), occurred_on, outbound_item_id, corrects_movement_id, reason, created_by, created_at                                                                                  | **Stok = SUM**. Insert-only                                                                                                                                                               |
| `outbound`                        | id, doc_code, site, out_date, transporter, destination, manifest_no, vehicle_no, notes, created_by, created_at                                                                                                                     | Insert-only                                                                                                                                                                               |
| `outbound_items`                  | id, outbound_id, lot_id, qty_kg, qty_packages                                                                                                                                                                                      | Membuat movement outbound                                                                                                                                                                 |
| `outbound_attachments`            | id, outbound_id, storage_path                                                                                                                                                                                                      | bucket privat `outbound-docs`                                                                                                                                                             |
| `pallet_slots`                    | id, zone_code, block, col, row, level, x, y, z, active                                                                                                                                                                             | Dibuat dari config (statis, posisi stabil)                                                                                                                                                |
| `slot_units`                      | id, slot_id, unit_index, lot_id, packaging_code, placed_at, removed_at, removed_by_movement                                                                                                                                        | Riwayat penempatan. Update hanya `removed_at` lewat RPC                                                                                                                                   |
| `suggestion_terms`                | kind (source/entity), value, approved, created_at                                                                                                                                                                                  | Lihat pertanyaan 7                                                                                                                                                                        |
| `audit_log`                       | id, at tz, actor, actor_role, action, table_name, row_pk, old jsonb, new jsonb                                                                                                                                                     | Trigger generik. Immutable                                                                                                                                                                |
| `ticket_counters` / `rate_limits` | yymm, last_no / ip_hash, bucket, window_start, count                                                                                                                                                                               | Hanya service role                                                                                                                                                                        |

**Append-only.** Trigger `BEFORE UPDATE OR DELETE` menolak perubahan pada:

- `stock_movements`, `lots`, `outbound*`, `audit_log`
- `submissions` / `submission_items` yang statusnya bukan `pending`

Trigger juga aktif untuk service_role. Koreksi dilakukan dengan `correct_movement(movement_id, qty_kg, qty_packages, reason)`, yang menyisipkan movement `correction` yang mereferensikan movement asal.

**RPC officer** (security definer, cek `is_officer()` / `is_admin()`):

- `verify_submission(id, items jsonb, decision, reason)`: dalam satu transaksi menulis lot, movement inbound, slot_units, dan audit.
- `create_outbound(header jsonb, items jsonb)`: default FIFO. Validasi stok cukup.
- `correct_movement(...)`
- `plan_slots_preview(...)`

**RPC publik [A1]** (grant execute ke anon). Hanya dua fungsi:

- `public_status()` → `{capacity_pct int, has_waste bool, updated_at timestamptz}`. Persen dibulatkan ke bilangan bulat. Tanpa kg, lot, jenis, nama, atau telepon.
- `ping()` → keep-alive.

Fungsi di bawah ini **pindah ke petugas** (`authenticated` + cek `is_officer()`), tidak lagi publik:

- `officer_summary()` (sebelumnya public_summary)
- `public_stock_by_type()`
- `public_monthly_flow(months)`
- `public_group_composition()`
- `public_age_distribution()`
- `public_capacity()`
- `public_3d_state()`: slot → kelompok/kode/lot/kg/kedaluwarsa, tanpa PII
- `public_pending_holograms()`: jumlah per jenis/kemasan saja
- `public_entity_stats()`: kosong kecuali config mengaktifkan
- `ping()`

**View** `v_alerts` (khusus officer):

- lot mendekati atau melewati batas
- kapasitas ≥ 80% / ≥ 95%
- pelanggaran segregasi (unit di zona yang tidak sesuai atau bersebelahan dengan kelompok inkompatibel)
- pending > 24 jam

## 5. Perhitungan kapasitas (mohon diverifikasi)

> **[K1] Default konservatif = Opsi B: 42 slot = 168 drum.** Opsi A (96 slot) hanya alternatif di
> config (`SPU_BUILDING_OPTION_A`). Konfigurasi aktif: `SPU_BUILDING = SPU_BUILDING_OPTION_B`.
>
> **Angka di bawah BELUM terverifikasi K3.** Area/volume containment, lebar lorong minimum, jalur
> evakuasi, dan tinggi tumpukan maksimal masih memakai asumsi config dan wajib diverifikasi tim K3
> (`K3_REVIEW` di `src/config/spu-building.ts`, ditampilkan di halaman `#/desain`).
>
> **Apakah containment sudah dihitung? Belum.**
>
> - Curb setinggi 0,15 m hanya _diletakkan_ di dalam pita jarak dinding 1 m untuk visual.
> - Luasnya tidak dikurangkan dari area simpan.
> - Tidak ada cek volume tampung (misalnya ≥ 110% kemasan terbesar atau ≥ 10% total volume).
> - Spill pallet/sump tidak dimodelkan. Kalau dipakai, tinggi tingkat bertambah dan jumlah tingkat bisa turun.
>
> Status asumsi yang lain:
>
> - Lorong utama 1,5 m, gang 0,6 m, jalur evakuasi ≥ 1,2 m, dan maksimal 3 tingkat dengan jarak atap 1 m **sudah dipakai dalam hitungan**, tetapi hanya sebagai asumsi.
> - Kebutuhan alat angkut, jarak tempuh evakuasi, akses APAR, dan kekuatan pallet **belum** diverifikasi.

Dihitung oleh `computeLayout(config)` (fungsi murni, ada unit test).

1. **Interior bersih:** 16,0 × 9,0 m = **144 m²**. Tinggi 5,0 m.
2. **Jarak dinding 1,0 m** di semua sisi → area dalam 14,0 × 7,0 m (X 1–15, Y 1–8).
3. **Area bebas pintu dan penerimaan:** X 0–3,0 m. Pintu roller lebar 4 m di dinding barat. Area penyimpanan menjadi X 3,0–15,0 = **12,0 × 7,0 m = 84 m²**.
4. **Lorong utama dan jalur evakuasi** di tengah, lebar 1,5 m (Y 3,75–5,25), dari pintu roller sampai pintu darurat timur. Sisa dua baris penyimpanan, masing-masing sedalam (7,0 − 1,5)/2 = **2,75 m**.
5. **Opsi A (alternatif), blok 2×2 pallet** (2,4 × 2,4 m), gang antar blok 0,6 m:
   - Arah X: 4 blok → 4×2,4 + 3×0,6 = **11,4 m ≤ 12,0** (sisa 0,6 m). 5 blok = 14,4 m, tidak muat.
   - Arah Y: 2,4 ≤ 2,75 (sisa 0,35 m).
   - Hasil: 2 baris × 4 blok = **8 blok = 32 tapak pallet**.
6. **Tinggi tumpukan:** satu tingkat = pallet 0,15 + drum 0,88 = 1,03 m. Batas tinggi = 5,0 − 1,0 (jarak atap) = 4,0 m.
   - 3 tingkat = 3,09 m ✓.
   - 4 tingkat = 4,12 m ✗.
   - Jadi maksimal **3 tingkat** (sesuai aturan 3 lapis).
7. **Total slot Opsi A:** 32 × 3 = 96 slot pallet = 384 posisi drum (≈ 76,8 m³ nominal).
8. **Pemakaian lantai Opsi A:** 32 × 1,44 = 46,08 m², yaitu 32,0% dari interior atau 54,9% dari area penyimpanan.
9. **Per zona Opsi A** (1 blok per kelompok): 4 tapak × 3 = 12 slot = 48 drum per kelompok G1–G8.
10. **Opsi B — DEFAULT [K1], blok 1 pallet** dengan gang 0,6 m antar pallet:
    - Arah X: 7 pallet → 7×1,2 + 6×0,6 = **12,0 m** (pas dengan panjang area simpan).
    - Arah Y: 1 pallet per baris (1,2 ≤ 2,75).
    - Hasil: 2 baris × 7 = **14 tapak × 3 tingkat = 42 slot = 168 drum**.
    - Lantai terpakai 14 × 1,44 = **20,16 m²**, yaitu 14,0% dari interior atau 24,0% dari area penyimpanan.
    - Per zona: G1, G2, G3, G4, G6, G8 = 6 slot (24 drum). G5, G7 = 3 slot (12 drum).

Indikator "slot terpakai %" = (slot terisi + slot terkunci di atas kemasan yang tidak bisa ditumpuk) / total slot aktif.

**Slot planner** (`slotPlanner.ts`, murni, ada unit test):

- Input: grid slot, occupancy saat ini, permintaan `{wasteType, packaging, count}`.
- Urutan penempatan:
  1. Top-up pallet parsial dengan kode limbah dan kemasan yang sama.
  2. Slot kosong di zona kelompoknya. Tingkat 0 diisi dulu di semua tapak zona, baru tingkat 1, lalu 2. Di dalam satu tingkat, urutannya dari tapak terdalam ke dekat lorong.
  3. Slot tingkat atas hanya dipakai jika slot di bawahnya berisi kemasan yang bisa ditumpuk.
- Tidak ada overflow otomatis ke zona lain. Kalau zona penuh, hasilnya **"Tidak muat"** beserta kekurangan per zona.
- Keluar: FIFO berdasarkan `received_on` lalu `lot_code`. Unit yang diangkat diambil dari tingkat teratas dulu. Posisi unit lain tidak berubah (stabil).
- Mode what-if memanggil fungsi yang sama di klien dengan state saat ini, tanpa menulis ke DB.
- Jumlah kemasan kosong → `ceil(kg / kg_per_package)` dengan flag `estimated`.

## 6. Alur data

```
[HP pengirim] ─ wizard (draft di IndexedDB) ─ Turnstile ─▶ Edge fn submit-waste
    │  verifikasi Turnstile (server) → validasi zod → rate limit (sha256(ip+salt), 10/jam)
    │  → idempotency_key (kirim ulang aman: kunci sama = tiket sama)
    │  → insert submission+items (service role) → kode tiket → signed upload URL (≤3)
    ◀── {ticket, uploadUrls} ── kompres foto (≤1280px, WebP) → PUT ke bucket privat
[Cek status] ─▶ Edge fn check-status (rate limit) → {status, alasan, tanggal, ringkasan item} tanpa PII

[Petugas] email + password (akun dibuat admin) → supabase-js (JWT) → RLS officer   [K1]
    verify_submission() ─▶ lots + stock_movements(inbound) + slot_units + audit_log
    create_outbound()   ─▶ outbound + items + stock_movements(outbound) + slot_units.removed_at
    foto: storage.createSignedUrl(60 dtk) — policy storage hanya officer

[DB trigger] pada stock_movements / submissions / slot_units
    → realtime.send(topic 'spu:public', event 'changed', {scope, at})  ← tanpa baris mentah
[Dashboard publik] subscribe broadcast → debounce 1,5 dtk → panggil ulang public_status()  [A1: hanya % & ada/tidak]
[Dashboard officer] subscribe broadcast privat 'spu:officer' (otorisasi RLS realtime.messages)

[GitHub Action keepalive] cron tiap 3 hari → POST /rest/v1/rpc/ping (anon key)
[A1 Backup harian, repo privat] pg_dump --data-only tabel utama → age (kunci publik) → commit
    → hapus file > 90 hari dan padatkan riwayat (orphan commit)
    [K1] kunci privat age offline → uji restore MANUAL berkala ke Postgres kosong (prosedur terdokumentasi)
```

Antrean offline:

- Kiriman yang gagal karena jaringan disimpan di IndexedDB beserta `idempotency_key`.
- Saat `online`, token Turnstile baru diambil dulu (token hanya berlaku 300 detik), lalu dikirim ulang.

## 7. Keputusan teknis penting

- **Routing:** `HashRouter`. `base` Vite diambil dari `VITE_BASE` (CI mengisi `/${repo}/`).
  - **[K1] Auth petugas = `signInWithPassword`.** Tidak ada redirect/callback email, jadi tidak ada bentrok dengan hash router.
  - Di Supabase: sign up dimatikan, user dibuat admin dengan auto-confirm.
  - Lupa password → hubungi admin, yang me-reset di Dashboard. Tidak ada email reset.
- **[K1] Batas data publik (peta site & dashboard publik)**, dijamin 3 lapis:
  1. DB: `anon` hanya punya EXECUTE pada `public_status()` dan `ping()`, tanpa SELECT tabel. Diuji pgTAP di Fase 1. Query pemeriksanya ada di `supabase/tests/sql/anon_no_select.sql`.
  2. Klien: `parsePublicStatus()` di `src/lib/api/public-status.ts` adalah whitelist `capacityPct`, `hasWaste`, `updatedAt`. Field lain dibuang. Ada unit test.
  3. Lint: `eslint.config.js` (`PUBLIC_BOUNDARY_PATTERNS`) melarang `src/features/site3d/**` dan halaman publik mengimpor modul petugas, `spu3d`, supabase, atau API selain public-status. Diuji di `src/test/public-boundary.test.ts`.
  - Klik SPU di peta site → publik melihat sheet nama bangunan + persen kapasitas. Petugas yang login mendapat tombol ke route `/petugas/3d` (dijaga `RequireRole`), bukan import langsung.
- **[K1] Gitleaks:** CLI v8.30.1 dengan SHA-256 dipin di `.github/workflows/secret-scan.yml`, opsi `--redact`. Bukan gitleaks-action, sehingga tidak ada pengecekan lisensi.
- **Anggaran bundle form** (≤ 180 KB gzip):
  - Route form **tidak** mengimpor supabase-js, three, recharts, atau zustand-3D. Form cukup memakai `fetch` ke Edge Function.
  - Motion dipakai dengan `LazyMotion` + `domAnimation` + komponen `m`.
  - Validasi memakai zod/mini.
  - Script Turnstile dimuat saat langkah Konfirmasi.
  - Dicek di CI dengan `size-limit`.
  - Estimasi: React 19 ≈ 60, router ≈ 15, motion ≈ 18, app ≈ 40 → ≈ 135 KB.
- **3D:** `React.lazy` + chunk terpisah.
  - Kualitas: `PerformanceMonitor`, DPR [1, 1.5] di tier sedang, dan tier rendah/sedang/tinggi dari GPU tier + `deviceMemory` + `hardwareConcurrency`.
  - `InstancedMesh` untuk drum dan pallet. Bayangan memakai `ContactShadows`/baked. Post-processing hanya di tier tinggi.
- **Orkestrasi motion:** `scene-director` (zustand) adalah antrean adegan utama, maksimal satu adegan berjalan bersamaan. Event realtime digabung (misalnya "+4 drum B105d").
- **Fallback:** kalau WebGL gagal, tier rendah plus FPS < 25, atau pengguna memilih → denah SVG 2D dari `computeLayout` yang sama.
- **Font:** self-hosted via `@fontsource-variable`, subset latin, `font-display: swap`.
  - **Plus Jakarta Sans** (UI, buatan Indonesia, tidak generik).
  - **JetBrains Mono** (kode limbah/lot/tiket).
- **Warna gelap:**
  - latar `#0B1513` (slate kehijauan), permukaan kaca `rgb(255 255 255 / 0.04)` + blur
  - aksen `#34D399`, amber `#F5B841`, kritis `#F26B5B`
  - Kontras diverifikasi AA lewat skrip test token.
- **Token motion** (`src/design/motion.ts`):
  - micro 120–200 ms, transisi 300–500 ms, adegan 700–1200 ms
  - `ease.out = [0.22, 1, 0.36, 1]`, spring fisik `{stiffness 260, damping 26}`
  - `useReducedMotion` → fade saja, kamera dan partikel dimatikan.
- **PWA:** `vite-plugin-pwa` (generateSW) untuk precache aset statis, halaman offline, dan manifest dengan ikon maskable.

## 8. Rencana fase

Di setiap akhir fase saya menjalankan `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (plus test DB bila relevan), commit, push ke `ccr-5f13bd91-gymk5q`, lalu berhenti untuk review dengan panduan cara mengetes.

0. **Scaffold.**
   - `CLAUDE.md` (stack, aturan keamanan, aturan motion, perintah).
   - Vite + React + TS + Tailwind 4, ESLint, Prettier, Vitest.
   - Token desain dan motion, font, AppShell (bottom nav di HP / sidebar di desktop), halaman placeholder dengan HashRouter.
   - `spu-building.ts` + `computeLayout` + test angka §5.
   - `.env.example`, CI lint/test/build + size-limit.
1. **DB.**
   - Migrasi, seed (22 jenis limbah, 8 kelompok, kemasan, config, 42 slot Opsi B [K1]).
   - RLS, trigger append-only + audit, RPC, broadcast realtime, bucket storage + policy.
   - Edge Functions `submit-waste`, `check-status`, `request-upload` (test Deno untuk validasi, normalisasi telepon, dan ticket).
   - Test pgTAP RLS: anon tidak bisa baca/tulis tabel, officer tidak bisa UPDATE/DELETE data terverifikasi, RPC publik tanpa PII.
   - **[A1]** `public_status()` hanya mengembalikan persen dan boolean. Ada test yang memastikan setiap tabel menolak SELECT dari `anon`.
   - Workflow `db-tests.yml` berjalan di setiap push/PR yang mengubah `supabase/**`, plus jadwal mingguan.
   - **[A1]** Seed uji coba hanya data dummy, misalnya pengirim "Uji Coba 01" dengan telepon `+62 812-0000-0001`.
   - Kolom aktor (`created_by`, `verified_by`) tidak memakai FK ke `auth.users`. Nama petugas disimpan sebagai snapshot, agar restore ke DB kosong tidak gagal.
   - Auth email + password (`signInWithPassword`) + RequireRole. Sign up dimatikan. README menjelaskan cara admin membuat akun dan me-reset password [K1].
2. **Form publik:** wizard 3 langkah, picker bottom-sheet, combobox, stepper, kompres foto, draft otomatis, antrean kirim ulang, layar sukses (path draw + kartu tiket), cek status.
3. **Officer:** antrean verifikasi (kartu swipe + konfirmasi), badge selisih, form keluar FIFO, logbook dengan filter/pencarian, daftar lot + progress umur, master data, export CSV, tampilan cetak, alert.
4. **Dashboard realtime [A1]:** publik = cincin kapasitas % + status ada/tidak ada limbah + LiveDot. Petugas = KPI count-up (stok kg, lot aktif, mendekati batas, masuk/keluar bulan ini), grafik Recharts (stok per jenis, tren masuk vs keluar, donut kelompok, distribusi umur), alert. Keduanya memakai broadcast + reload RPC.
5. **3D interior (khusus petugas [K1], route `/petugas/3d`):** model prosedural (drum instanced, pallet, IBC, jumbo bag, jerigen, box, rak tabung), zona lantai, curb, pintu roller, ventilasi, signage, APAR, hologram pending, animasi verifikasi/keluar, panel "Muat atau tidak?", what-if ghost, info sheet, preset kamera, atap transparan, siang/malam, fallback SVG 2D, unit test planner.
6. **Peta site 3D (publik, tanpa ikon/label/angka drum atau stok [K1]):** layout placeholder di JSON (sungai, jetty, process area, akomodasi, kantor, SPU, jalan, pagar, gerbang, pohon), air bergelombang (shader ringan), perahu, uap, lampu malam, slider siang-malam, hotspot yang memudar menurut jarak (hanya nama bangunan), fly-to + bottom sheet, transisi ke interior hanya untuk petugas yang login, intro sinematik yang bisa dilewati.
7. **Polish:** motion pass, performance pass (Lighthouse CI mobile ≥ 90/95), PWA, a11y (axe di Playwright), tes Playwright di 4 viewport, workflow deploy Pages + keepalive, README.
   - **[A1] Backup:**
     - Workflow harian `pg_dump --data-only` untuk: submissions, submission_items, lots, stock_movements, outbound, outbound_items, audit_log, waste_types, packaging_types, app_config.
     - Ditambah tabel yang dibutuhkan agar restore konsisten: profiles, waste_groups, submission_photos, outbound_attachments, pallet_slots, slot_units.
     - Dienkripsi dengan `age`. Workflow **hanya** memegang kunci publik (recipient `age1…`).
     - Kunci privat **tidak** disimpan di repo atau GitHub Secrets. Kunci itu disimpan offline oleh pemilik, misalnya di password manager dan cetak kertas di lemari terkunci [K1].
     - Disimpan di repo privat. Retensi 90 hari dengan pemadatan riwayat.
     - `ops/backup/restore.sh` + dokumen uji restore ke database kosong (migrasi → restore → cek jumlah baris & `SUM` stok).
     - [K1] Uji restore **manual** memakai kunci privat offline:
       - Prosedur langkah demi langkah ada di `ops/backup/RESTORE.md`, termasuk mengisi log hasil uji.
       - Jadwal saran: setelah setup, lalu tiap bulan.
     - CI repo privat hanya bisa memeriksa yang tidak butuh kunci privat: file berawalan `age-encryption.org/v1`, ukuran > 0, dan jumlah baris per tabel sebelum enkripsi (tanpa isi data).
   - Catatan: file storage (foto) tidak ikut backup tabel. Kalau perlu, ekspor terpisah yang juga terenkripsi (ditanyakan di Fase 7).

## 8b. Catatan pelaksanaan Fase 1 [F1]

- **Perbedaan Supabase vs Postgres polos** (syarat 1):
  1. Default privileges Supabase memberi anon hak pada objek baru. Pemeriksaan Fase 0 "default ACL tidak memberi anon" **lolos di Postgres polos (setelah hardening) tetapi gagal di Supabase**, karena syarat 2 melarang mengubah default ACL. Diganti dengan revoke per objek + test hak efektif + test "default ACL sama dengan baseline".
  2. Skema `storage` memberi anon/authenticated grant tabel bawaan. Akses diblokir RLS tanpa policy (diuji perilaku, bukan grant).
  3. `realtime.send` menambah kunci `id` ke payload broadcast.
  4. Collation basis data en_US, sehingga perbandingan urutan di pgTAP memakai `collate "C"`.
- **Perubahan dari rencana:**
  - `group_incompatibilities` menjadi kolom `waste_groups.incompatible_with` (seed tetap di 4 tabel master).
  - `request-upload` digabung ke `submit-waste`: signed upload URL dikembalikan saat kirim, dan dibuat ulang saat kirim ulang dengan idempotency key yang sama.
  - Tambahan Edge Function `form-options` (master untuk form publik, via service role) dan `photo-url` (satu-satunya pembuat signed URL baca, 60 dtk).
  - `pallet_slots` diisi RPC admin di Fase 5. Sebelum itu `public_status()` mengestimasi slot dari kemasan tersisa per lot dibagi `app_config.capacity_slots_total` (42).
  - Tanggal terima lot = tanggal masuk kiriman (jam simpan dihitung sejak limbah masuk SPU).
  - Status tiket publik tidak menampilkan kg (hanya kode/nama limbah dan jumlah kemasan).

## 9. Risiko dan mitigasi

- **[A1] Batas paket gratis Supabase:**
  - DB 500 MB, Storage 1 GB, egress 5 GB/bulan.
  - Edge Functions 500 rb panggilan/bulan, Realtime 200 koneksi bersamaan.
  - Project di-pause setelah ±7 hari tidak aktif (ditangani keep-alive).
  - Tanpa PITR (ditangani backup sendiri).
  - Email bawaan terbatas (lihat pertanyaan 13).
  - Foto dikompres di browser (≤ 1280 px, WebP ≈ 100–200 KB), jadi 1 GB cukup untuk ribuan foto.
  - Fitur berbayar yang **tidak** dipakai: custom SMTP, image transformation, PITR, branching, custom domain.
- **[A1] Log GitHub Actions di repo publik terlihat semua orang.** Workflow tidak boleh mencetak data, dan backup tidak dijalankan di repo publik (default pertanyaan 15).

- **Docker tidak tersedia di container ini.**
  - Test pgTAP berjalan di GitHub Actions (`supabase start` di runner Ubuntu).
  - Di container ini saya mencoba menjalankan dockerd. Kalau gagal, saya jalankan migrasi dan test di Postgres 16 lokal dengan shim minimal skema `auth` dan role `anon`/`authenticated`/`service_role`.
  - Saya akan melaporkan dengan jelas jalur mana yang benar-benar dijalankan.
- **Saya tidak bisa membuat project Supabase atau Turnstile Anda.** Di README saya tulis langkahnya. Untuk dev dan test tersedia mode `VITE_DEMO=1` dengan data mock, dan test key resmi Turnstile (`1x00000000000000000000AA`) dipakai di lokal.
- **Lighthouse/LCP di jaringan 4G** diukur dengan throttling Lighthouse di CI, bukan di perangkat fisik.

## 10. Verifikasi (cara Anda mengetes, ringkas)

- `pnpm i && pnpm dev` → buka `http://localhost:5173/#/` di DevTools mode HP (360×640).
- `pnpm test` (unit: kapasitas, planner, telepon, ticket, umur lot), `pnpm test:db` (pgTAP RLS), `pnpm e2e` (Playwright 4 viewport), `pnpm size` (anggaran bundle).
- Deploy: isi Repository Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`), aktifkan Pages dengan sumber "GitHub Actions", lalu push.
