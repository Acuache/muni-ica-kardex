-- SPEC 02 · Paso 4 — Seed del único superadmin.
--
-- El usuario raíz se crea A MANO en el panel de Supabase Auth (Authentication →
-- Users → Add user). Este seed solo le fija role='superadmin' buscándolo por
-- email. Cero credenciales / service role en el código.
--
-- Requisito previo: haber creado en Auth el usuario con este email, y haber
-- aplicado las migraciones (el trigger on_auth_user_created ya habrá insertado
-- su fila en public.profiles con role='usuario').

-- Backfill: si el superadmin (u otros usuarios) se crearon en Auth ANTES de
-- existir la tabla profiles, el trigger de alta no llegó a poblar su fila.
-- Este insert idempotente la crea con los valores por defecto (role='usuario').
insert into public.profiles (id)
select u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- El guard `guard_profile_write` bloquea cualquier cambio de rol hecho por un
-- no-admin (y en el seed `auth.uid()` es null → no es admin). Se desactiva el
-- trigger SOLO durante este UPDATE administrativo y se reactiva enseguida; el
-- guard queda intacto para el resto de operaciones.
alter table public.profiles disable trigger guard_profile_update;

update public.profiles
   set role = 'superadmin'
 where id = (
   select id from auth.users where email = 'v.acuache15@gmail.com'
 );

alter table public.profiles enable trigger guard_profile_update;


-- ===========================================================================
-- SPEC 03 · Paso 5 — Seed del catálogo (categorías + productos ficticios).
--
-- Datos de ejemplo para demostrar el flujo del kardex. Idempotente: `nombre`
-- de categoría y `sku` de producto son únicos → `on conflict do nothing`.
-- `imagen_path` queda null (las imágenes se cargan desde la UI, no se siembran
-- binarios en Storage). Las fechas de caducidad de los perecibles se fijan
-- RELATIVAS a la fecha del seed (`current_date ± n`) para que el dashboard del
-- Spec 07 siempre muestre un vencido, un próximo y uno fuera del umbral.
-- ===========================================================================

insert into public.categorias (nombre, descripcion) values
  ('Útiles de oficina',  'Lapiceros, grapas, clips y afines'),
  ('Papelería',          'Hojas, cuadernos y folders'),
  ('Limpieza',           'Insumos y productos de limpieza'),
  ('Perecibles',         'Insumos con fecha de caducidad'),
  ('Equipos de cómputo', 'Accesorios y consumibles de cómputo')
on conflict (nombre) do nothing;

insert into public.productos
  (sku, nombre, categoria_id, stock_actual, stock_minimo, es_perecible, fecha_caducidad)
values
  ('OF-LAP-AZ', 'Lapicero azul',           (select id from public.categorias where nombre = 'Útiles de oficina'),  200, 50, false, null),
  ('OF-LAP-NE', 'Lapicero negro',          (select id from public.categorias where nombre = 'Útiles de oficina'),  180, 50, false, null),
  ('OF-GRAP',   'Grapas 26/6 x1000',       (select id from public.categorias where nombre = 'Útiles de oficina'),   60, 10, false, null),
  ('OF-CLIP',   'Clips metálicos x100',    (select id from public.categorias where nombre = 'Útiles de oficina'),    0, 10, false, null),  -- agotado (sin salidas): alimenta el badge "Agotado"
  ('PA-HB-A4',  'Hojas bond A4 75g',       (select id from public.categorias where nombre = 'Papelería'),          120, 20, false, null),
  ('PA-HB-A3',  'Hojas bond A3 75g',       (select id from public.categorias where nombre = 'Papelería'),           30,  5, false, null),
  ('PA-CUAD',   'Cuaderno A4 cuadriculado',(select id from public.categorias where nombre = 'Papelería'),           90, 15, false, null),
  ('PA-FOLD',   'Folder manila A4',        (select id from public.categorias where nombre = 'Papelería'),            3,  5, false, null),  -- bajo mínimo (sin salidas), no agotado
  ('LI-DET',    'Detergente multiusos',    (select id from public.categorias where nombre = 'Limpieza'),            50, 10, false, null),
  ('LI-LEJ',    'Lejía 5L',                (select id from public.categorias where nombre = 'Limpieza'),            20,  5, false, null),
  ('LI-PAP',    'Papel higiénico jumbo',   (select id from public.categorias where nombre = 'Limpieza'),           300, 40, false, null),
  -- Fechas de caducidad RELATIVAS a la fecha del seed para que el dashboard
  -- siempre muestre un vencido y un próximo, sin importar cuándo se siembre:
  ('PE-ALC',    'Alcohol gel 500ml',       (select id from public.categorias where nombre = 'Perecibles'),          80, 20, true,  current_date + 10),   -- próximo a caducar (dentro del umbral de 30 días)
  ('PE-CAFE',   'Café molido 250g',        (select id from public.categorias where nombre = 'Perecibles'),          40, 10, true,  current_date - 5),    -- VENCIDO: alimenta el badge "Vencido"
  ('PE-AZUC',   'Azúcar rubia 1kg',        (select id from public.categorias where nombre = 'Perecibles'),          35, 10, true,  current_date + 120),  -- fuera del umbral: NO debe aparecer en "Próximos a caducar"
  ('EQ-USB',    'Memoria USB 32GB',        (select id from public.categorias where nombre = 'Equipos de cómputo'),  25,  5, false, null)
