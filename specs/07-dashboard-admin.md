# SPEC 07 — Dashboard del admin

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 05
> **Fecha:** 2026-07-16
> **Objetivo:** Mostrar al admin un tablero con los productos más y menos pedidos en un rango de tiempo seleccionable, los productos próximos a caducar y los de stock bajo, calculados con funciones agregadas sobre el kardex.

---

## 1. Por qué existe este spec

Hasta aquí el sistema **captura** el almacén: el catálogo (Spec 03), el kardex y el stock (Spec 05), el vale (Spec 06/06.1). Pero nadie **lee** ese kardex de un vistazo. Un jefe de almacén no quiere recorrer la tabla de movimientos fila por fila para saber qué producto se le está acabando, cuál nadie pide y cuál está por vencerse: quiere abrir una pantalla y verlo.

Este spec **no genera datos nuevos**: agrega los que ya existen. Cada movimiento de salida del Spec 05 ya dice qué producto salió, cuánto y cuándo; cada producto del Spec 03 ya trae su `stock_actual`, su `stock_minimo` y —si es perecible— su `fecha_caducidad`. El dashboard es una **lectura de solo lectura** sobre eso: rankings por suma de salidas en un rango, y dos listas de estado actual (caducidad y stock).

La única pieza de infraestructura que suma es **dónde** se calcula el agregado. Sumar salidas por producto no se hace trayendo todas las filas al server de Next y agrupando en JS: se hace en Postgres, con **funciones RPC `security invoker`** que respetan la misma RLS `is_admin()` del Spec 05 y devuelven ya masticados los rankings. El servidor de Next solo pinta. Las dos listas de estado (caducidad, stock bajo) son `select` directos sobre `productos`, que ya es legible por admin (RLS del Spec 03): no necesitan función.

---

## 2. Alcance

**In:**

- **Página `/admin/dashboard`** (reemplaza el placeholder actual, ya enlazado en el sidebar): Server Component que lee el rango de `searchParams`, llama a las RPC + los `select` de estado, y arma el tablero. **No** se añade enlace al sidebar (ya existe desde el Spec 02).
- **Selector de rango 7 / 30 / 90 días** (default **30**) que gobierna **solo los rankings y su KPI**. Se implementa vía `searchParams.dias` (patrón del kardex del Spec 05, `?producto=`): cambiar el rango recarga el Server Component. Las listas de caducidad y stock bajo son **estado actual** y **no** dependen del rango.
- **Migración `0019_dashboard_rpc.sql`** con dos funciones agregadas `security invoker`:
  - **`dashboard_pedidos(p_dias int)`** — una fila por producto **activo** con **≥1 salida** en los últimos `p_dias` días: `producto_id`, `sku`, `nombre`, `categoria_nombre`, `total_unidades` (suma de `cantidad` de salidas), ordenada por `total_unidades desc`. De aquí salen **ambos** rankings: los primeros 10 = **más pedidos**, los últimos 10 (misma consulta, invertida) = **menos pedidos**.
  - **`dashboard_sin_movimiento(p_dias int)`** — productos **activos** con **0 salidas** en el rango: `producto_id`, `sku`, `nombre`, `categoria_nombre`, `stock_actual`, ordenados por nombre. Alimenta la lista **"Sin movimiento"**.
