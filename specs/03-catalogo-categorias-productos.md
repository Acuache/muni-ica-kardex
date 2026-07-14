# SPEC 03 — Catálogo: categorías y productos

> **Estado:** Implementado
> **Depende de:** SPEC 02
> **Fecha:** 2026-07-14
> **Objetivo:** Gestionar (CRUD) categorías y productos categorizados —incluyendo perecibles con fecha de caducidad, SKU único manual, stock inicial, stock mínimo e imagen opcional optimizada en el navegador y subida a Supabase Storage— desde el shell admin, usando `react-hook-form` + `zod`.
>
> **Cambios posteriores a la aprobación:** (1) se **eliminó** el campo `unidad` del producto (columna, formulario, tabla, esquema y seed) — migración `0011_productos_drop_unidad.sql`; (2) la lista de productos incorpora un **filtro/orden en cliente** (búsqueda por nombre/SKU, filtro por categoría y orden por nombre, más/menos stock y caducidad próxima).

---

## Alcance

**In:**

- **Tabla `categorias`** (`id`, `nombre` único, `descripcion` null, `created_at`) con RLS.
- **Tabla `productos`** (`id`, `sku` único, `nombre`, `categoria_id` **obligatoria**, `stock_actual` con valor inicial capturado al crear, `stock_minimo`, `es_perecible`, `fecha_caducidad`, `imagen_path`, `created_at`) con RLS.
- **RLS de ambas tablas:** cualquier usuario autenticado **lee** el catálogo; **solo admin y superadmin escriben** (insert/update/delete), reusando el helper `is_admin()` del Spec 02.
- **Restricción de borrado de categoría:** no se puede eliminar una categoría que tenga productos asociados (FK `on delete restrict`); el intento se rechaza en base y se muestra un mensaje claro en la UI.
- **Página de Categorías** (`/admin/categorias`): tabla de listado + alta/edición en **diálogo (modal)** + borrado con confirmación.
- **Página de Productos** (`/admin/productos`): tabla de listado + alta/edición en **diálogo (modal)** + borrado con confirmación. El formulario incluye SKU manual, nombre, `categoria_id` (select), stock inicial, stock mínimo, checkbox `es_perecible` que **habilita** el campo `fecha_caducidad` (**opcional**). La lista tiene un **filtro/orden en cliente** (búsqueda por nombre/SKU, filtro por categoría, orden por nombre / más stock / menos stock / caducidad próxima).
- **Primera integración de formularios:** `react-hook-form` + `zod` + `@hookform/resolvers`, con esquemas zod compartidos entre cliente y Server Actions.
- **Imagen de producto (opcional):** columna `imagen_path` (null) en `productos`; el formulario permite **subir, reemplazar o quitar** una imagen. Un producto sin imagen se guarda con normalidad.
- **Optimización en el navegador antes de subir:** con `browser-image-compression` la imagen se convierte a **WebP**, se redimensiona a **≤1024px** (lado mayor) y se apunta a **≤~300KB**, mostrando una **vista previa**. El archivo pesado **nunca** viaja por la red: sube ya liviano.
- **Supabase Storage:** bucket **público** `productos` — lectura abierta (para mostrar la imagen en las tablas/catálogo) y escritura (subir/borrar) **restringida a admin/superadmin** por **RLS de Storage** vía `is_admin()`. La imagen optimizada se sube desde el cliente y su `path` se guarda en `productos.imagen_path`; la URL pública se deriva con `getPublicUrl`.
- **Server Actions** de CRUD para categorías y productos (validación con zod + guard `is_admin()` en servidor + `revalidatePath`).
- **Seed del catálogo:** ~5 categorías y ~15 productos ficticios (al menos uno perecible) en `supabase/seed.sql`.
- **Navegación:** dos enlaces sueltos en el sidebar del shell admin — **Categorías** y **Productos**.
- **Componentes shadcn** necesarios para el CRUD: `form`, `dialog`, `select`, `checkbox`, `table`, `textarea`, `alert-dialog` (los de Spec 01 —`input`, `label`, `card`, `button`— ya existen).

**Fuera de alcance (para specs futuros):**

