# Informe de auditoría integral — muni-ica-kardex

> **Auditoría:** Spec 10 (auditoría integral) · **Fecha:** 2026-07-21
> **Alcance:** Specs 01–09 (auth, roles, catálogo, áreas/usuarios, movimientos/kardex, vale PDF, multiproducto/lotes, dashboard, historial, estados de carga/error).
> **Método:** revisión de código y migraciones (solo lectura) + advisors de Supabase. **No** se modificó código, migración ni configuración. **No** hubo smoke test en vivo con sesiones reales: los hallazgos de correctitud citan `archivo:línea` para que sean verificables; el informe no afirma "está roto" salvo donde se confirmó contra la documentación oficial.
> **Rama al auditar:** `spec-10-auditoria-integral`. Spec 09 integrada en `master` (commit `bd42482`) — sin advertencia de rama pendiente.

---

## Resumen ejecutivo

**Semáforo por dimensión** (🟢 sólido · 🟡 correcto con deuda accionable · 🔴 riesgo grave):

| Dimensión | Estado | Lectura de una línea |
| --- | --- | --- |
| 1. Correctitud funcional | 🟡 | El dominio se cumple casi entero; dos bugs Altos accionables: el botón "Reintentar" no funciona y editar un producto reescribe el stock fuera del kardex. |
| 2. Seguridad | 🟡→🟢 | RLS y guards sólidos; advisors **sin** ERROR/Crítico. Único hueco Medio: un admin puede promoverse a `superadmin` a nivel BD. |
| 3. Escalabilidad | 🟡 | Funciona hoy; no escala: el kardex se carga entero sin paginación y faltan índices en dos FKs de `movimientos`. |
| 4. Calidad de código | 🟡 | Drift entre migraciones y BD real; cobertura de tests inversa al riesgo; guard de autorización duplicado 5 veces. |

**Conteo de hallazgos por severidad:**

| Dimensión | Crítica | Alta | Media | Baja | Total |
| --- | :-: | :-: | :-: | :-: | :-: |
| Correctitud | 0 | 2 | 2 | 10 | 14 |
| Seguridad | 0 | 0 | 1 | 6 | 7 |
| Escalabilidad | 0 | 0 | 1 | 4 | 5 |
| Calidad | 0 | 0 | 3 | 4 | 7 |
| **Total** | **0** | **2** | **7** | **24** | **33** |

**Cero hallazgos Críticos.** Los 2 Altos y los 7 Medios son la cola accionable; el resto es higiene. Los dos titulares:

1. **[CORR-01] El botón "Reintentar" está muerto en las tres fronteras de error** — confirmado contra el doc de Next 16.2. Un error de Server Component deja al usuario sin recuperación salvo recargar toda la app.
2. **[CORR-02] Editar un producto reescribe `stock_actual` sin pasar por el kardex** — rompe la invariante central del sistema (el kardex imborrable deja de ser la única fuente del stock) y no deja rastro.

El punto fuerte del sistema es la **seguridad de datos** (RLS por tabla, RPC transaccional atómica, guards del superadmin a nivel BD, guard propio del vale PDF). El punto débil no es un agujero de seguridad clásico, sino la **integridad del dato** (stock editable) y la **reproducibilidad** (drift de migraciones).

---

## 1. Correctitud funcional

Auditada spec por spec contra los criterios de aceptación de cada `specs/NN-*.md`. La **mayoría** de criterios se cumplen por lectura de código: RPC de movimientos atómica, folio y número de lote correlativos, vale PDF (guard + idempotencia + agrupación por categoría), soft-delete de productos, dashboard agregado en Postgres, historial acotado por área, protección del superadmin contra degradación/borrado, y estados de loading/not-found. Las divergencias:

### [CORR-01] El botón "Reintentar" no hace nada en las tres fronteras de error
- **Severidad:** Alta
- **Evidencia:** `app/error.tsx:6-14`, `app/admin/error.tsx:5-14`, `app/usuario/error.tsx:5-14` (desestructuran una prop `retry`); `components/error-state.tsx:27` (`<Button onClick={reset}>`); doc oficial `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:27,117-121,329` (Next 16.2.0 pasa `error`, `unstable_retry` y `reset` — **no** existe una prop `retry`).
- **Impacto:** `retry` es `undefined` en runtime → `ErrorState` recibe `reset={undefined}` → el botón "Reintentar" no ejecuta nada. Ante un error de fetch de cualquier Server Component (`/`, `/admin/*`, `/usuario/*`), el usuario no puede recuperarse sin recargar toda la aplicación. Incumple el criterio de Spec 09 ("un botón Reintentar que llama `reset()`"). El test unitario (`error-state.test.tsx`) pasa un mock y queda verde, así que no detecta el cableado roto. El comentario del código describe exactamente el comportamiento de `unstable_retry`, pero usa el nombre de prop equivocado.
- **Recomendación:** Spec correctivo — renombrar `retry` → `unstable_retry` en los tres `error.tsx` y añadir un test que verifique que el clic invoca la prop real.

