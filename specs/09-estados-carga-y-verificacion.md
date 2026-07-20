# SPEC 09 — Estados de carga, error y 404 + verificación integral

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 06.1, SPEC 07, SPEC 08
> **Fecha:** 2026-07-20
> **Objetivo:** Añadir estados de carga (spinner a nivel de ruta y dentro de los botones), páginas de error y de 404 en toda la app, y verificar de punta a punta que todo lo ya construido sigue funcionando.

---

## 1. Por qué existe este spec

Las ocho specs anteriores construyeron el dominio: catálogo, kardex, vale, dashboard, historial. Pero ninguna se ocupó de **cómo se siente la app mientras trabaja**. Hoy las **10 páginas son Server Components `async`** que leen de Supabase con `Promise.all`; al navegar entre ellas, Next espera a que el fetch del servidor resuelva y **no muestra ninguna señal**: la pantalla anterior se queda congelada hasta que la nueva está lista. No existe **ningún** `loading.tsx`, `error.tsx` ni `not-found.tsx` en todo `app/`.

En las mutaciones el hueco es parecido pero menor: los formularios y acciones ya exponen un `pending` (`useTransition` / `useActionState`), pero el único feedback es **deshabilitar el botón y cambiar su texto** ("Guardando…"). No hay ni un spinner en toda la aplicación; shadcn `skeleton` no está instalado.

Este spec cierra ese hueco de UX con piezas que son, en su mayoría, **convenciones de archivo de Next 16** (`loading.tsx`, `error.tsx`, `not-found.tsx`) más un único componente `Spinner` reutilizable. No toca dominio, datos ni RLS. Y como es el primer spec transversal a toda la app, aprovecha para **verificar de punta a punta** que las ocho specs siguen funcionando (un recorrido de humo por las 10 rutas + `lint` + `test`), sin convertirse en una auditoría de código (eso sería otro spec).

**Decisión de forma tomada con el usuario (Fase 2 de `/spec`, cuatro preguntas cerradas):**

1. **Ambos** indicadores: `loading.tsx` de ruta **y** spinner en botones.
2. **Spinner genérico centrado**, no skeletons que imitan el layout de cada página.
3. **Sí** a `error.tsx` + `not-found.tsx`.
4. Verificación = **checklist de humo por ruta + `lint`/`test`** (no auditoría a fondo).

---

## 2. Alcance

**In:**

- **Componente `Spinner`** (`components/ui/spinner.tsx`): un ícono remixicon (`RiLoader4Line`) con `animate-spin`, tamaño vía `className` (default `size-4`). Marcado `aria-hidden` para uso decorativo dentro de botones. Es la única primitiva visual nueva.
- **Componente `LoadingScreen`** (`components/loading-screen.tsx`): contenedor centrado (`flex items-center justify-center`, `min-h`) con un `Spinner` grande y un texto "Cargando…", con `role="status"`. Es lo que renderizan los `loading.tsx`.
- **Tres `loading.tsx` de ruta**, cada uno renderiza `<LoadingScreen />`:
  - `app/loading.tsx` — cubre `/`, `/login`, `/completar-perfil` (páginas bajo el layout raíz sin loading propio).
  - `app/admin/loading.tsx` — cubre las 6 páginas admin; el sidebar del `admin/layout.tsx` **persiste** y el spinner aparece solo en el área de contenido.
  - `app/usuario/loading.tsx` — cubre `/usuario/dashboard`; el header del `usuario/layout.tsx` persiste.
- **Componente `ErrorState`** (`components/error-state.tsx`, `"use client"`): UI reutilizable de error con mensaje amable, y un botón **"Reintentar"** que llama a `reset()`. Registra el error en consola vía `useEffect`.
- **Tres `error.tsx`** (Client Components, cada uno un envoltorio delgado que renderiza `<ErrorState error={error} reset={reset} />`):
  - `app/error.tsx` — captura errores de las páginas raíz/auth y actúa de fallback.
  - `app/admin/error.tsx` — captura errores de las páginas admin **conservando el sidebar**.
  - `app/usuario/error.tsx` — captura errores del historial de usuario.
- **Una `not-found.tsx`** raíz (`app/not-found.tsx`): página 404 global con mensaje "Página no encontrada" y un enlace de vuelta (a `/`, que ya redirige por rol). Cubre URLs inexistentes y cualquier `notFound()` futuro.
- **Spinner en los botones con `pending`**: en los **7** componentes cliente que hoy solo cambian de texto, anteponer `<Spinner />` cuando `pending` es true, **manteniendo** el `disabled={pending}` y el texto ("Guardando…", "Registrando…", "Ingresando…", etc.):
  - `app/login/login-form.tsx`, `app/completar-perfil/completar-perfil-form.tsx`
  - `app/admin/areas/areas-client.tsx`, `app/admin/categorias/categorias-client.tsx`, `app/admin/usuarios/usuarios-client.tsx`, `app/admin/productos/productos-client.tsx`, `app/admin/movimientos/movimientos-client.tsx`
  - Incluye los botones destructivos que ya se deshabilitan con `pending` (p. ej. `AlertDialogAction` de eliminar en usuarios/áreas/productos).
