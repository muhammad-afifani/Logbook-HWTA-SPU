-- Pemeriksaan: role `anon` TIDAK boleh membaca tabel mana pun.
-- Dipakai oleh demo Fase 0 (scripts/db/demo-anon-check.sh) dan menjadi dasar test pgTAP Fase 1.
-- Setiap query di bawah harus mengembalikan 0 baris (kecuali 4: daftar fungsi yang diizinkan).

-- 1) Hak SELECT di katalog: tabel, partisi, view, materialized view, foreign table
--    di semua skema non-sistem yang bisa diakses anon (termasuk hak per kolom).
select n.nspname as schema, c.relname as relation, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname not like 'pg_toast%'
  and n.nspname not like 'pg_temp%'
  and (has_table_privilege('anon', c.oid, 'SELECT')
       or has_any_column_privilege('anon', c.oid, 'SELECT'))
order by 1, 2;

-- 2) Default privileges: objek BARU di skema public tidak boleh otomatis memberi hak ke anon.
select d.defaclrole::regrole as owner, d.defaclobjtype as objtype, d.defaclacl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
  and array_to_string(d.defaclacl, ',') ~ '(^|,)anon=';

-- 3) Lapis kedua: setiap tabel di public harus RLS aktif.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- 4) Fungsi di public yang bisa dieksekusi anon (harus persis: ping, public_status).
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