### [CORR-02] Editar un producto reescribe `stock_actual` fuera del kardex
- **Severidad:** Alta
- **Evidencia:** `app/admin/productos/actions.ts:88` (`.update(toRow(parsed.data))`), `toRow` en `actions.ts:24-35` incluye `stock_actual` (l.29). Sin guard a nivel BD: la policy `productos_write` (`0009_catalogo_rls.sql:29-32`) permite al admin escribir cualquier columna.
- **Impacto:** `editarProducto` deja al admin fijar cualquier `stock_actual` directamente, **sin** generar un movimiento, **sin** el bloqueo de fila de la RPC y **sin** dejar rastro en el kardex. Rompe la invariante central documentada ("desde Spec 05 solo lo mueven los movimientos", comentarios de `0008`/`0014`): el stock puede desincronizarse del neto del kardex de forma silenciosa, invalidando el dashboard (que suma movimientos) y el propio kardex como fuente de verdad.
- **Recomendación:** Spec correctivo — quitar `stock_actual` del `update` de edición (el stock inicial solo se fija al crear; los ajustes van por un movimiento de entrada/salida o un movimiento de "ajuste de inventario" nuevo), y opcionalmente un trigger BD que bloquee `update` de `stock_actual` fuera de la RPC.

### [CORR-03] El historial de usuario no muestra el motivo, contra un criterio marcado como cumplido
- **Severidad:** Media
- **Evidencia:** `specs/08-historial-usuario.md:137` (criterio `[x]`: al expandir el lote se muestra "folio, producto + SKU, cantidad y motivo (si existe)"); `app/usuario/dashboard/historial-client.tsx:150-181` (subtabla sin columna de motivo); `app/usuario/dashboard/historial-client.test.tsx:65-72` (test que fija "no muestra el motivo").
- **Impacto:** divergencia real entre un criterio de aceptación documentado como cumplido y el código (falso positivo en el checklist del spec). Funcionalmente menor —parece una decisión de producto consciente (motivo = nota interna de almacén)—, pero deja el spec mintiendo sobre su propio estado.
- **Recomendación:** decisión de producto — o mostrar el motivo en el historial, o corregir el criterio de Spec 08 para reflejar que se omite a propósito. Recogerlo en el spec correctivo de conformidad.

### [CORR-04] Contrato roto: `registrar_movimiento(p_lote_id null)` fallaría tras el `NOT NULL` de 0018
- **Severidad:** Media
- **Evidencia:** `supabase/migrations/0018_lotes.sql:65-66` (`alter column lote_id set not null`); `supabase/migrations/0016_movimientos_lote.sql:44,86-95` (la función conserva `p_lote_id uuid default null` e inserta `lote_id = p_lote_id`, con comentario l.103 "null = movimiento suelto").
- **Impacto:** una llamada directa a la RPC sin lote (su firma lo permite y el comentario lo promete) violaría el `NOT NULL` y abortaría con un error confuso en vez de registrar un "movimiento suelto". **No alcanzable desde la UI** (la app solo llama `registrar_movimientos_lote`, `app/admin/movimientos/actions.ts:55`, que siempre crea un lote), pero el contrato documentado de la función quedó falso; cualquier uso directo futuro fallaría.
- **Recomendación:** Spec correctivo — alinear el contrato: o hacer que `registrar_movimiento` cree un lote propio cuando `p_lote_id` es null, o quitar el default y el comentario "suelto".

### [CORR-05] Usuario autenticado sin fila en `profiles` cae en un bucle suave a `/login`
- **Severidad:** Baja
- **Evidencia:** `lib/auth/profile.ts:39` (`if (error || !data) return null`), `lib/auth/require-role.ts` (redirige a `/login` si no hay perfil), `app/page.tsx:14-15`, `app/login/page.tsx:20-23`.
- **Impacto:** `getProfile()` devuelve `null` tanto sin sesión como sin fila; el proxy ve la sesión válida y deja pasar `/login`, que vuelve a mostrar el formulario. Un usuario autenticado sin perfil (fila ausente / fallo del trigger) queda atrapado en el login. Mitigado por el backfill del `seed.sql:14-18`.
- **Recomendación:** Spec correctivo (higiene de auth) — distinguir "sin sesión" de "sin perfil" y enviar el segundo caso a onboarding o a una pantalla de error clara.