- **Mover stock:** `stock_actual` arranca con el valor capturado al crear el producto y **no se opera** aquí; las entradas/salidas que lo mutan son del **Spec 05**. El saldo inicial se documentará como "entrada inicial" cuando exista la tabla `movimientos`.
- **Lotes múltiples por producto** (varias fechas de caducidad distintas): a futuro; aquí un producto perecible tiene **una** sola `fecha_caducidad`.
- **Imágenes para categorías** y **galería/múltiples imágenes** por producto: a futuro; aquí solo productos, con **una** imagen opcional.
- **Recorte/edición avanzada** de la imagen (crop, rotar, filtros): solo se comprime/redimensiona automáticamente.
- La tabla `areas` y la asignación de área → **Spec 04**.
- El dashboard real (productos más/menos pedidos, próximos a caducar, stock bajo) → **Spec 07**; aquí solo se capturan los campos que ese dashboard consumirá (`stock_minimo`, `fecha_caducidad`).
- Historial/movimientos y la vista de usuario → **Specs 05 y 08**.

---

## Modelo de datos

Este spec introduce **dos tablas nuevas** (`categorias`, `productos`) con su RLS. Viven en Postgres de Supabase y se definen por migración SQL en `supabase/migrations/`. Reusan el helper `is_admin()` creado en el Spec 02.

### Tabla `categorias`

```sql
create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  created_at  timestamptz not null default now()
);
```

### Tabla `productos`

```sql
create table public.productos (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,                 -- código manual, único
  nombre          text not null,
  categoria_id    uuid not null
                    references public.categorias(id) on delete restrict,  -- categoría obligatoria; no se borra una categoría con productos
  stock_actual    int not null default 0 check (stock_actual >= 0),   -- valor inicial capturado al crear; lo opera el Spec 05
  stock_minimo    int not null default 0 check (stock_minimo >= 0),   -- umbral para la alerta de stock bajo (Spec 07)
  es_perecible    boolean not null default false,
  fecha_caducidad date,
  imagen_path     text,                                 -- ruta del objeto en el bucket público 'productos'; null si no tiene imagen
  created_at      timestamptz not null default now(),
  -- la fecha de caducidad es OPCIONAL; solo puede fijarse en productos perecibles
  constraint productos_perecible_fecha check (
    es_perecible = true or fecha_caducidad is null
  )
);
```

- **`sku`** único y obligatorio: lo escribe el admin (código propio del almacén). La unicidad se garantiza en base (`unique`) y se valida en el formulario (zod).
- **`categoria_id`** `not null` con `on delete restrict`: un producto siempre pertenece a una categoría; una categoría con productos **no** se puede eliminar.
- **`stock_actual`** captura el stock inicial al crear el producto (decisión del usuario); a partir del Spec 05 solo cambia por movimientos. El `check (>= 0)` evita valores negativos.
- **`fecha_caducidad`** **opcional** (nullable): un perecible puede guardarse con o sin fecha; solo se **impide** que un producto **no** perecible (`es_perecible = false`) lleve fecha (garantizado por el `check` `productos_perecible_fecha`).
- **`imagen_path`** nullable: guarda la **ruta del objeto** en el bucket público `productos` (no la URL completa); la URL pública se deriva con `getPublicUrl`. `null` = producto sin imagen.

### RLS de `categorias` y `productos`

```sql
alter table public.categorias enable row level security;
alter table public.productos  enable row level security;

-- LECTURA: cualquier usuario autenticado ve el catálogo.
create policy "categorias_select" on public.categorias for select
  to authenticated using ( true );
create policy "productos_select" on public.productos for select
  to authenticated using ( true );

-- ESCRITURA (insert/update/delete): solo admin y superadmin, vía is_admin() del Spec 02.
create policy "categorias_write" on public.categorias for all
  to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "productos_write" on public.productos for all
  to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
```

### Supabase Storage — bucket `productos`

Bucket **público** para las imágenes optimizadas. La lectura es abierta (para mostrar la imagen); la escritura (subir/borrar) queda restringida a admin/superadmin por RLS sobre `storage.objects`, reusando `is_admin()`.