- **Cuatro tarjetas KPI** arriba: **Salidas del rango** (suma de `total_unidades`, cambia con el selector), **Próximos a caducar** (conteo), **Stock bajo** (conteo) y **Productos activos** (conteo de `productos` no eliminados; estático).
- **Ranking "Más pedidos" (Top 10)** como lista ordenada **y** un **gráfico de barras** (shadcn `chart` / Recharts) con esos mismos 10; la métrica es **suma de unidades**.
- **Ranking "Menos pedidos" (Top 10)** como lista ordenada ascendente, **solo entre productos con ≥1 salida** en el rango. Los de **0 salidas** no entran aquí: van en la lista **"Sin movimiento"** aparte.
- **Lista "Próximos a caducar"**: perecibles no eliminados con `fecha_caducidad` **≤ hoy + 30 días**, lo que **incluye los ya vencidos**; ordenados por `fecha_caducidad asc`; los vencidos (`fecha_caducidad < hoy`) se **resaltan** con un badge "Vencido".
- **Lista "Stock bajo"**: productos no eliminados con `stock_actual ≤ stock_minimo`, ordenados con los **agotados** (`stock_actual = 0`) primero; los agotados se **resaltan** con un badge "Agotado".
- **Cada producto** de cualquier ranking o lista **enlaza a su kardex**: `/admin/movimientos?producto=<id>` (reusa el filtro del Spec 05).
- **Estados vacíos** por sección: si un rango no tiene salidas, si no hay perecibles en el umbral o si nada está bajo mínimo, la sección muestra un mensaje ("Sin datos en este rango" / "Nada por caducar" / "Todo el stock está sobre el mínimo") en vez de una lista vacía.
- **Helpers puros en `lib/dashboard/`** (testeables con Vitest, que no prueba Server Components `async`): `menosPedidos(filas, n)` (invierte y corta), `totalSalidas(filas)` (suma el KPI), `estaVencido(fecha, hoy)` y `diasRango(dias)` / validación del `searchParam`. Tipos en `lib/dashboard/types.ts`; constantes (`RANGOS = [7, 30, 90]`, `RANGO_DEFAULT = 30`, `UMBRAL_CADUCIDAD_DIAS = 30`, `TOP_N = 10`) en `lib/dashboard/constants.ts`.
- **Componentes cliente**: `rango-selector.tsx` (control segmentado que navega cambiando `?dias=`) y `pedidos-chart.tsx` (gráfico de barras shadcn). El resto del tablero (tarjetas, listas) se renderiza en servidor.
- **Componentes shadcn** que falten: `chart` (con su dependencia `recharts`), y `card` / `badge` si aún no están en el proyecto.
- **Ajuste del seed** (`supabase/seed.sql`): fechas de caducidad de algunos perecibles dentro del umbral y **al menos uno ya vencido**; `stock_minimo` y `stock_actual` de algunos productos de modo que **al menos uno quede agotado y otro bajo mínimo**; y suficientes salidas variadas para que el ranking tenga **más de 10** productos con salidas y quede **al menos uno "sin movimiento"**.
- **Tests Vitest**: los helpers puros (`menosPedidos` invierte y corta a N; `totalSalidas` suma; `estaVencido` en el borde de hoy; `diasRango` rechaza valores fuera de 7/30/90 y cae al default) y un render de `pedidos-chart` con datos de ejemplo.

**Fuera de alcance (para specs futuros):**

- **Vista del usuario** (su historial en solo lectura) → **Spec 08**.
- **Exportar** el dashboard (PDF, Excel, CSV) o **imprimirlo**.
- **Filtros avanzados / BI**: por área, por categoría, por usuario que registró, comparativas entre periodos, rango de fechas arbitrario (calendario). El único filtro es el selector 7/30/90.
- **Métricas de entradas** (productos más reabastecidos, proveedores) y **métricas por usuario**. El ranking es **solo de salidas** ("pedidos").
- **Rankings por número de salidas (frecuencia)**: la métrica es **suma de unidades**, no cuántas veces salió.
- **Alertas activas** (correo, notificación push) cuando algo cae bajo mínimo o está por caducar. El dashboard **muestra**, no **notifica**.
- **Umbrales configurables** desde la UI (rango de caducidad, definición de "stock bajo"). Van fijos en `constants.ts`.
- **Auto-refresco / realtime**: el tablero se recalcula al cargar o al cambiar el rango, no en vivo.
- **Gráficos de series de tiempo** (salidas por día/semana). Solo un gráfico de barras del top de pedidos.
- **Persistir** el rango elegido entre sesiones (queda en la URL, no en el perfil).

---

## 3. Modelo de datos

Este spec **no crea tablas ni columnas**. Añade **una migración** con **dos funciones** de agregación de solo lectura. Reusa `movimientos`, `productos` y `categorias` (Specs 03/05) y la RLS `is_admin()` que ya restringe la lectura de `movimientos`.

Las dos listas de estado (**caducidad** y **stock bajo**) **no** llevan función: son `select` directos sobre `productos` en el Server Component, porque `productos` ya es legible por admin (RLS del Spec 03) y no requieren agregación ni el rango.