### [CORR-06] `profiles_update_own` deja al dueño sobrescribir su `email` denormalizado y su `perfil_completo`
- **Severidad:** Baja
- **Evidencia:** `supabase/migrations/0002_profiles_rls.sql:39-41` (`with check` solo `id = auth.uid()`); el trigger `guard_profile_write` (`0003`) solo protege `role`/`area_id`.
- **Impacto:** el usuario puede escribir libremente `nombre`, `telefono`, `perfil_completo` y `email` de su propia fila. `email` es una copia denormalizada de `auth.users` (fuente de verdad) usada para mostrar/buscar usuarios; un update propio puede desincronizarla. No cruza frontera de privilegio (es su propia fila), pero es integridad de dato.
- **Recomendación:** Spec correctivo — proteger `email`/`perfil_completo` en el trigger o excluirlos del `with check` de la policy de update propio.

### [CORR-07] El aviso de fallo de un lote no identifica qué producto falló
- **Severidad:** Baja
- **Evidencia:** criterio `specs/06.1-movimientos-multiproducto.md` ("el modal queda abierto avisando cuál falló"); `app/admin/movimientos/actions.ts:28-37` (mensajes genéricos); la RPC (`0013:111`) lanza `raise 'stock insuficiente'` sin nombre/id.
- **Impacto:** en un lote de varios productos, el admin ve que algo falló pero no cuál; debe deducirlo. El "modal queda abierto" sí se cumple.
- **Recomendación:** Spec correctivo — que la RPC incluya el `producto_id`/SKU en el mensaje de error y la Server Action lo propague.

### [CORR-08] Orden no determinista del kardex y de la subtabla del lote
- **Severidad:** Baja
- **Evidencia:** `app/admin/movimientos/page.tsx:54` y `app/usuario/dashboard/page.tsx:58` (`.order("fecha", { ascending:false })` sin desempate); la subtabla del lote (`app/admin/movimientos/movimientos-client.tsx:637`) pinta filas que comparten `fecha`. El vale PDF **sí** ordena determinísticamente (`app/admin/movimientos/[id]/vale/route.ts:133`, `.order("folio")`).
- **Impacto:** filas con `fecha` idéntica (p. ej. todas las de un mismo lote, insertadas en el mismo `now()`) pueden reordenarse entre cargas. Cosmético.
- **Recomendación:** Spec correctivo — añadir desempate por `folio` (o `id`) al `order` de las listas.

### [CORR-09] El corte de "vencido"/"próximo a caducar" se calcula en día UTC, no America/Lima
- **Severidad:** Baja
- **Evidencia:** `lib/dashboard/dashboard.ts:29-31,38-40` (`isoDia` usa `toISOString()` → día UTC); `app/admin/dashboard/page.tsx:116-119` (umbral derivado con `getUTCDate()`).
- **Impacto:** en Lima (UTC-5), entre ~19:00 y 23:59 hora local el "hoy" UTC ya avanzó un día; un perecible que caduca hoy se marca "Vencido" unas horas antes de tiempo y el umbral `hoy+30` se desplaza un día en esa franja. Solo en el borde de medianoche local.
- **Recomendación:** Spec correctivo — calcular el día de corte en `America/Lima`.

### [CORR-10] Imagen huérfana en Storage ante early-returns del Server Action tras subir en el cliente
- **Severidad:** Baja
- **Evidencia:** `app/admin/productos/actions.ts:45,48,68-70` (los `return` de "No autorizado"/"Datos inválidos"/"Producto inválido" no limpian el objeto ya subido); la limpieza solo ocurre en la rama de error de BD (`actions.ts:55-56,93-94`). El cliente sube antes de invocar la acción (`productos-client.tsx:250-262`).
- **Impacto:** en flujo normal es casi inalcanzable (mismo `productoSchema` valida en cliente y servidor), pero ante invocación directa/tampering deja basura en el bucket.
- **Recomendación:** Spec correctivo (higiene de Storage) — limpiar el objeto subido en todos los caminos de fallo.

### [CORR-11] El criterio de Spec 03 "eliminar producto borra su imagen" ya no se cumple
- **Severidad:** Baja
- **Evidencia:** `app/admin/productos/actions.ts:116-124` (`eliminarProducto` es soft-delete `update({eliminado:true})` y no toca la imagen).
- **Impacto:** deriva consciente por el soft-delete de Spec 05: el objeto de un producto dado de baja nunca se libera. No es huérfano estricto (la fila persiste referenciando `imagen_path`), pero el criterio literal de Spec 03 dejó de cumplirse.
- **Recomendación:** documentar el cambio en Spec 03 (o una purga de imágenes de productos eliminados como tarea de mantenimiento).

### [CORR-12] Detección de email duplicado por heurística frágil
- **Severidad:** Baja
- **Evidencia:** `app/admin/usuarios/actions.ts:62-72` (el mensaje "ya existe una cuenta" depende de `code==='email_exists' || status===422 || message.includes('already')`).
- **Impacto:** si la Auth Admin API cambia la forma del error de duplicado, el usuario cae al mensaje genérico y no sabe que el email ya existe.
- **Recomendación:** Spec correctivo — verificar la forma del error contra la versión actual de `@supabase/supabase-js` y endurecer la detección.

