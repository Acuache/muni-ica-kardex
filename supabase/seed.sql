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
-- binarios en Storage). Fechas relativas a 2026-07-14; algunos perecibles
-- caducan pronto para alimentar el dashboard del Spec 07.
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
  ('OF-CLIP',   'Clips metálicos x100',    (select id from public.categorias where nombre = 'Útiles de oficina'),   40, 10, false, null),
  ('PA-HB-A4',  'Hojas bond A4 75g',       (select id from public.categorias where nombre = 'Papelería'),          120, 20, false, null),
  ('PA-HB-A3',  'Hojas bond A3 75g',       (select id from public.categorias where nombre = 'Papelería'),           30,  5, false, null),
  ('PA-CUAD',   'Cuaderno A4 cuadriculado',(select id from public.categorias where nombre = 'Papelería'),           90, 15, false, null),
  ('PA-FOLD',   'Folder manila A4',        (select id from public.categorias where nombre = 'Papelería'),           25,  5, false, null),
  ('LI-DET',    'Detergente multiusos',    (select id from public.categorias where nombre = 'Limpieza'),            50, 10, false, null),
  ('LI-LEJ',    'Lejía 5L',                (select id from public.categorias where nombre = 'Limpieza'),            20,  5, false, null),
  ('LI-PAP',    'Papel higiénico jumbo',   (select id from public.categorias where nombre = 'Limpieza'),           300, 40, false, null),
  ('PE-ALC',    'Alcohol gel 500ml',       (select id from public.categorias where nombre = 'Perecibles'),          80, 20, true,  '2026-08-10'),
  ('PE-CAFE',   'Café molido 250g',        (select id from public.categorias where nombre = 'Perecibles'),          40, 10, true,  '2026-07-25'),
  ('PE-AZUC',   'Azúcar rubia 1kg',        (select id from public.categorias where nombre = 'Perecibles'),          35, 10, true,  '2027-03-01'),
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
-- ~13 movimientos ficticios (entradas y salidas) sobre productos y áreas ya
-- sembrados. Se insertan DIRECTAMENTE (no vía la RPC registrar_movimiento):
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
begin
  -- Idempotencia: si ya existe historial, no re-sembrar.
  if exists (select 1 from public.movimientos) then
    return;
  end if;

  -- Inserta los movimientos resolviendo producto por SKU y área por nombre.
  -- Las entradas van sin área (area_nombre null → area_id null, exigido por el
  -- check movimientos_entrada_area); las salidas siempre llevan área.
  insert into public.movimientos (tipo, producto_id, cantidad, area_id, usuario_id, motivo, fecha)
  select v.tipo,
         p.id,
         v.cantidad,
         a.id,
         v_super,
         v.motivo,
         now() - make_interval(days => v.dias)
    from (values
      -- Lapicero azul (net +100)
      ('entrada', 'OF-LAP-AZ', 150, null,               'Compra a proveedor',       30),
      ('salida',  'OF-LAP-AZ',  30, 'Logística',         'Entrega mensual',          20),
      ('salida',  'OF-LAP-AZ',  20, 'Contabilidad',      'Reposición de escritorio', 10),
      -- Hojas bond A4 (net +120)
      ('entrada', 'PA-HB-A4',  200, null,                'Compra a proveedor',       28),
      ('salida',  'PA-HB-A4',   50, 'Mesa de Partes',    'Atención al público',      15),
      ('salida',  'PA-HB-A4',   30, 'Gerencia',          'Documentación interna',     5),
      -- Detergente multiusos (net +50)
      ('entrada', 'LI-DET',     60, null,                'Compra a proveedor',       25),
      ('salida',  'LI-DET',     10, 'Recursos Humanos',  'Limpieza de oficina',       8),
      -- Alcohol gel (net +50)
      ('entrada', 'PE-ALC',     80, null,                'Compra a proveedor',       22),
      ('salida',  'PE-ALC',     20, 'Tesorería',         'Dispensadores',            12),
      ('salida',  'PE-ALC',     10, 'Logística',         'Dispensadores',             4),
      -- Memoria USB (net +25)
      ('entrada', 'EQ-USB',     30, null,                'Compra a proveedor',       18),
      ('salida',  'EQ-USB',      5, 'Contabilidad',      'Respaldo de información',    3)
    ) as v(tipo, sku, cantidad, area_nombre, motivo, dias)
    join public.productos p on p.sku = v.sku
    left join public.areas a on a.nombre = v.area_nombre;

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