### Migración `0019_dashboard_rpc.sql`

```sql
-- Ranking de pedidos: una fila por producto ACTIVO con >=1 salida en los
-- últimos p_dias días, con la suma de unidades salidas. De aquí salen los DOS
-- rankings (más pedidos = primeras filas; menos pedidos = últimas). security
-- invoker: la RLS de movimientos (is_admin, Spec 05) filtra el scan, así que un
-- no-admin recibe cero filas.
create function public.dashboard_pedidos(p_dias int)
returns table (
  producto_id      uuid,
  sku              text,
  nombre           text,
  categoria_nombre text,
  total_unidades   bigint
)
language sql
security invoker
set search_path = public
as $$
  select p.id, p.sku, p.nombre, c.nombre as categoria_nombre,
         sum(m.cantidad)::bigint as total_unidades
    from public.movimientos m
    join public.productos  p on p.id = m.producto_id
    left join public.categorias c on c.id = p.categoria_id
   where m.tipo = 'salida'
     and p.eliminado = false
     and m.fecha >= now() - make_interval(days => p_dias)
   group by p.id, p.sku, p.nombre, c.nombre
   order by total_unidades desc, p.nombre;
$$;

-- Productos activos SIN ninguna salida en el rango: la lista "Sin movimiento".
create function public.dashboard_sin_movimiento(p_dias int)
returns table (
  producto_id      uuid,
  sku              text,
  nombre           text,
  categoria_nombre text,
  stock_actual     int
)
language sql
security invoker
set search_path = public
as $$
  select p.id, p.sku, p.nombre, c.nombre as categoria_nombre, p.stock_actual
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
   where p.eliminado = false
     and not exists (
       select 1 from public.movimientos m
        where m.producto_id = p.id
          and m.tipo = 'salida'
          and m.fecha >= now() - make_interval(days => p_dias)
     )
   order by p.nombre;
$$;
```

- **`security invoker`**, igual que `registrar_movimiento` (Spec 05): la RLS aplica con la sesión del admin. Un `usuario` que llame la RPC ve cero movimientos (RLS) y obtiene ranking vacío; además el guard de ruta del layout admin ya lo redirige antes.
- **La categoría se deriva** con `left join categorias` (como el vale del Spec 06.1): `null` si el producto no tuviera categoría (no debería, es obligatoria). No se guarda nada nuevo.
- **`p_dias`** es el único parámetro; el corte de fecha se calcula en SQL (`now() - make_interval(days => p_dias)`), no en el cliente. Los valores válidos (7/30/90) los fija el servidor de Next; la función acepta cualquier entero pero solo se la llama con esos tres.
- **Sin índice nuevo:** ya existen `movimientos_fecha_idx` (Spec 05) y `movimientos_producto_idx`; el volumen de un almacén municipal no justifica una vista materializada.

### Consultas de estado (en el Server Component, sin RPC)

```ts
// Próximos a caducar (incluye vencidos): perecibles con fecha dentro del umbral.
// supabase.from('productos').select('id, sku, nombre, stock_actual, fecha_caducidad, categorias(nombre)')
//   .eq('eliminado', false).eq('es_perecible', true).not('fecha_caducidad','is',null)
//   .lte('fecha_caducidad', <hoy + 30 días>).order('fecha_caducidad', { ascending: true })

// Stock bajo (agotados incluidos): usa un filtro columna-vs-columna, que PostgREST
// no expresa directo. Se resuelve con una función booleana o un filtro `or`; se
// decide al implementar (posible pequeña RPC `dashboard_stock_bajo()` si el
// `select` no alcanza). Orden: agotados (stock_actual = 0) primero.
```

- **Ojo (comportamiento de PostgREST):** `stock_actual <= stock_minimo` compara **dos columnas**, y el builder de `supabase-js` filtra columna-vs-valor. Si no se puede expresar limpio, la lista de stock bajo se sirve con una **tercera función** trivial `dashboard_stock_bajo()` (mismo patrón `security invoker`, sin parámetros). Es un detalle de implementación, no una decisión de diseño; se resuelve consultando **context7** en `/spec-impl`.

### Tipos — `lib/dashboard/types.ts`