```sql
-- crea el bucket público (o vía panel de Supabase Storage)
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- LECTURA pública del bucket (cualquiera puede ver la imagen)
create policy "productos_bucket_read" on storage.objects for select
  using ( bucket_id = 'productos' );

-- ESCRITURA (insert/update/delete) solo admin/superadmin
create policy "productos_bucket_write" on storage.objects for all
  to authenticated
  using ( bucket_id = 'productos' and (select public.is_admin()) )
  with check ( bucket_id = 'productos' and (select public.is_admin()) );
```

- La imagen se sube desde el cliente (ya comprimida a WebP) con un nombre de objeto único (ej. `productos/{uuid}.webp`); ese `path` se guarda en `productos.imagen_path`.
- Al **reemplazar** o **quitar** la imagen, la Server Action borra el objeto anterior para no dejar huérfanos.
- El **seed** deja `imagen_path` en `null` (no se siembran binarios en Storage).

### Esquemas zod (cliente + servidor)

Definidos en `lib/catalogo/schemas.ts`, compartidos por el formulario (`react-hook-form`) y las Server Actions.

```ts
// forma tentativa; se ajusta al implementar
// límites de optimización de imagen (browser-image-compression)
export const IMAGEN = { maxWidthOrHeight: 1024, maxSizeMB: 0.3, fileType: 'image/webp' } as const

export const categoriaSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
})

export const productoSchema = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(1),
  categoria_id: z.string().uuid(),
  stock_actual: z.number().int().min(0),
  stock_minimo: z.number().int().min(0),
  es_perecible: z.boolean(),
  fecha_caducidad: z.string().date().optional(),
  imagen_path: z.string().optional(),   // ruta en Storage; la File y su compresión se manejan aparte en el cliente
}).refine(v => v.es_perecible || !v.fecha_caducidad, {
  message: 'Solo un producto perecible puede llevar fecha de caducidad',
  path: ['fecha_caducidad'],
})
```

---

## Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir código de Supabase (RLS, políticas, **Storage**), Next 16 (Server Actions, `revalidatePath`), `react-hook-form`/`zod`, **`browser-image-compression`** y shadcn.

1. **Dependencias + componentes shadcn.** Instalar `react-hook-form`, `zod`, `@hookform/resolvers` y `browser-image-compression`; añadir vía shadcn los componentes `form`, `dialog`, `select`, `checkbox`, `table`, `textarea`, `alert-dialog`. *Test:* `npm run build` compila; los componentes aparecen en `components/ui/`.

2. **Migración `categorias` + `productos`.** Crear `supabase/migrations/NN_catalogo.sql` con ambas tablas, `unique`, `check` de perecible/fecha, la columna `imagen_path` y la FK `on delete restrict`. *Test:* aplicar la migración; insertar una categoría y un producto válidos funciona; un producto **no** perecible con `fecha_caducidad` falla; borrar una categoría con productos falla.

3. **RLS del catálogo.** Añadir `enable row level security` y las políticas `*_select` (authenticated) y `*_write` (`is_admin()`) para ambas tablas. *Test:* con sesión de usuario normal, `select` lee el catálogo pero un `insert` es rechazado; con admin, el `insert` funciona.

4. **Bucket + RLS de Storage.** Crear el bucket público `productos` y las políticas sobre `storage.objects`: lectura pública y escritura (insert/update/delete) solo `is_admin()`. *Test:* un admin sube un objeto de prueba al bucket y se lee por URL pública; un usuario normal no puede subir ni borrar.

5. **Seed del catálogo.** Añadir a `supabase/seed.sql` ~5 categorías y ~15 productos ficticios (al menos uno perecible con fecha), con `imagen_path` en `null`. *Test:* tras correr el seed existen ~5 categorías y ~15 productos, ≥1 con `es_perecible=true`.

6. **Esquemas zod + constantes.** Crear `lib/catalogo/constants.ts` (`IMAGEN`) y `lib/catalogo/schemas.ts` (`categoriaSchema`, `productoSchema`). *Test:* unit tests Vitest de los schemas (SKU vacío falla, no-perecible con fecha falla, perecible con o sin fecha pasa, caso válido pasa).