### [CORR-13] Sin cota superior de `cantidad` (posible "integer out of range")
- **Severidad:** Baja
- **Evidencia:** `lib/movimientos/schemas.ts:56-62` (entero positivo sin máximo); `movimientos.cantidad`/`productos.stock_actual` son `int` (`0013:18`).
- **Impacto:** una cantidad > 2³¹ (o que empuje el stock más allá del máximo de `int`) provoca un error de Postgres traducido al mensaje genérico. Caso extremo improbable.
- **Recomendación:** Spec correctivo — cota superior en el schema zod.

### [CORR-14] Huecos en los correlativos de lote/folio por transacciones abortadas
- **Severidad:** Baja
- **Evidencia:** `registrar_movimientos_lote` inserta en `lotes` (identity) antes del loop (`0018:97`); si un item falla, la transacción revierte pero la secuencia ya consumió el valor.
- **Impacto:** cosmético; los códigos `L-000042` siguen siendo únicos e identificables (análogo a los huecos de folio ya aceptados en Spec 06). No documentado para lotes.
- **Recomendación:** ninguna acción; documentar como comportamiento aceptado, igual que los huecos de folio.

---

## 2. Seguridad

Se ejecutaron los advisors de Supabase (`get_advisors` de seguridad y performance) sobre el proyecto real. **No hay hallazgos ERROR ni Críticos**; todos son WARN/INFO. La postura de seguridad de datos es sólida: RLS habilitada en todas las tablas del dominio, RPC de escritura de stock `security invoker` con guard `is_admin()`, guards del superadmin a nivel BD (triggers `before` que corren incluso bajo service role), y guard propio en el Route Handler del vale PDF (403 + RLS backstop). El único hueco de nivel Medio es de autorización de escritura, no de lectura.

### [SEG-01] Un admin puede promoverse (o promover a otro) a `superadmin` a nivel de base de datos
- **Severidad:** Media *(defendible como Alta: rompe la invariante del superadmin como "root de último recurso")*
- **Evidencia:** `supabase/migrations/0003_profiles_superadmin_guard.sql:21-28` (el guard solo bloquea *degradar* a un superadmin existente y cambios de rol/área de *no-admins*; **no** bloquea *promover* a `superadmin`); `supabase/migrations/0002_profiles_rls.sql:44-45` (`profiles_update_admin` = `using(is_admin())`); la única barrera es el `z.enum(['admin','usuario'])` de las Server Actions (`lib/usuarios/schemas.ts:55,69`).
- **Impacto:** un admin autenticado que llame a PostgREST directamente con su propia sesión (sin pasar por la UI) puede fijar `role='superadmin'` en cualquier fila, incluida la suya — creando cuentas *ineliminables e indegradables*. Anula la unicidad del superadmin sembrado ("nunca eliminable ni degradable", CLAUDE.md), que solo se garantiza en el seed. En la UI el requisito "no escalar su propio rol" **sí** se cumple; el hueco es de capa BD (defensa en profundidad).
- **Recomendación:** Spec correctivo — trigger BD que rechace promover a `superadmin` (salvo el seed controlado), cerrando el hueco donde la RLS no llega.

### [SEG-02] El bucket público `productos` permite listar todos sus objetos
- **Severidad:** Baja
- **Evidencia:** advisor `public_bucket_allows_listing`; policy `productos_bucket_read` (`supabase/migrations/0010_storage_productos.sql:15-16`) usa solo `bucket_id = 'productos'`.
- **Impacto:** cualquier cliente (incluido `anon`) puede **listar** todos los objetos del bucket, no solo acceder por URL. Las imágenes ya son públicas, pero se expone la estructura/paths completos.
- **Recomendación:** Spec correctivo (endurecimiento) — restringir la policy de SELECT para permitir acceso por objeto sin listado, según la guía del advisor.

### [SEG-03] `mi_area_id()` es `security definer` y quedó sin `revoke execute`
- **Severidad:** Baja
- **Evidencia:** advisor `anon/authenticated_security_definer_function_executable`; `supabase/migrations/0021_historial_usuario_rls.sql:17-23` (crea la función sin revocar `execute`, a diferencia de las funciones de trigger en `0004`).
- **Impacto:** queda expuesta como RPC PostgREST (`/rest/v1/rpc/mi_area_id`). Impacto benigno (devuelve solo el área del propio llamante), pero mantiene el WARN del advisor.
- **Recomendación:** Spec correctivo — `revoke execute … from public, anon, authenticated` (las policies RLS la siguen ejecutando como definer), o moverla a un esquema `private` no expuesto.

### [SEG-04] Protección de contraseñas filtradas deshabilitada en Auth
- **Severidad:** Baja
- **Evidencia:** advisor `auth_leaked_password_protection` (config del proyecto, no código).
- **Impacto:** Supabase Auth no valida las contraseñas contra HaveIBeenPwned; se aceptan contraseñas comprometidas conocidas.
- **Recomendación:** activar la opción en el panel de Auth (Authentication → Policies). No requiere spec de código.