```ts
// forma tentativa; se ajusta al implementar
export type FilaPedido = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  total_unidades: number
}

export type FilaSinMovimiento = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  stock_actual: number
}

export type FilaCaducidad = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  fecha_caducidad: string // ISO date
  vencido: boolean        // derivado: fecha_caducidad < hoy
}

export type FilaStockBajo = {
  producto_id: string
  sku: string
  nombre: string
  categoria_nombre: string | null
  stock_actual: number
  stock_minimo: number
  agotado: boolean        // derivado: stock_actual === 0
}
```

---

## 4. Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir código de Supabase (funciones/RPC, `make_interval`, filtros de `supabase-js`), Next 16 (`searchParams`, Server Components), shadcn (`chart`) y `recharts`.

1. **Migración `0019_dashboard_rpc.sql`.** Crear las funciones `dashboard_pedidos(p_dias int)` y `dashboard_sin_movimiento(p_dias int)` de §3. *Test:* aplicar; como admin, `select * from dashboard_pedidos(30)` devuelve productos con sus unidades salidas ordenados desc; `dashboard_sin_movimiento(30)` devuelve los productos activos sin salidas en 30 días; un producto eliminado no aparece en ninguna; sin sesión admin (RLS) el ranking sale vacío.

2. **Constantes, tipos y helpers puros + tests.** Crear `lib/dashboard/constants.ts` (`RANGOS`, `RANGO_DEFAULT`, `UMBRAL_CADUCIDAD_DIAS`, `TOP_N`), `lib/dashboard/types.ts` y `lib/dashboard/dashboard.ts` con `menosPedidos`, `totalSalidas`, `estaVencido`, `diasRango`. *Test:* `dashboard.test.ts` — `menosPedidos` invierte y corta a N y nunca repite si hay <2N filas; `totalSalidas` suma; `estaVencido` es true para ayer y false para hoy; `diasRango('45')` cae a `RANGO_DEFAULT` y `diasRango('7')` da 7.

3. **Componentes shadcn faltantes.** Añadir `chart` (arrastra `recharts`), y `card` / `badge` si no están. *Test:* `npm run build` compila; los componentes existen bajo `components/ui/`.

4. **Selector de rango.** Crear `app/admin/dashboard/rango-selector.tsx` (Client Component): control segmentado 7/30/90 que navega a `?dias=<n>` conservando la ruta y marca el activo (patrón de `admin-nav.tsx`). *Test:* cambiar de rango actualiza la URL y vuelve a renderizar la página; el segmento activo se resalta.

5. **Página del dashboard — KPIs + rankings.** Reescribir `app/admin/dashboard/page.tsx`: leer `searchParams.dias` (validado con `diasRango`), llamar `dashboard_pedidos` y `dashboard_sin_movimiento`, calcular las 4 tarjetas KPI, y renderizar el **Top 10 más pedidos** (lista) y el **Top 10 menos pedidos** (con `menosPedidos`) y **Sin movimiento**; cada producto enlaza a `/admin/movimientos?producto=<id>`. *Test:* con datos del seed, el más pedido es el de mayor suma de salidas del rango; el menos pedido, el de menor suma **con ≥1 salida**; los de 0 salidas aparecen en "Sin movimiento"; cambiar el rango cambia los números.

6. **Gráfico de más pedidos.** Crear `app/admin/dashboard/pedidos-chart.tsx` (Client Component, shadcn `chart`): barras del Top 10 más pedidos por `total_unidades`. Integrarlo en la página. *Test:* el gráfico dibuja una barra por producto del top con su unidad; un render de Vitest con datos de ejemplo no lanza.

7. **Listas de caducidad y stock bajo.** En `page.tsx`: `select` de perecibles `fecha_caducidad ≤ hoy+30` (incluye vencidos, marca `vencido`) ordenados asc; lista de stock bajo `stock_actual ≤ stock_minimo` (vía el filtro o `dashboard_stock_bajo()` según §3), agotados primero con badge "Agotado" y vencidos con badge "Vencido". Cada fila enlaza al kardex. *Test:* un perecible que caduca en <30 días aparece; uno vencido aparece resaltado; un producto en o bajo su mínimo aparece; uno agotado se marca "Agotado".

