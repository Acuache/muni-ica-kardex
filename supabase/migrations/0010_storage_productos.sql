-- SPEC 03 · Paso 4 — Bucket público `productos` + RLS de storage.objects.
--
-- Las imágenes de producto (ya optimizadas a WebP en el cliente) viven en un
-- bucket PÚBLICO: la lectura es abierta (para mostrarlas en el catálogo) y la
-- escritura (subir/borrar) queda restringida a admin/superadmin reutilizando
-- is_admin() del Spec 02. storage.objects ya trae RLS habilitada; aquí solo se
-- crean las políticas.

-- Bucket público (idempotente).
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- LECTURA pública de los objetos del bucket.
create policy "productos_bucket_read" on storage.objects for select
  using ( bucket_id = 'productos' );

-- ESCRITURA (insert/update/delete): solo admin/superadmin.
create policy "productos_bucket_write" on storage.objects for all
  to authenticated
  using ( bucket_id = 'productos' and (select public.is_admin()) )
  with check ( bucket_id = 'productos' and (select public.is_admin()) );
