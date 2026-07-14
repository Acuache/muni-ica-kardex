-- SPEC 03 · Paso 2 — Catálogo: tablas `categorias` y `productos`.
--
-- Dos tablas nuevas del dominio de almacén. `productos` referencia a
-- `categorias` con `on delete restrict`: una categoría con productos NO se
-- puede eliminar. `stock_actual` arranca con el valor capturado al crear el
-- producto y a partir del Spec 05 solo lo mueven los movimientos de kardex.

-- ---------------------------------------------------------------------------
-- categorias
-- ---------------------------------------------------------------------------
create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  created_at  timestamptz not null default now()
);

comment on table public.categorias is
  'Categorías del catálogo de almacén (Spec 03). nombre único.';

-- ---------------------------------------------------------------------------
-- productos
-- ---------------------------------------------------------------------------
create table public.productos (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,                 -- código manual, único
  nombre          text not null,
  categoria_id    uuid not null
                    references public.categorias(id) on delete restrict,
  unidad          text not null
                    check (unidad in (
                      'unidad', 'caja', 'millar', 'paquete', 'docena', 'ciento',
                      'bolsa', 'botella', 'galon', 'litro', 'kilogramo'
                    )),
  stock_actual    int not null default 0 check (stock_actual >= 0),
  stock_minimo    int not null default 0 check (stock_minimo >= 0),
  es_perecible    boolean not null default false,
  fecha_caducidad date,
  imagen_path     text,                                 -- ruta del objeto en el bucket público 'productos'
  created_at      timestamptz not null default now(),
  -- La fecha de caducidad es OPCIONAL; solo puede fijarse en productos perecibles.
  constraint productos_perecible_fecha check (
    es_perecible = true or fecha_caducidad is null
  )
);

-- Índice para la FK (acelera joins/filtros por categoría y el on delete restrict).
create index productos_categoria_id_idx on public.productos (categoria_id);

comment on table public.productos is
  'Productos del catálogo (Spec 03). stock_actual arranca al crear; desde Spec 05 solo lo mueven los movimientos.';
comment on column public.productos.sku is
  'Código único del producto, capturado manualmente por el admin.';
comment on column public.productos.categoria_id is
  'Categoría (obligatoria). on delete restrict: no se elimina una categoría con productos.';
comment on column public.productos.stock_actual is
  'Existencias actuales. Valor inicial al crear; desde Spec 05 solo cambia por movimientos.';
comment on column public.productos.stock_minimo is
  'Umbral para la alerta de stock bajo del dashboard (Spec 07).';
comment on column public.productos.fecha_caducidad is
  'Opcional; solo se permite si es_perecible = true (constraint productos_perecible_fecha).';
comment on column public.productos.imagen_path is
  'Ruta del objeto en el bucket público de Storage "productos"; null si no tiene imagen.';