### [SEG-05] `is_admin()` ejecutable por `anon`/`authenticated` — riesgo aceptado y documentado
- **Severidad:** Baja *(informativo; no requiere acción)*
- **Evidencia:** advisor `security_definer_function_executable`; decisión documentada en `supabase/migrations/0004_lock_down_functions.sql:12-15`.
- **Impacto:** la función se deja ejecutable a propósito porque las policies RLS la invocan; revela solo si el propio llamante es admin. Benigno.
- **Recomendación:** ninguna; si se quisiera silenciar el WARN, moverla a un esquema `private`.

### [SEG-06] El dashboard admin no revalida la sesión por página; confía solo en el guard del layout
- **Severidad:** Baja
- **Evidencia:** `app/admin/dashboard/page.tsx` (sin `getUser`/`requireRole` propio); guard únicamente en `app/admin/layout.tsx:22`. La Decisión de Spec 01 fijaba "cada página revalida con `getUser()`".
- **Impacto:** divergencia de la postura "por página"; las subrutas admin quedan cubiertas solo por el layout. No explotable (el layout corre en cada request de servidor y las RPC del dashboard tienen la RLS `is_admin()` como respaldo).
- **Recomendación:** Spec correctivo (defensa en profundidad) — reintroducir la revalidación por página o documentar oficialmente que el guard vive en el layout.

### [SEG-07] El seed desactiva el trigger `guard_profile_update` a nivel de tabla durante el UPDATE del superadmin
- **Severidad:** Baja
- **Evidencia:** `supabase/seed.sql:24-32` (`alter table … disable trigger …` es DDL de tabla, no de sesión).
- **Impacto:** durante ese tramo del seed la protección del superadmin queda desactivada para *cualquier* sesión concurrente; si el seed corriera en una BD viva fuera de una transacción única, hay una ventana breve sin guardia. Aceptable para un seed de setup.
- **Recomendación:** ninguna acción inmediata; documentar que el seed debe correrse en setup/mantenimiento, no en producción con tráfico.

---

## 3. Escalabilidad

El sistema funciona con los volúmenes actuales (seed), pero varias decisiones no escalan cuando el kardex crezca a miles de movimientos. **Nota positiva:** no se detectaron **N+1** reales — las páginas resuelven nombres con `Map` en memoria y una sola query `.in(...)` por relación (p. ej. `app/admin/movimientos/page.tsx:92-104`), no una query por fila. La agregación del dashboard se hace en Postgres vía RPC, no trayendo el kardex a JS.

### [ESC-01] El kardex y el historial se cargan enteros, sin paginación server-side
- **Severidad:** Media
- **Evidencia:** `app/admin/movimientos/page.tsx:49-54` y `app/usuario/dashboard/page.tsx:53-58` (`.select(...).order("fecha", …)` sin `.range()`/`.limit()`).
- **Impacto:** cada visita a Movimientos/Historial trae **todas** las filas de `movimientos` (más productos, lotes, categorías) a Next y las filtra/ordena en cliente. Con miles de movimientos: payload creciente, memoria del servidor, tiempo de render y transferencia degradan linealmente sin cota.
- **Recomendación:** Spec correctivo — paginación server-side (keyset/`range`) en Movimientos e Historial, con filtros aplicados en la query.

### [ESC-02] Índices faltantes en `movimientos.area_id` y `movimientos.usuario_id`
- **Severidad:** Baja *(Media a futuro con volumen)*
- **Evidencia:** advisor `unindexed_foreign_keys` (x2); `supabase/migrations/0013_movimientos.sql:29-30` solo crea `movimientos_producto_idx` y `movimientos_fecha_idx`. La RLS `movimientos_select_usuario` (`0021:36`) filtra por `area_id`; el `on delete set null` de `usuario_id` y el join a `profiles` no tienen índice de cobertura.
- **Impacto:** el historial por área (rol usuario) fuerza seq scan filtrando por `area_id`; borrar una cuenta escanea `movimientos` por `usuario_id`. Con volumen, ambos se degradan.
- **Recomendación:** Spec correctivo — `create index` sobre `movimientos(area_id)` y `movimientos(usuario_id)`.

### [ESC-03] Políticas permisivas múltiples por rol+acción (las `_write` son `for all`)
- **Severidad:** Baja
- **Evidencia:** advisor `multiple_permissive_policies`; las policies `*_write` (`categorias`/`productos`/`areas`/`lotes`) son `for all` (incluye SELECT) y coexisten con la `*_select` dedicada; `profiles` tiene dos policies de UPDATE (own + admin).
- **Impacto:** en cada SELECT, Postgres evalúa **ambas** policies. Micro-coste por fila; despreciable hoy, acumulativo con volumen.
- **Recomendación:** Spec correctivo — acotar las `_write` a `insert/update/delete` en vez de `for all`, y considerar fusionar las dos de UPDATE de `profiles` en una con `OR`.

