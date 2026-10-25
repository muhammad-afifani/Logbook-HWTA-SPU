-- =============================================================================
-- SEED: HANYA master data (waste_groups, packaging_types, waste_types, app_config).
-- Tidak ada data kiriman, nama, atau telepon. Data uji dibuat di dalam test pgTAP
-- (transaksi yang di-rollback) dan selalu dummy.
--
-- Kelompok segregasi + inkompatibilitas = USULAN, wajib direview K3.
-- kg_per_package = ESTIMASI awal, wajib dikoreksi admin.
-- Warna kelompok sama dengan src/config/waste-groups.ts (diuji vitest).
-- =============================================================================

insert into public.app_config (key, value, description) values
  ('timezone', '"Asia/Makassar"', 'Zona waktu lokasi (WITA) untuk "hari ini", umur lot, rekap bulanan'),
  ('backdate_max_days', '7', 'Tanggal masuk boleh mundur maksimal N hari'),
  ('default_storage_days', '30', 'Batas simpan default (hari) bila jenis limbah tidak mengatur'),
  ('weight_diff_warn_pct', '10', 'Badge selisih bila timbang aktual beda > N% dari deklarasi'),
  ('capacity_warn', '[0.8, 0.95]', 'Ambang peringatan kapasitas (kuning, merah)'),
  ('pending_alert_hours', '24', 'Alert bila kiriman pending lebih dari N jam'),
  ('ageing_thresholds', '[21, 26, 30]', 'Umur lot (hari) untuk kuning, oranye, merah'),
  ('public_show_entity', 'false', 'Tampilkan agregat per entity di publik (default mati)'),
  ('capacity_slots_total', '42', 'Total slot bila pallet_slots belum disinkronkan (Opsi B, belum verifikasi K3)'),
  ('rate_limit_submit', '{"limit": 10, "window_seconds": 3600}', 'Batas kirim form per hash IP'),
  ('rate_limit_status', '{"limit": 60, "window_seconds": 3600}', 'Batas cek status per hash IP');

insert into public.waste_groups (code, name, color_dark, color_light, proposed, incompatible_with, sort) values
  ('G1', 'Oli dan residu minyak',   '#3987e5', '#2a78d6', true, '{G5,G8}', 1),
  ('G2', 'Cat, tinta, pelarut',     '#d95926', '#eb6834', true, '{G5,G8}', 2),
  ('G3', 'Padatan terkontaminasi',  '#199e70', '#1baf7a', true, '{}', 3),
  ('G4', 'Elektronik dan baterai',  '#c98500', '#eda100', true, '{G5}', 4),
  ('G5', 'Kimia dan laboratorium',  '#d55181', '#e87ba4', true, '{G1,G2,G4}', 5),
  ('G6', 'Klinis dan farmasi',      '#008300', '#008300', true, '{}', 6),
  ('G7', 'Asbestos',                '#9085e9', '#6250d6', true, '{}', 7),
  ('G8', 'Tabung gas',              '#e66767', '#e34948', true, '{G1,G2}', 8);

insert into public.packaging_types
  (code, name, width_m, depth_m, height_m, shape, uses_pallet, units_per_pallet, stackable, max_stack_levels, sort) values
  ('drum200',    'Drum 200 L',        0.58, 0.58, 0.88, 'cylinder',     true,  4,  true,  3, 1),
  ('jerigen',    'Jerigen / pail',    0.30, 0.25, 0.40, 'jerrycan',     true,  16, true,  2, 2),
  ('ibc',        'IBC 1000 L',        1.20, 1.00, 1.16, 'ibc',          false, 1,  true,  2, 3),
  ('box_crate',  'Box / crate',       0.60, 0.60, 0.50, 'box',          true,  4,  true,  2, 4),
  ('jumbo_bag',  'Jumbo bag',         0.90, 0.90, 1.00, 'bag',          true,  1,  false, 1, 5),
  ('karung',     'Karung',            0.50, 0.80, 0.25, 'sack',         true,  8,  true,  2, 6),
  ('tabung_gas', 'Tabung gas (rak)',  0.25, 0.25, 0.90, 'gas_cylinder', false, 12, false, 1, 7),
  ('lainnya',    'Lainnya',           1.20, 1.20, 1.00, 'other',        true,  1,  false, 1, 8);

-- Kode & nama disimpan apa adanya. A3330-1 dan B354-4 diberi needs_review (kode janggal).
insert into public.waste_types (code, name, group_code, default_packaging, kg_per_package, storage_zone, needs_review) values
  ('A102d',   'Aki, baterai bekas', 'G4', 'box_crate', 100, 'G4', false),
  ('A106d',   'Limbah laboratorium mengandung B3', 'G5', 'jerigen', 20, 'G5', false),
  ('A108d',   'Limbah terkontaminasi B3', 'G3', 'drum200', 120, 'G3', false),
  ('A111d',   'Refrigerant bekas', 'G8', 'tabung_gas', 13, 'G8', false),
  ('B104d',   'Kemasan bekas B3', 'G2', 'jumbo_bag', 150, 'G2', false),
  ('B105d',   'Minyak pelumas bekas (hidrolik, mesin, gear, lubrikasi, insulasi, heat transmission, grit chamber, separator dan/atau campurannya)', 'G1', 'drum200', 180, 'G1', false),
  ('B107d',   'Limbah elektronik (CRT, lampu TL, PCB, wire rubber)', 'G4', 'box_crate', 50, 'G4', false),
  ('B110d',   'Kain majun bekas dan sejenisnya', 'G3', 'drum200', 60, 'G3', false),
  ('B321-4',  'Kemasan bekas tinta', 'G2', 'box_crate', 30, 'G2', false),
  ('B323-1',  'Sisa proses blasting', 'G3', 'jumbo_bag', 1000, 'G3', false),
  ('A325-1',  'Limbah cat dan varnish', 'G2', 'drum200', 180, 'G2', false),
  ('A3330-1', 'Residue dasar tangki minyak bumi', 'G1', 'drum200', 200, 'G1', true),
  ('A330-2',  'Residue proses produksi', 'G1', 'drum200', 200, 'G1', false),
  ('B330-1',  'Lumpur oil base mud dan synthetic oil', 'G1', 'drum200', 220, 'G1', false),
  ('B330-2',  'Serbuk bor oil base dan/atau synthetic oil', 'G1', 'jumbo_bag', 1000, 'G1', false),
  ('B330-4',  'Absorben dan/atau filter bekas', 'G3', 'drum200', 100, 'G3', false),
  ('A337-1',  'Limbah klinis infeksius', 'G6', 'box_crate', 10, 'G6', false),
  ('A337-2',  'Limbah farmasi kadaluarsa', 'G6', 'box_crate', 10, 'G6', false),
  ('A338-1',  'Bahan kimia kadaluarsa', 'G5', 'jerigen', 20, 'G5', false),
  ('B353-1',  'Toner bekas', 'G4', 'box_crate', 10, 'G4', false),
  ('B354-4',  'Material insulasi mengandung asbestos', 'G7', 'jumbo_bag', 300, 'G7', true),
  ('B352-5',  'Material konstruksi mengandung asbestos', 'G7', 'jumbo_bag', 500, 'G7', false);