8. **Estados vacíos.** Cada sección (rankings, sin movimiento, caducidad, stock bajo, KPIs) muestra su mensaje cuando no hay filas, en vez de una lista o gráfico vacío. *Test:* con `?dias=7` sobre un producto sin salidas recientes, el ranking muestra "Sin datos en este rango"; si nada está por caducar, la sección lo dice.

9. **Ajuste del seed.** En `supabase/seed.sql`: fijar fechas de caducidad de algunos perecibles dentro del umbral (**y al menos uno vencido**), `stock_minimo`/`stock_actual` para **un agotado y un bajo mínimo**, y salidas variadas para **>10 productos con salidas** y **≥1 sin movimiento**. Cuadrar `stock_actual` como exige el Spec 05. *Test:* tras el seed, el dashboard muestra las cuatro secciones con datos y ambos badges (Vencido, Agotado) aparecen al menos una vez.

10. **Verificación integral.** `npm run lint`, `npm test` y una pasada manual: abrir `/admin/dashboard`, cambiar el rango 7/30/90 y ver cómo se recalculan rankings y el KPI de salidas; comprobar que caducidad y stock bajo **no** cambian con el rango; hacer clic en un producto y aterrizar en su kardex; un `usuario` que entra a `/admin/dashboard` es redirigido (guard del Spec 02). *Test:* todos los criterios de aceptación se cumplen.

---

## 5. Criterios de aceptación

- [x] `/admin/dashboard` deja de ser el placeholder y muestra el tablero; el enlace del sidebar ya existía y sigue funcionando.
- [x] Hay un **selector de rango 7 / 30 / 90 días** con default **30**; cambiarlo recalcula los rankings y el KPI de salidas (vía `?dias=`).
- [x] El **"más pedido"** es el producto con **mayor suma de unidades salidas** en el rango; el ranking lista hasta **10**.
- [x] El **"menos pedido"** es el de **menor suma de unidades salidas** en el rango **entre los que tuvieron ≥1 salida**; lista hasta **10**.
- [x] Un producto **sin salidas** en el rango **no** aparece en "menos pedidos": aparece en la lista **"Sin movimiento"**.
- [x] El **gráfico de barras** dibuja el Top 10 más pedidos por unidades.
- [x] La lista **"Próximos a caducar"** incluye perecibles con `fecha_caducidad ≤ hoy + 30 días`, **incluidos los ya vencidos**, ordenados por fecha ascendente.
- [x] Un perecible **vencido** (`fecha_caducidad < hoy`) se muestra **resaltado** con un badge "Vencido".
- [x] La lista **"Stock bajo"** incluye productos con `stock_actual ≤ stock_minimo`; los **agotados** (`stock_actual = 0`) se muestran **resaltados** con un badge "Agotado" y **primero**.
- [x] Las listas de **caducidad y stock bajo NO cambian** al cambiar el rango (son estado actual).
- [x] Las **cuatro tarjetas KPI** muestran: unidades salidas del rango, conteo de próximos a caducar, conteo de stock bajo y conteo de productos activos.
- [x] La KPI de **salidas del rango** cambia con el selector; la de **productos activos** no.
- [x] Los **productos eliminados** (soft-delete) **no** aparecen en ningún ranking ni lista ni conteo.
- [x] Cada producto de cualquier ranking o lista **enlaza a `/admin/movimientos?producto=<id>`**.
- [x] Cada sección sin filas muestra su **estado vacío** en vez de una lista/gráfico vacío.
- [x] Los agregados de salidas se calculan con **funciones RPC `security invoker`** que respetan la RLS `is_admin()`; un `usuario` no obtiene datos (y el guard de ruta lo redirige).
- [x] El **seed** deja el dashboard con datos en las cuatro secciones, incluyendo al menos un **vencido** y un **agotado**.
- [x] Los **helpers puros** tienen tests unitarios (Vitest): `menosPedidos`, `totalSalidas`, `estaVencido`, `diasRango`.
- [x] `npm run lint` y `npm test` pasan.

---

## 6. Decisiones

