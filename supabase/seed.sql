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