### [ESC-04] Índice `profiles_area_id_idx` nunca usado
- **Severidad:** Baja *(informativo)*
- **Evidencia:** advisor `unused_index`; `supabase/migrations/0012_areas.sql:32`.
- **Impacto:** un índice que ocupa espacio y ralentiza escrituras sin acelerar ninguna lectura observada. Contraste llamativo: falta índice donde se filtra (`movimientos.area_id`) y sobra donde no se usa (`profiles.area_id`). "Nunca usado" es esperable en una BD de bajo tráfico, así que el dato es débil.
- **Recomendación:** reevaluar con tráfico real antes de eliminarlo; recogerlo en el spec de índices (ESC-02).

### [ESC-05] El proxy revalida la sesión contra Auth (`getUser`) en cada request cubierto
- **Severidad:** Baja *(informativo; patrón recomendado, no bug)*
- **Evidencia:** `proxy.ts:42-44` y su matcher.
- **Impacto:** `getUser()` hace un round-trip al servidor Auth por cada request no-estático — correcto de seguridad (patrón que recomienda Supabase), pero añade latencia que escala con el tráfico.
- **Recomendación:** ninguna acción; tradeoff conocido. Monitorizar si el tráfico crece.

---

## 4. Calidad de código

Dos ejes: la **reproducibilidad** del esquema (drift migraciones ↔ BD) y la **mantenibilidad** (duplicación de plantilla spec-por-spec + cobertura de tests). Nota de consistencia positiva: el manejo de estado `pending` (`useTransition`) y de errores (`setFormError`) es **uniforme** en los cinco clientes admin; no hay dispersión de convenciones ahí.

### [CAL-01] `supabase/migrations/` no reproduce fielmente la base de datos de producción
- **Severidad:** Media
- **Evidencia:** (a) la migración `0005_revoke_trigger_functions_from_public` está aplicada en la BD (`supabase_migrations.schema_migrations`) pero **ausente del repo** — los archivos saltan `0004`→`0006`; (b) el event trigger `ensure_rls` + la función `public.rls_auto_enable()` existen en la BD (creados por el owner `postgres`), **fuera de toda migración**.
- **Impacto:** un `supabase db reset` desde el repo produce una BD distinta a producción: sin la migración 0005 y sin la red de seguridad `ensure_rls` (que auto-activa RLS en tablas nuevas de `public`). Rompe la promesa de "la BD se describe por migraciones". La función `rls_auto_enable` además explica uno de los WARN de seguridad (es benigna: como event trigger, invocarla por RPC no hace nada).
- **Recomendación:** Spec correctivo — recuperar/recrear `0005_*.sql` en el repo y añadir una migración que declare el event trigger `ensure_rls`, de modo que las migraciones reconstruyan la BD real.

### [CAL-02] La cobertura de tests está inversamente correlacionada con el riesgo
- **Severidad:** Media
- **Evidencia:** **con test**: 9 helpers puros de `lib/` + componentes presentacionales + `route.test.ts` del vale. **Sin ningún test**: las 9 Server Actions (toda la ruta de mutación), `proxy.ts` + `lib/auth/{profile,require-role}` (toda la ruta de auth/sesión), 4 de 5 client components incluido el más complejo (`app/admin/movimientos/movimientos-client.tsx`, ~900 líneas), y todos los Server Components async (limitación de Vitest documentada en CLAUDE.md). **Cero E2E.**
- **Impacto:** el código más crítico —guards de autorización, mutaciones de stock, el formulario de lotes— no tiene red automática, y es justo donde CORR-01 (retry muerto) y SEG-01 (escalada) se habrían detectado. Las Server Actions **sí** son testeables con mocks (como demuestra `route.test.ts`).
- **Recomendación:** dos specs — (a) tests de Server Actions con mocks de Supabase; (b) E2E con Playwright para los flujos autenticados (login por rol, registrar movimiento, descargar vale, historial de usuario).

### [CAL-03] El guard de autorización `esAdmin` está duplicado 5 veces
- **Severidad:** Media
- **Evidencia:** `app/admin/categorias/actions.ts:17-20`, `productos/actions.ts:18-21`, `areas/actions.ts:17-20`, `movimientos/actions.ts:19-22` (byte-idénticos) + variante `requireAdmin` en `usuarios/actions.ts:21-26`.
- **Impacto:** la lógica de rol admin/superadmin vive en 5 sitios; cambiarla (p. ej. añadir un rol) obliga a tocar los 5, y una copia desincronizada es un agujero de autorización silencioso.
- **Recomendación:** Spec correctivo (refactor) — extraer `requireAdmin()` a `lib/auth/guard.ts` como único punto de verdad.