- **Sí:** **métrica = suma de unidades salidas**. "Más pedido" es el que más volumen se llevó, no el que salió más veces. Refleja el consumo real del almacén; la frecuencia (número de salidas) queda fuera.
- **No:** **ranking por frecuencia** (contar salidas). Se descartó para no mostrar dos métricas que compiten; si más adelante hace falta, es otra columna del `dashboard_pedidos` sin cambiar el resto.
- **Sí:** **"menos pedidos" solo entre productos con ≥1 salida**, y los de 0 salidas en una lista **"Sin movimiento"** aparte. Un producto que nadie pidió no es "poco pedido": es "no pedido", y mezclarlos llenaría el ranking de ceros arbitrarios que ocultan al producto que sí se pide poco pero se pide.
- **Sí:** **selector de rango 7/30/90 vía `searchParams`** (default 30). Reusa el patrón del kardex del Spec 05 (`?producto=`): el rango vive en la URL, el Server Component recalcula, es enlazable y no necesita estado de cliente ni fetch manual. El default 30 es el horizonte natural de un mes de almacén.
- **No:** **rango de fechas arbitrario** (calendario "desde/hasta"). Tres botones cubren el caso real y evitan un date-picker, validación de rangos y estados intermedios. Si se necesita, va en un spec de reportes.
- **Sí:** **el rango gobierna solo los rankings y su KPI**. Caducidad y stock bajo son **estado actual** del inventario, no una ventana de tiempo: cambiarlos con el selector no tendría sentido (un producto está agotado hoy, no "agotado en los últimos 7 días").
- **Sí:** **funciones RPC `security invoker`** para los rankings, no queries crudas al server. Igual que `registrar_movimiento` (Spec 05): la agregación pasa en Postgres, respeta la RLS `is_admin()` de `movimientos` y devuelve pocas filas ya sumadas en vez de arrastrar todo el kardex a Next para agrupar en JS.
- **No:** **vista SQL** para los rankings. El rango es un parámetro y una vista no lo recibe con naturalidad (habría que filtrar por fecha en cada consulta o parametrizar con `set`); una función con `p_dias` es más limpia y explícita.
- **No:** **vista materializada / caché**. El volumen de un almacén municipal no lo justifica; los índices de fecha y producto del Spec 05 bastan. Recalcular al cargar mantiene el dato siempre fresco.
- **Sí:** **caducidad y stock bajo como `select` directos sobre `productos`** (sin RPC), porque `productos` ya es legible por admin (RLS del Spec 03) y no requieren agregación ni el rango. Solo el filtro columna-vs-columna de stock bajo podría necesitar una función trivial (§3), a decidir con context7 al implementar.
- **Sí:** **umbral de caducidad fijo en 30 días e incluye vencidos**. Lo urgente de un almacén perecible es lo que ya venció o vence pronto; mostrarlos juntos (con los vencidos resaltados) es la lista de "atender ya". El umbral va en `constants.ts`, no configurable desde la UI.
- **Sí:** **stock bajo = `stock_actual ≤ stock_minimo`, agotados resaltados**. El `≤` (no `<`) alerta al llegar al mínimo, no al pasarlo; el agotado (`= 0`) se distingue porque no es lo mismo "quedan pocos" que "no queda nada". Un producto con `stock_minimo = 0` solo aparece si está en 0 (agotado), lo cual es correcto: sin umbral definido, solo su agotamiento amerita alerta.
- **Sí:** **cuatro tarjetas KPI**, dos dependientes del rango (salidas) y de estado (caducidad, stock bajo, activos). Dan el pulso del almacén antes de leer las listas.
- **Sí:** **Top 10 por ranking** y **un solo gráfico** (más pedidos). Diez cabe sin scroll y el gráfico de barras del top es el que un jefe mira primero; graficar también "menos pedidos" añade ruido visual sin decisión asociada.
- **Sí:** **shadcn `chart` (Recharts)**. Encaja con el stack shadcn ya instalado (Base UI + `chart` wrapper), tema consistente y menos código que Recharts a pelo.
- **Sí:** **cada producto enlaza a su kardex** (`/admin/movimientos?producto=<id>`). El dashboard responde "qué"; el kardex del Spec 05 responde "por qué": un clic conecta el resumen con el detalle sin construir nada nuevo.
- **Sí:** **estados vacíos explícitos** por sección. Un almacén recién sembrado o un rango de 7 días pueden no tener salidas; una lista vacía sin mensaje se lee como error.
- **Sí:** **ajustar el seed** para que las cuatro secciones muestren datos (incluido un vencido y un agotado). Un dashboard que abre vacío no se puede revisar ni demostrar; el seed del Spec 05 no garantizaba perecibles próximos ni stock bajo.
- **Sí:** **helpers puros en `lib/dashboard/`** separados del Server Component. Vitest no prueba Server Components `async` (limitación anotada en `CLAUDE.md`), así que la lógica testeable (invertir/cortar el ranking, sumar el KPI, marcar vencido, validar el rango) vive en funciones puras probadas aparte.
- **Sí:** **reemplazar el placeholder de `page.tsx`** y **no** tocar el sidebar. El enlace **Dashboard** existe desde el Spec 02; el módulo solo llena la página que ya lo esperaba.
- **Definición sin revisión sección por sección:** la Fase 2 de `/spec` se completó (tres bloques de preguntas cerraron todas las decisiones), pero a pedido del usuario el documento se redactó de una vez para revisarlo al final, como en el Spec 06.1.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La RPC `security invoker` corre bajo la RLS del llamador; un bug de RLS podría exponer o esconder movimientos indebidamente. | Se reusa la política `movimientos_select` del Spec 05 (`is_admin()`), ya probada; la función no la relaja. Un `usuario` obtiene ranking vacío y el guard de ruta lo redirige antes. |
| `stock_actual ≤ stock_minimo` compara **dos columnas** y `supabase-js` no lo expresa directo; un filtro mal armado listaría de más o de menos. | Si el builder no alcanza, se sirve con una función trivial `dashboard_stock_bajo()` (`security invoker`, sin parámetros), decidido con context7 al implementar. Un criterio de aceptación verifica la lista. |
| Con pocos productos con salidas (menos de 20), **más pedidos** y **menos pedidos** comparten filas y confunden. | Es correcto y esperado: ambos rankings salen del mismo agregado. Con <10 productos con salidas, cada lista muestra los que haya; el "sin movimiento" absorbe el resto. Se documenta y el seed carga >10 para que se vea la diferencia. |
| El corte de fecha con `now()` y la zona horaria (America/Lima) desplaza qué salidas entran al rango cerca de la medianoche. | `movimientos.fecha` es `timestamptz` y `now()` también; la comparación es en UTC absoluto, sin ambigüedad de zona. El rango es en días completos hacia atrás, no en fechas civiles, así que el borde de medianoche local no cambia el conjunto. |
| El gráfico shadcn `chart` (Recharts) es Client Component y podría romper el render del Server Component que lo envuelve. | El gráfico se aísla en `pedidos-chart.tsx` (`"use client"`) y recibe datos ya calculados por props; la página sigue siendo Server Component. Un test de render lo cubre. |
| El seed deja `stock_actual` descuadrado al forzar agotados/bajos (rompe el criterio del Spec 05). | El ajuste del seed cuadra `stock_actual` al neto de los movimientos sembrados, como exige el Spec 05; el paso 9 lo verifica. |
| Perecibles con `fecha_caducidad = null` o productos sin categoría se cuelan y rompen el orden o el render. | El `select` de caducidad exige `es_perecible = true` y `fecha_caducidad is not null`; la categoría se resuelve con `left join` y cae a `null` sin romper (se muestra "—"). |

---

## 8. Lo que **no** entra en este spec

- La **vista del usuario** (su historial en solo lectura) → **Spec 08**.
- **Exportar / imprimir** el dashboard.
- **Filtros avanzados / BI**: por área, categoría o usuario; comparativas entre periodos; rango de fechas por calendario.
- **Métricas de entradas** (reabastecimiento, proveedores) y **por usuario**; el ranking es **solo de salidas**.
- **Ranking por frecuencia** (número de salidas); la métrica es **suma de unidades**.
- **Alertas activas** (correo/push) por stock bajo o caducidad; el dashboard muestra, no notifica.
- **Umbrales configurables** desde la UI (caducidad, stock bajo) y **persistir el rango** entre sesiones.
- **Realtime / auto-refresco** y **gráficos de series de tiempo**.

Cada uno, cuando llegue, va en su propio spec.