- **Tests Vitest** (junto al código): render de `Spinner` (aplica `animate-spin`), `LoadingScreen` (muestra el texto y el `role="status"`) y `ErrorState` (muestra el mensaje y el botón "Reintentar" invoca `reset`).
- **Verificación integral (paso final)**: `npm run lint` + `npm test` + recorrido de humo manual por las 10 rutas con las 3 sesiones (superadmin/admin/usuario), comprobando carga, error y 404. Documentado como checklist en los criterios de aceptación.

**Fuera de alcance (para specs futuros):**

- **Skeletons que imitan el layout** de cada página (tabla, tarjetas, formulario). Se descartó a favor del spinner genérico centrado; si más adelante se quiere un loading más fiel, va en su propio spec.
- **`global-error.tsx`** (captura errores del propio `app/layout.tsx`). Los `error.tsx` de segmento cubren las páginas que hacen fetch, que es donde ocurren los errores reales; el layout raíz casi no tiene lógica que falle.
- **`error.tsx` / `not-found.tsx` por segmento** más allá de los indicados (p. ej. un 404 propio de `/admin`). El 404 raíz basta.
- **Barras de progreso de navegación** (estilo `nprogress` en el top) y **transiciones de página** animadas.
- **Auditoría a fondo** de la lógica, RLS o datos de las 8 specs. La verificación aquí es un recorrido de humo, no una revisión de código ni de seguridad.
- **Reintentos automáticos** de fetch, **timeouts** o **estados offline**. `ErrorState` solo ofrece un "Reintentar" manual.
- **Optimistic UI** en las mutaciones. Se mantiene el patrón `pending` + `router.refresh()` actual, solo se le añade el spinner.

---

## 3. Modelo de datos

Este spec **no introduce estructuras de datos nuevas** ni toca Supabase (tablas, RLS, funciones). Todo es UI y convenciones de archivo de Next 16. Reusa el `Button` (`components/ui/button.tsx`), `tw-animate-css` (ya importado en `globals.css`) y el set de íconos **remixicon** ya presente.

Formas tentativas (se ajustan al implementar, consultando **context7**):

```tsx
// components/ui/spinner.tsx — import de ícono según la convención existente del repo
export function Spinner({ className }: { className?: string }) {
  return <RiLoader4Line aria-hidden className={cn("size-4 animate-spin", className)} />
}
```

```tsx
// app/admin/error.tsx — error.tsx es SIEMPRE Client Component en Next
"use client"
export default function AdminError({ error, reset }:
  { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} />
}
```

```tsx
// Botón con spinner: se antepone al texto que ya existe, sin quitar el disabled
<Button type="submit" disabled={pending}>
  {pending && <Spinner />}
  {pending ? "Guardando…" : "Guardar"}
</Button>
```

---

## 4. Plan de implementación

Cada paso deja la app corriendo (`npm run dev`) y es commit-eable por separado. Durante `/spec-impl` se consulta **context7** antes de escribir el código de Next 16 (contrato de `loading.tsx`, `error.tsx` como Client Component con props `error`/`reset`, `not-found.tsx` y comportamiento del boundary de carga ante cambios de `searchParams`) y de shadcn/remixicon (spinner).

1. **Primitiva `Spinner` + `LoadingScreen` + tests.** Crear `components/ui/spinner.tsx` y `components/loading-screen.tsx` de §3. *Test:* `spinner.test.tsx` verifica que el `svg` lleva `animate-spin`; `loading-screen.test.tsx` verifica el texto "Cargando…" y `role="status"`. `npm run lint` y `npm test` pasan; ambos componentes existen.

2. **`loading.tsx` de ruta.** Crear `app/loading.tsx`, `app/admin/loading.tsx` y `app/usuario/loading.tsx`, cada uno renderizando `<LoadingScreen />`. *Test:* con `npm run dev`, navegar entre páginas admin muestra el spinner centrado en el área de contenido mientras el sidebar sigue visible; entrar a `/usuario/dashboard` muestra el spinner bajo el header; el arranque en `/login` lo muestra brevemente.