on conflict (sku) do nothing;


-- ===========================================================================
-- SPEC 04 · Paso 2 — Seed de áreas ficticias.
--
-- Áreas destinatarias de las salidas de almacén. Datos de ejemplo para asignar
-- a los usuarios y alimentar el historial por área (Spec 08). Idempotente:
-- `nombre` es único → `on conflict do nothing`.
-- ===========================================================================

insert into public.areas (nombre) values
  ('Logística'),
  ('Contabilidad'),
  ('Recursos Humanos'),
  ('Mesa de Partes'),
  ('Gerencia'),
  ('Tesorería')
on conflict (nombre) do nothing;


-- ===========================================================================
-- SPEC 05 · Paso 8 — Seed de movimientos de kardex.
--
-- Movimientos ficticios (entradas y salidas) sobre productos y áreas ya
-- sembrados. Cubren 12 productos con salidas (para que los rankings del Spec 07
-- tengan >10 filas y "más pedidos" vs "menos pedidos" se distingan) y dejan
-- varios productos SIN salidas (OF-CLIP, PA-FOLD, PE-AZUC) para la lista "Sin
-- movimiento". Las salidas se reparten entre 3 y 45 días atrás para que el
-- selector de rango (7/30/90) cambie los totales. Se insertan DIRECTAMENTE
-- (no vía la RPC registrar_movimiento):
-- el seed corre como superusuario sin sesión, así que auth.uid() es null y la
-- RPC fallaría por is_admin(). El usuario_id se fija al superadmin del seed.
--
-- Idempotente: todo el bloque se salta si ya hay movimientos. Al final, el
-- `stock_actual` de CADA producto afectado se CUADRA al neto de sus movimientos
-- (entradas − salidas), como exige el criterio de aceptación. Los productos NO
-- afectados conservan su stock inicial (decisión 3.a: el stock previo se respeta
-- tal cual; solo lo mueven los movimientos de aquí en adelante).
-- ===========================================================================

do $$
declare
  v_super uuid := (select id from auth.users where email = 'v.acuache15@gmail.com');
  r       record;
  v_lote  uuid;
  v_prod  uuid;
  v_area  uuid;