### [CAL-04] `type ActionResult` redeclarado 4 veces
- **Severidad:** Baja
- **Evidencia:** `*/actions.ts:12` en categorias/productos/areas/usuarios (idéntico); `LoteResult` (movimientos) es una 5ª variante.
- **Impacto:** cambios al contrato de retorno se hacen en 4 sitios. Mantenibilidad.
- **Recomendación:** recoger en el refactor (CAL-03) — tipo compartido en `lib/`.

### [CAL-05] Andamiaje CRUD (~40-50 líneas) calcado por cliente
- **Severidad:** Baja
- **Evidencia:** `categorias-client.tsx` y `areas-client.tsx` ~85% idénticos; `onSubmit`/`confirmDelete`/header/tabla/footer/AlertDialog casi calcados en 4 clientes (`categorias-client.tsx:77-102`, `areas-client.tsx:76-101`, `usuarios-client.tsx:134-159`, `productos-client.tsx:265-288`).
- **Impacto:** cada arreglo de UX del molde CRUD se repite 4 veces. Mantenibilidad.
- **Recomendación:** recoger en el refactor — hook `useCrudDialog` + componentes compartidos (`<CrudPageHeader>`, `<CrudDeleteDialog>`, `<PageError>`).

### [CAL-06] Mapeo de errores de Postgres (23505/23503) inline y duplicado
- **Severidad:** Baja
- **Evidencia:** `categorias/actions.ts:34-38,64-68,82-90` y `areas/actions.ts:33-37,60-64,78-86` (casi idénticos); `productos/actions.ts:37-42` tiene su propio `mensajeError`.
- **Impacto:** mensajes de error inconsistentes si una copia cambia. Mantenibilidad.
- **Recomendación:** recoger en el refactor — helper `pgErrorMessage(code, opts, fallback)` en `lib/`.

### [CAL-07] Firma de `editarUsuario` inconsistente con las otras acciones de edición
- **Severidad:** Baja
- **Evidencia:** `app/admin/usuarios/actions.ts:109` recibe `(input)` con `{id,…}` dentro, mientras `editarCategoria`/`editarProducto`/`editarArea` reciben `(id, input)`.
- **Impacto:** contrato de edición distinto entre specs; fricción para quien lee/mantiene.
- **Recomendación:** recoger en el refactor — unificar la firma de las acciones de edición.

---

## 5. Roadmap sugerido

Dos bloques: **5.a** specs correctivos (derivados de hallazgos, ordenados por severidad) y **5.b** specs de nuevas funcionalidades (ideas de producto). Los hallazgos Bajos se **agrupan** en pocos specs de higiene para no dispersar el roadmap; el usuario puede empezar por arriba y parar donde quiera. La numeración (`Spec 11+`) es una sugerencia, no un compromiso.

### 5.a Specs correctivos (priorizados por severidad)

**Prioridad 1 — Alta (hacer primero; ambos son cambios pequeños de alto impacto):**

| Spec | Objetivo (una frase) | Hallazgos | Tamaño |
| --- | --- | --- | :-: |
| **11 · Reactivar "Reintentar"** | Renombrar la prop `retry` → `unstable_retry` en las tres fronteras de error y cubrir el cableado con un test que verifique que el clic invoca la prop real. | CORR-01 | S |
| **12 · Blindar la integridad del stock** | Quitar `stock_actual` del `update` de edición de producto y añadir un trigger BD que impida escribir `stock_actual` fuera de la RPC de movimientos. | CORR-02 | S/M |

**Prioridad 2 — Media:**

| Spec | Objetivo (una frase) | Hallazgos | Tamaño |
| --- | --- | --- | :-: |
| **13 · Cerrar la promoción a superadmin** | Trigger BD que rechace promover cualquier fila a `superadmin` (salvo el seed controlado), cerrando el hueco de escalada que la RLS no cubre. | SEG-01 | S |
| **14 · Reproducibilidad del esquema** | Recuperar la migración `0005` ausente y declarar en una migración el event trigger `ensure_rls`, para que `supabase/migrations/` reconstruya la BD real. | CAL-01 | S |
| **15 · Conformidad y contrato de movimientos** | Alinear `registrar_movimiento` con el `NOT NULL` de lote y resolver el motivo del historial de usuario (mostrarlo o corregir el criterio de Spec 08). | CORR-03, CORR-04 | S |
| **16 · Escalabilidad de datos** | Paginación server-side (keyset) del kardex/historial, índices en `movimientos(area_id)` y `(usuario_id)`, y acotar las policies `_write` a `insert/update/delete`. | ESC-01, ESC-02, ESC-03, ESC-04 | M |
| **17 · Red de tests de la capa crítica** | Tests de las 9 Server Actions con mocks de Supabase (empezando por auth y movimientos), la capa hoy sin cobertura. | CAL-02 (parte a) | M |

**Prioridad 3 — Baja (higiene, agrupada):**