7. **Server Actions de categorías.** Crear `app/admin/categorias/actions.ts` (`crear`, `editar`, `eliminar`) con guard `is_admin()` en servidor, validación con `categoriaSchema` y `revalidatePath`. `eliminar` captura el error de FK `restrict` y devuelve un mensaje claro ("no se puede eliminar: tiene productos"). *Test:* crear/editar/eliminar una categoría vacía funciona; eliminar una con productos devuelve el mensaje.

8. **Página de Categorías.** Crear `app/admin/categorias/page.tsx` (server component que lista) + componentes cliente (tabla, `Dialog` con formulario rhf+zod, `AlertDialog` de confirmación de borrado). Añadir el enlace **Categorías** al sidebar del shell admin. *Test:* un admin ve la tabla, crea/edita/borra desde el modal; un usuario que entra a `/admin/categorias` es redirigido (guard de rol del Spec 02).

9. **Utilidad de imagen (cliente).** Crear `lib/catalogo/optimizar-imagen.ts`: valida mime/tamaño, comprime con `browser-image-compression` (WebP, `maxWidthOrHeight`, `maxSizeMB` de `IMAGEN`) y devuelve el `File` liviano + una URL de vista previa. *Test:* unit/manual — una imagen grande sale como WebP por debajo del umbral; un archivo que no es imagen es rechazado.

10. **Server Actions de productos.** Crear `app/admin/productos/actions.ts` (`crear`, `editar`, `eliminar`) con guard `is_admin()`, validación con `productoSchema` (incluida la regla perecible↔fecha) y `revalidatePath`; manejar el error de SKU duplicado con mensaje claro; al **editar** con nueva imagen o **quitar** imagen, borrar el objeto anterior en Storage; al **eliminar** el producto, borrar también su imagen. *Test:* crear un producto válido funciona; SKU duplicado devuelve mensaje; un **no** perecible con fecha es rechazado; reemplazar la imagen no deja huérfanos.

11. **Página de Productos.** Crear `app/admin/productos/page.tsx` (lista con nombre de categoría y miniatura si tiene imagen) + componentes cliente (tabla, `Dialog` con formulario rhf+zod: SKU, nombre, select de categoría, select de unidad, stock inicial, stock mínimo, checkbox `es_perecible` que muestra/oculta `fecha_caducidad` (**opcional**), **campo de imagen opcional** que comprime en el navegador, muestra vista previa y sube al bucket antes de guardar el path; `AlertDialog` de borrado). Añadir el enlace **Productos** al sidebar. *Test:* un admin crea un producto no perecible (sin campo de fecha) y uno perecible (con o sin fecha, ambos válidos); sube una imagen que se guarda optimizada y se ve la miniatura; la unidad solo ofrece valores de la lista.

12. **Verificación integral.** Revisar el flujo completo con `npm run lint` y `npm test`, y una pasada manual del CRUD de ambas entidades (incluida subida/reemplazo/quita de imagen). *Test:* todos los criterios de aceptación se cumplen.

---

## Criterios de aceptación

- [x] El admin (y el superadmin) crea, edita y elimina una **categoría** desde `/admin/categorias`.
- [x] Eliminar una categoría **con productos** es rechazado por la base (FK `restrict`) y la UI muestra un mensaje claro.
- [x] El admin crea un **producto** con SKU manual único, categoría (obligatoria), stock inicial y stock mínimo.
- [x] Un SKU **duplicado** es rechazado (unique en base + validación en el formulario) con mensaje claro.
- [x] `productos.categoria_id` es **obligatorio**: no se puede crear un producto sin categoría.
- [x] La lista de productos se puede **filtrar** por texto (nombre/SKU) y por categoría, y **ordenar** por nombre, más stock, menos stock y caducidad próxima.
- [x] `fecha_caducidad` es **opcional**: un perecible puede guardarse **con o sin** fecha; un producto **no** perecible **no** puede llevar fecha (garantizado por el `check` y por zod).
- [x] `stock_actual` (inicial) y `stock_minimo` se guardan con el valor capturado en el formulario.
- [x] El admin puede subir una **imagen opcional** al crear/editar un producto; un producto **sin** imagen se guarda con normalidad.
- [x] La imagen se **optimiza en el navegador** (WebP, ≤~1024px, ≤~300KB) **antes** de subirse.
- [x] La imagen se guarda en el bucket público `productos` de Storage y su `path` queda en `productos.imagen_path`; la imagen se ve en la tabla de productos.
- [x] Un usuario **no admin** no puede subir ni borrar objetos del bucket (RLS de Storage).
- [x] Reemplazar o quitar la imagen (o eliminar el producto) borra el objeto anterior en Storage (sin huérfanos).
- [x] Un usuario **no admin**, vía RLS, puede **leer** el catálogo pero **no** insertar/editar/eliminar categorías ni productos.
- [x] Un usuario que visita `/admin/categorias` o `/admin/productos` es redirigido (guard de rol del Spec 02).
- [x] El **seed** carga ~5 categorías y ~15 productos ficticios, con al menos uno perecible.
- [x] Los esquemas zod (`categoriaSchema`, `productoSchema`) tienen **tests unitarios** (Vitest) que cubren casos válidos e inválidos.
- [x] El sidebar del shell admin muestra los enlaces **Categorías** y **Productos**.