3. **`ErrorState` + `error.tsx` de segmento + test.** Crear `components/error-state.tsx` (`"use client"`, mensaje + botón "Reintentar" que llama `reset`, log en `useEffect`) y los tres `error.tsx` (`app/error.tsx`, `app/admin/error.tsx`, `app/usuario/error.tsx`) que lo envuelven. *Test:* `error-state.test.tsx` renderiza el mensaje y comprueba que el click en "Reintentar" invoca el `reset` pasado por prop; forzar un throw temporal en una página admin muestra el `ErrorState` con el sidebar intacto y "Reintentar" recarga.

4. **`not-found.tsx` raíz.** Crear `app/not-found.tsx` con el mensaje "Página no encontrada" y un enlace a `/`. *Test:* visitar una URL inexistente (p. ej. `/admin/no-existe`) muestra la página 404 con el enlace de vuelta funcionando.

5. **Spinner en los botones de auth.** Editar `app/login/login-form.tsx` y `app/completar-perfil/completar-perfil-form.tsx`: anteponer `<Spinner />` cuando `pending`, manteniendo texto y `disabled`. *Test:* al enviar el login, el botón muestra el spinner + "Ingresando…" y queda deshabilitado hasta resolver.

6. **Spinner en los botones de los clientes admin.** Editar `areas-client.tsx`, `categorias-client.tsx`, `usuarios-client.tsx`, `productos-client.tsx` y `movimientos-client.tsx`: spinner en el botón de guardar/registrar y en los botones destructivos que ya gatean con `pending`. *Test:* guardar una categoría, registrar un movimiento y eliminar un área muestran spinner mientras `pending`; el resto del flujo (`router.refresh()`) sigue igual.

7. **Verificación integral.** `npm run lint` y `npm test`. Recorrido de humo manual con las tres sesiones: superadmin y admin recorren las 6 páginas admin (dashboard con selector 7/30/90, categorías, áreas, usuarios, productos, movimientos con filtro `?producto=`) viendo el spinner de ruta en cada navegación; el usuario ve su historial; se prueba una URL inexistente (404) y se fuerza un error para ver `error.tsx`. *Test:* se cumplen todos los criterios de aceptación.

---

## 5. Criterios de aceptación

- [x] Existe un componente `Spinner` reutilizable (`components/ui/spinner.tsx`) con `animate-spin`.
- [x] Al navegar entre páginas admin, aparece un spinner centrado en el área de contenido y el **sidebar permanece visible** (fallback de `app/admin/loading.tsx`).
- [x] Al entrar a `/usuario/dashboard`, aparece el spinner bajo el header del layout de usuario.
- [x] Las páginas raíz/auth (`/`, `/login`, `/completar-perfil`) muestran el fallback de `app/loading.tsx` durante la carga.
- [x] Cada uno de los **7** componentes cliente con `pending` muestra un spinner **dentro del botón** mientras envía, sin perder el `disabled` ni el cambio de texto actual.
- [x] Los botones destructivos que ya se deshabilitaban con `pending` (eliminar en usuarios/áreas/productos) también muestran el spinner.
- [x] Un error de render/datos en una página admin muestra `ErrorState` con el mensaje y un botón **"Reintentar"** que llama `reset()`, conservando el sidebar.
- [x] Un error en el historial de usuario y en las páginas raíz/auth también muestra `ErrorState` (vía `app/usuario/error.tsx` y `app/error.tsx`).
- [x] Visitar una URL inexistente muestra `app/not-found.tsx` con un enlace de vuelta que funciona.
- [x] `Spinner`, `LoadingScreen` y `ErrorState` tienen tests unitarios (Vitest): el spinner aplica `animate-spin`, `LoadingScreen` expone `role="status"` y su texto, y "Reintentar" invoca `reset`.
- [x] El recorrido de humo por las 10 rutas con las 3 sesiones no muestra errores en consola y cada navegación exhibe su estado de carga.
- [x] Ninguna funcionalidad previa se rompe: catálogo, movimientos, vale PDF, dashboard e historial siguen operando igual.
- [x] `npm run lint` y `npm test` pasan.

---

## 6. Decisiones