| Spec | Objetivo (una frase) | Hallazgos | Tamaño |
| --- | --- | --- | :-: |
| **18 · Refactor de mantenibilidad** | Extraer `requireAdmin()`, un `ActionResult` compartido, un hook `useCrudDialog` + componentes CRUD y un `pgErrorMessage`, y unificar la firma de las acciones de edición. | CAL-03, CAL-04, CAL-05, CAL-06, CAL-07 | M |
| **19 · Endurecimiento menor de seguridad** | Revocar `execute` de `mi_area_id()`, restringir el listado del bucket `productos`, reintroducir la revalidación por página y activar la protección de contraseñas filtradas en Auth. | SEG-02, SEG-03, SEG-04, SEG-06, SEG-07 | S/M |
| **20 · Higiene de correctitud** | Resolver el bundle de Bajas de correctitud: usuario sin perfil, `email`/`perfil_completo` sobrescribibles, orden determinista, zona horaria de caducidad, imagen huérfana, cota de `cantidad` y aviso de fallo de lote con el producto culpable. | CORR-05…CORR-13 | M |

### 5.b Specs de nuevas funcionalidades (priorizadas por valor/tamaño)

Ideas de producto más allá de arreglar bugs. Estimación **valor** (impacto para el municipio) y **tamaño** (esfuerzo).

| Spec | Objetivo (una frase) | Valor | Tamaño |
| --- | --- | :-: | :-: |
| **Ajuste de inventario tipeado** | Un movimiento de tipo "ajuste" para cuadrar el stock tras un conteo físico, que resuelve por la vía correcta la necesidad legítima detrás de CORR-02 (corregir stock dejando rastro en el kardex). | Alto | S/M |
| **Anulación / reversa de movimientos** | Anular un movimiento errado con un contra-movimiento que revierte el stock sin borrar nada del kardex imborrable. | Alto | M |
| **E2E con Playwright** | Suite E2E de los flujos autenticados (login por rol, registrar movimiento, descargar vale, historial de usuario), que ejercita justo la capa que Vitest no cubre. | Alto | M |
| **Notificaciones de stock bajo / caducidad** | Avisar (in-app o email) cuando un producto cae bajo su mínimo o entra en el umbral de caducidad, en vez de depender de que el admin mire el dashboard. | Medio | M |
| **Exportar reportes** | Exportar el kardex y el dashboard a Excel/CSV/PDF para archivo y rendición de cuentas. | Medio | M |
| **Bitácora de auditoría de acciones admin** | Registrar quién creó/editó/eliminó qué (usuarios, productos, áreas), para trazabilidad administrativa. | Medio | M |
| **Gestión de proveedores en entradas** | Asociar un proveedor y un documento (guía/factura) a las entradas de almacén, hacia órdenes de compra. | Medio | L |
| **Búsqueda y filtros avanzados en Movimientos** | Filtrar el kardex por rango de fechas, tipo, área y producto desde la query (aprovecha la paginación del Spec 16). | Medio | S |

---

## Anexo: metodología y alcance de la auditoría

**Qué se hizo:**
- Lectura de las 21 migraciones aplicadas + `seed.sql`, el Route Handler del vale, las páginas de datos admin/usuario, las Server Actions y los 5 client components admin.
- Ejecución de `mcp__supabase__get_advisors` (seguridad y performance) sobre el proyecto real, e inspección directa de la BD (`pg_proc`, `pg_event_trigger`, `schema_migrations`) para caracterizar el drift.
- Verificación por lectura contra los criterios de aceptación de cada `specs/NN-*.md` (01–09).
- Confirmación puntual de los dos hallazgos más severos contra la documentación oficial de Next 16.2 incluida en `node_modules/next/dist/docs/`.

**Qué NO se hizo (por diseño del spec):**
- Ninguna corrección de código, migración ni configuración: la auditoría es de solo lectura; cada arreglo queda como recomendación.
- Sin smoke test en vivo con sesiones autenticadas reales (sin credenciales de prueba ni navegador en el entorno). Por eso los hallazgos de correctitud citan `archivo:línea` verificables y se frasean como "el código sugiere X, verificar", salvo los confirmados contra documentación.
- Sin auditoría de UX/diseño visual ni de performance de bundle/Core Web Vitals.
- No se montó E2E/Playwright (queda como recomendación en el roadmap).

**Limitación conocida:** al no haber ejecución en vivo, un hallazgo de correctitud podría ser un falso positivo de lectura. Los dos Altos (CORR-01, CORR-02) están confirmados: CORR-01 contra el doc de Next, CORR-02 por lectura directa del `update`. Los Medios y Bajos deben verificarse antes de invertir en su corrección; la evidencia `archivo:línea` de cada uno lo hace directo.

**Severidades:** Crítica = explotable/rompe el sistema en producción ya; Alta = bug real con impacto claro en un flujo principal; Media = divergencia o hueco real con impacto acotado o no alcanzable desde la UI; Baja = higiene, cosmético o borde improbable.