---

## Decisiones

- **Sí:** **SKU manual** con unicidad en base (`unique`) y en el formulario (zod). El almacén de la Muni usa códigos propios; se prefirió control sobre autogeneración.
- **No:** SKU autogenerado o autogenerado+editable. Añade lógica de correlativos sin necesidad real ahora.
- **Cambio posterior a la aprobación:** se **eliminó** el campo `unidad` del producto (columna `productos.unidad`, formulario, tabla, esquema zod y seed) a pedido del usuario — migración `0011_productos_drop_unidad.sql`. El catálogo ya no maneja unidad de medida.
- **Cambio posterior a la aprobación:** la lista de productos incorpora un **filtro/orden en cliente** (búsqueda por nombre/SKU, filtro por categoría, orden por nombre / más stock / menos stock / caducidad próxima).
- **Sí:** **stock inicial capturado al crear** el producto (`stock_actual` con valor de arranque). El usuario lo pidió explícitamente; se prioriza ver stock desde ya.
- **Nota (regla de oro):** el kardex idealmente registra todo cambio de stock como movimiento. El saldo inicial capturado aquí **no** queda como movimiento; se documentará como "entrada inicial" cuando el Spec 05 cree la tabla `movimientos`. A partir de ahí, `stock_actual` solo cambia por movimiento.
- **Sí:** **categoría obligatoria** en producto (`categoria_id not null`). Mantiene el catálogo ordenado y los reportes por categoría completos; obliga a crear al menos una categoría antes que productos.
- **Sí:** **borrado físico** (DELETE real) de categorías y productos, **pero** con **FK `on delete restrict`**: no se elimina una categoría que tenga productos. Se prefirió simplicidad sobre soft-delete.
- **Nota:** el borrado físico de **productos** deberá revisarse en el **Spec 05**, cuando existan `movimientos` que referencien productos (no se debe perder el historial); se decide en ese spec.
- **Sí:** **perecible con una sola fecha** (`fecha_caducidad`), **opcional**; el `check` solo **impide** que un producto **no** perecible lleve fecha (no obliga a capturarla en los perecibles). Simple y suficiente para el dashboard de "próximos a caducar".
- **No:** lotes múltiples con fechas distintas. Requiere otra tabla; el roadmap lo reserva a futuro.
- **Sí:** **`stock_minimo` capturado en el formulario** desde ya, aunque su alerta la consuma el Spec 07. Evita re-editar todos los productos después.
- **Sí:** **`react-hook-form` + `zod` + `@hookform/resolvers`** como stack de formularios, introducido en este spec (primer CRUD), con esquemas zod compartidos entre cliente y Server Actions.
- **Sí:** formularios de alta/edición en **diálogo (modal)** sobre la página de listado (una sola pantalla por entidad).
- **No:** páginas separadas `/nuevo` y `/[id]/editar`. Más navegación y archivos de los necesarios para un catálogo.
- **Sí:** **dos enlaces sueltos** en el sidebar (Categorías, Productos), sin grupo "Catálogo".
- **Sí:** **RLS de lectura para cualquier autenticado** y escritura solo `is_admin()`. El catálogo lo necesitarán vistas posteriores (movimientos, historial); la escritura queda restringida a admin/superadmin, como el resto del sistema.
- **Sí:** **imagen de producto opcional**, optimizada **en el cliente** con `browser-image-compression` (WebP, ≤1024px, ≤~300KB) antes de subir. Es lo más fiel a "que pese menos antes de subir"; el archivo pesado nunca viaja por la red.
- **No:** optimizar en el servidor con `sharp` ni "ambos". Evita subir el original y una dependencia server extra; para miniaturas de catálogo la compresión de cliente basta.
- **Sí:** **bucket público** `productos` (lectura abierta) con **escritura solo admin** vía RLS de Storage. Simple para mostrar en el catálogo; las imágenes no son sensibles.
- **No:** bucket privado con URLs firmadas. Complejidad innecesaria (firmar y refrescar URLs en cada listado) para imágenes públicas de catálogo.
- **Sí:** guardar el **`path`** del objeto en `imagen_path` y derivar la URL pública con `getPublicUrl`. Es estable si cambia el dominio del proyecto.
- **Sí:** **una sola imagen** por producto y **solo para productos**. Galería, múltiples imágenes e imágenes de categorías quedan a futuro.
- **Sí:** el **seed** deja `imagen_path` en `null` (no se siembran binarios en Storage); las imágenes se cargan desde la UI.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- || El error de FK `restrict` al borrar una categoría con productos llega crudo al usuario. | La Server Action `eliminar` captura el error de la base y devuelve un mensaje claro ("no se puede eliminar: tiene productos"). |
| El error de SKU duplicado (`unique`) llega crudo o no se muestra. | Validación en zod + captura del error `unique` en la Server Action con mensaje inline en el formulario. |
| Un producto **no** perecible se guarda con fecha de caducidad esquivando la UI. | Doble barrera: `check` `productos_perecible_fecha` en base + `refine` en `productoSchema`; ambos rechazan una fecha en un no-perecible (para perecibles la fecha es opcional). |
| Un usuario no admin intenta escribir en el catálogo saltándose la UI. | RLS `*_write` con `is_admin()` (del Spec 02) en insert/update/delete; el guard de rol del layout admin (Spec 02) además bloquea el acceso a las páginas. |
| Confusión sobre el stock inicial vs. la regla de oro del kardex. | Documentado en Decisiones: el saldo inicial se registrará como "entrada inicial" en el Spec 05; desde entonces `stock_actual` solo cambia por movimiento. |
| **Imagen huérfana** en Storage: el producto no se guarda tras subir la imagen, o se reemplaza/quita sin borrar el objeto anterior. | La Server Action borra el objeto anterior al reemplazar/quitar y al eliminar el producto; si el insert falla tras subir, limpia el objeto recién subido. |
| `browser-image-compression` falla o el navegador no soporta WebP. | La imagen es **opcional**: si la compresión falla se muestra un mensaje y no se sube; se valida mime/tamaño antes de comprimir. |
| Un usuario no admin sube o borra archivos en el bucket saltándose la UI. | RLS de Storage sobre `storage.objects` (insert/update/delete) restringida a `is_admin()`; lectura pública pero escritura solo admin. |
| Se sube un archivo que no es imagen o desmesuradamente grande. | Validación de mime y tamaño en el cliente **antes** de comprimir; la compresión fuerza WebP y el umbral de `IMAGEN`; se puede fijar un límite de tamaño en el bucket. |

---

## Lo que **no** entra en este spec

- Mover el stock: entradas/salidas y la mutación de `stock_actual` (→ Spec 05).
- Lotes múltiples por producto con fechas de caducidad distintas (a futuro).
- Imágenes para categorías, galería/múltiples imágenes por producto y edición avanzada (crop/rotar) — aquí solo una imagen opcional por producto, comprimida automáticamente.
- La tabla `areas` y la asignación de área a usuarios (→ Spec 04).
- El dashboard real (más/menos pedidos, próximos a caducar, stock bajo) (→ Spec 07).
- Historial/movimientos y la vista de usuario (→ Specs 05 y 08).

Cada uno, cuando llegue, va en su propio spec.
