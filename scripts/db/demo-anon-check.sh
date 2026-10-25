#!/usr/bin/env bash
# Demo Fase 0: buktikan mekanisme "anon tidak bisa SELECT tabel mana pun" di Postgres 16 lokal
# dengan grant bawaan ala Supabase. Skema di sini masih STUB (nama tabel sesuai rencana);
# di Fase 1 skrip ini diganti test pgTAP terhadap migrasi asli.
#
# Pakai: scripts/db/demo-anon-check.sh   (butuh binari Postgres 16; dijalankan sebagai user postgres)
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
PORT=${PORT:-54329}
trap '"$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

"$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q)

echo "== 1. Role & grant bawaan ala Supabase (anon/authenticated mendapat ALL di public) =="
"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

echo "== 2. Tabel rencana (stub) =="
"${PSQL[@]}" <<'SQL'
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','profiles','waste_groups','group_incompatibilities','waste_types',
    'packaging_types','submissions','submission_items','submission_photos','lots',
    'stock_movements','outbound','outbound_items','outbound_attachments','pallet_slots',
    'slot_units','suggestion_terms','audit_log','ticket_counters','rate_limits'
  ] loop
    execute format('create table public.%I (id bigint generated always as identity primary key, note text)', t);
    execute format('insert into public.%I (note) values (%L)', t, 'data dummy');
  end loop;
end $$;
create function public.ping() returns text language sql as $$ select 'ok' $$;
create function public.public_status() returns jsonb language sql security definer
  as $$ select jsonb_build_object('capacity_pct', 0, 'has_waste', false) $$;
create function public.officer_summary() returns bigint language sql as $$ select 1::bigint $$;
SQL

check() {
  local label=$1
  echo "-- [$label] Query 1: relasi yang bisa di-SELECT anon"
  "${PSQL[@]}" -c "select count(*) as relasi_terbaca_anon from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','f') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'))"
  echo "-- [$label] Uji perilaku: SET ROLE anon lalu SELECT setiap tabel"
  "${PSQL[@]}" <<'SQL'
create temp table hasil (tabel text, hasil text);
grant insert on hasil to anon;
do $$
declare r record; n bigint;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind in ('r','p') order by 1 loop
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', r.relname) into n;
      execute 'reset role';
      insert into hasil values (r.relname, 'TERBACA (' || n || ' baris)');
    exception when insufficient_privilege then
      execute 'reset role';
      insert into hasil values (r.relname, 'permission denied');
    end;
  end loop;
end $$;
select hasil, count(*) as jumlah_tabel from hasil group by 1 order by 1;
SQL
}

echo
echo "== 3. SEBELUM hardening (harus terdeteksi bocor) =="
check SEBELUM

echo
echo "== 4. Hardening (akan menjadi bagian migrasi Fase 1) =="
"${PSQL[@]}" <<'SQL'
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges revoke execute on functions from public;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.ping(), public.public_status() to anon;
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
SQL

echo
echo "== 5. SESUDAH hardening (harus 0 relasi, semua permission denied) =="
check SESUDAH
echo "-- [SESUDAH] Query lengkap supabase/tests/sql/anon_no_select.sql:"
"${PSQL[@]}" -P footer=on -f "$ROOT/supabase/tests/sql/anon_no_select.sql"