begin
  -- Idempotencia: si ya existe historial, no re-sembrar.
  if exists (select 1 from public.movimientos) then
    return;
  end if;

  -- Cada movimiento del seed es su propio lote (Spec 06.1): se recorre por
  -- antigüedad (más días atrás primero) para que el número de lote siga la
  -- cronología (L-1 = el más antiguo). Las entradas van sin área (area_nombre
  -- null → area_id null, exigido por el check movimientos_entrada_area); las
  -- salidas siempre llevan área.
  for r in
    select * from (values
      -- Lapicero azul — salidas 50 (net +150)
      ('entrada', 'OF-LAP-AZ', 200, null,               'Compra a proveedor',       60),
      ('salida',  'OF-LAP-AZ',  30, 'Logística',         'Entrega mensual',          20),
      ('salida',  'OF-LAP-AZ',  20, 'Contabilidad',      'Reposición de escritorio', 10),
      -- Lapicero negro — salidas 25 (net +175)
      ('entrada', 'OF-LAP-NE', 200, null,               'Compra a proveedor',       58),
      ('salida',  'OF-LAP-NE',  15, 'Recursos Humanos',  'Entrega mensual',          25),
      ('salida',  'OF-LAP-NE',  10, 'Gerencia',          'Reposición de escritorio',  5),
      -- Grapas — salidas 8 (net +52)
      ('entrada', 'OF-GRAP',    60, null,               'Compra a proveedor',       55),
      ('salida',  'OF-GRAP',     5, 'Logística',         'Uso administrativo',       40),
      ('salida',  'OF-GRAP',     3, 'Mesa de Partes',    'Uso administrativo',        8),
      -- Hojas bond A4 — salidas 80 (net +120)
      ('entrada', 'PA-HB-A4',  200, null,                'Compra a proveedor',       50),
      ('salida',  'PA-HB-A4',   50, 'Mesa de Partes',    'Atención al público',      15),
      ('salida',  'PA-HB-A4',   30, 'Gerencia',          'Documentación interna',     5),
      -- Hojas bond A3 — salidas 4 (net +26)
      ('entrada', 'PA-HB-A3',   30, null,                'Compra a proveedor',       48),
      ('salida',  'PA-HB-A3',    4, 'Contabilidad',      'Documentación interna',    12),
      -- Cuaderno — salidas 18 (net +72)
      ('entrada', 'PA-CUAD',    90, null,                'Compra a proveedor',       45),
      ('salida',  'PA-CUAD',    10, 'Recursos Humanos',  'Entrega de materiales',    22),
      ('salida',  'PA-CUAD',     8, 'Logística',         'Entrega de materiales',     6),
      -- Detergente — salidas 31 (net +29)
      ('entrada', 'LI-DET',     60, null,                'Compra a proveedor',       42),
      ('salida',  'LI-DET',     20, 'Recursos Humanos',  'Limpieza de oficina',      18),
      ('salida',  'LI-DET',     11, 'Tesorería',         'Limpieza de oficina',       4),
      -- Lejía — salidas 6 (net +14)
      ('entrada', 'LI-LEJ',     20, null,                'Compra a proveedor',       40),
      ('salida',  'LI-LEJ',      6, 'Logística',         'Limpieza de oficina',      16),
      -- Papel higiénico — salidas 45 (net +255)
      ('entrada', 'LI-PAP',    300, null,                'Compra a proveedor',       52),
      ('salida',  'LI-PAP',     25, 'Mesa de Partes',    'Servicios higiénicos',     14),
      ('salida',  'LI-PAP',     20, 'Gerencia',          'Servicios higiénicos',     44),
      -- Alcohol gel — salidas 30 (net +50)
      ('entrada', 'PE-ALC',     80, null,                'Compra a proveedor',       50),
      ('salida',  'PE-ALC',     20, 'Tesorería',         'Dispensadores',            12),
      ('salida',  'PE-ALC',     10, 'Logística',         'Dispensadores',             4),
      -- Café molido — salidas 2 (net +38); el que MENOS se pidió
      ('entrada', 'PE-CAFE',    40, null,                'Compra a proveedor',       46),
      ('salida',  'PE-CAFE',     2, 'Gerencia',          'Consumo interno',           9),
      -- Memoria USB — salidas 12 (net +18)
      ('entrada', 'EQ-USB',     30, null,                'Compra a proveedor',       54),
      ('salida',  'EQ-USB',     12, 'Contabilidad',      'Respaldo de información',    3)
    ) as v(tipo, sku, cantidad, area_nombre, motivo, dias)
    order by v.dias desc
  loop
    insert into public.lotes default values returning id into v_lote;

    select id into v_prod from public.productos where sku = r.sku;
    v_area := null;
    if r.area_nombre is not null then
      select id into v_area from public.areas where nombre = r.area_nombre;
    end if;

    insert into public.movimientos
      (tipo, producto_id, cantidad, area_id, usuario_id, motivo, fecha, lote_id)
    values
      (r.tipo, v_prod, r.cantidad, v_area, v_super, r.motivo,
       now() - make_interval(days => r.dias), v_lote);
  end loop;

  -- Cuadra el stock de los productos afectados al neto de sus movimientos.
  update public.productos p
     set stock_actual = sub.net
    from (
      select producto_id,
             sum(case when tipo = 'entrada' then cantidad else -cantidad end) as net
        from public.movimientos
       group by producto_id
    ) sub
   where p.id = sub.producto_id;
end $$;
