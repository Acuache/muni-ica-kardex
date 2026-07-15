-- SPEC 06 · Paso 2 — Columna `movimientos.folio`: el correlativo del vale.
--
-- El `uuid` del movimiento sirve para una FK, no para un documento: no se
-- dicta por teléfono, no se archiva en un file y no se reclama. El vale
-- necesita un número, y ese número lo asigna la base — nunca la app.
--
-- El orden de los tres tiempos NO es cosmético: `add generated always as
-- identity` exige que la columna ya sea `not null`, y añadir la identity
-- directamente sobre una tabla con filas numeraría en orden físico arbitrario,
-- contradiciendo la cronología del seed. De ahí: columna nullable → backfill
-- ordenado por fecha → cerrar (not null + identity + setval) → unicidad.
--
-- Ni la RPC `registrar_movimiento` ni `supabase/seed.sql` cambian: sus inserts
-- no nombran `folio`, así que la identity lo asigna sola. El Spec 05 queda intacto.

-- ---------------------------------------------------------------------------
-- 1. Columna simple, nullable por ahora
-- ---------------------------------------------------------------------------
alter table public.movimientos add column folio bigint;

-- ---------------------------------------------------------------------------
-- 2. Backfill de las filas existentes (seed del Spec 05) en orden cronológico
-- ---------------------------------------------------------------------------
with numerados as (
  select id, row_number() over (order by fecha, created_at, id) as n
    from public.movimientos
)
update public.movimientos m
   set folio = numerados.n
  from numerados
 where m.id = numerados.id;

-- ---------------------------------------------------------------------------
-- 3. Cerrar: not null, identity (la app nunca fija el folio) y unicidad
-- ---------------------------------------------------------------------------
alter table public.movimientos
  alter column folio set not null,
  alter column folio add generated always as identity;

-- La secuencia arranca después del último folio del backfill.
select setval(
  pg_get_serial_sequence('public.movimientos', 'folio'),
  coalesce((select max(folio) from public.movimientos), 0) + 1,
  false
);

create unique index movimientos_folio_idx on public.movimientos (folio);

comment on column public.movimientos.folio is
  'Correlativo del vale (Spec 06). generated always: un insert que nombre folio es rechazado por la base — el folio no es un dato de la aplicación. Numera TODA fila, así que los vales (solo salidas) saltan números; el hueco es aceptado.';