- **Sí:** **spinner genérico centrado** para el loading de ruta, no skeletons por página. Decidido en Fase 2: menos trabajo y mantenimiento, y el usuario prefirió una señal simple y uniforme sobre réplicas del layout de cada pantalla.
- **Sí:** **un solo `Spinner`** reutilizable en `components/ui/`, consumido por `LoadingScreen` (rutas) y por los botones. Una sola fuente para el estilo del spinner; si cambia, cambia en un sitio.
- **Sí:** **remixicon `RiLoader4Line` + `animate-spin`**, no instalar el `skeleton` de shadcn. El proyecto ya usa remixicon y `tw-animate-css`/Tailwind v4 traen `animate-spin`; añadir el skeleton no aporta porque no se usan skeletons.
- **Sí:** **`loading.tsx` a nivel de segmento** (`admin`, `usuario`, raíz), no uno por página. Con spinner genérico, tres archivos cubren las 10 rutas; colocarlos bajo cada layout hace que el sidebar/header persista y el spinner aparezca solo en el contenido, que es el efecto natural buscado.
- **No:** **skeletons que imitan el layout**. Se documenta como fuera de alcance por si en el futuro se quiere un loading más fiel.
- **Sí:** **`error.tsx` en `admin` y `usuario`** además del raíz. El de segmento conserva el layout (sidebar) mientras muestra el error; el raíz cubre las páginas auth y sirve de fallback.
- **No:** **`global-error.tsx`**. Captura fallos del propio layout raíz, que casi no tiene lógica; los `error.tsx` de segmento cubren donde de verdad ocurren los errores (los fetch a Supabase). Se documenta como fuera de alcance.
- **Sí:** **`ErrorState` con "Reintentar"** que llama `reset()`. Es el patrón de recuperación de Next: reintentar el render del segmento sin recargar toda la app.
- **Sí:** **una sola `not-found.tsx` raíz**. Un 404 global cubre URLs erróneas; no hay segmentos con `[id]` de página que necesiten un 404 propio (el vale PDF es un Route Handler con su guard, no una página).
- **Sí:** **mantener el texto del botón** ("Guardando…") y solo **anteponer** el spinner. No se rompe el patrón existente; el spinner es aditivo y el `disabled={pending}` sigue igual.
- **No:** **cambiar el patrón de mutación** (`useTransition`/`useActionState` + `router.refresh()`) por optimistic UI. Solo se le añade feedback visual; reescribir el flujo sería otro spec.
- **Sí:** **verificación = recorrido de humo + `lint`/`test`**, no auditoría. Decidido en Fase 2: confirmar que lo construido funciona y que el loading no rompe nada, sin abrir una revisión de lógica/RLS que merecería su propio spec.
- **Sí:** **tests solo de los componentes cliente** (`Spinner`, `LoadingScreen`, `ErrorState`). Vitest no prueba Server Components `async` ni las convenciones de archivo de ruta (`loading.tsx`/`error.tsx`/`not-found.tsx`), que se validan en el recorrido manual.
- **Definición redactada de una vez (modo plan):** la Fase 2 de `/spec` se completó (cuatro decisiones cerradas en un bloque), pero el documento se redactó completo para revisarlo al final vía la aprobación del plan, como en los Specs 06.1, 07 y 08.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El boundary de `loading.tsx` **no** se dispara en cambios de solo `searchParams` (dashboard `?dias=`, kardex `?producto=`), y la navegación se sentiría congelada. | Se verifica el comportamiento real de Next 16 con **context7** en `/spec-impl`; si no muestra el fallback, esos controles (`rango-selector.tsx`, filtro de movimientos) ya reciben feedback por el patrón `pending` existente. No se rompe nada, a lo sumo falta pulido, y se anota. |
| `error.tsx` debe ser Client Component; olvidarlo o mal tipar `error`/`reset` rompe el build. | Se consulta el contrato exacto en **context7** antes de escribir; los tres archivos son envoltorios triviales de `ErrorState`, con la firma verificada. |
| El spinner dentro del `Button` hereda estilos raros del `[&_svg]` del botón (tamaño/opacidad). | El `Button` ya fuerza `[&_svg]:size-4`; el `Spinner` respeta ese tamaño salvo override por `className`. Un test de render y la pasada manual lo confirman. |
| Añadir `loading.tsx` raíz provoca un flash de spinner molesto en páginas que cargan al instante (auth). | El fallback solo aparece si el render suspende; en cargas rápidas es imperceptible. Si molesta, el `app/loading.tsx` raíz es opcional y se puede retirar sin afectar admin/usuario. |
| Forzar un error para probar `error.tsx` deja código de prueba colado en un commit. | El throw de prueba es temporal y manual durante la verificación; no se commitea. Un criterio de aceptación exige que nada previo se rompa. |

---

## 8. Lo que **no** entra en este spec

- **Skeletons que imitan el layout** de cada página.
- **`global-error.tsx`** y `error.tsx`/`not-found.tsx` por segmento más allá de los indicados.
- **Barra de progreso** de navegación y **transiciones de página** animadas.
- **Auditoría a fondo** de lógica, RLS, seguridad o datos de las 8 specs (aquí solo hay recorrido de humo).
- **Reintentos automáticos, timeouts, estado offline** y **optimistic UI**.

Cada uno, cuando llegue, va en su propio spec.
