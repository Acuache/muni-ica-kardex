# SPEC 10 — Auditoría integral (correctitud, seguridad, escalabilidad, calidad) + roadmap

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 06.1, SPEC 07, SPEC 08, SPEC 09
> **Fecha:** 2026-07-20
> **Objetivo:** Auditar de punta a punta todo lo construido (Specs 01–09) en cuatro dimensiones — correctitud funcional, seguridad, escalabilidad y calidad de código — y producir un informe con hallazgos priorizados por severidad más un roadmap de specs futuros sugeridos (correctivos y de nuevas funcionalidades), sin modificar código ni base de datos.

---

## 1. Por qué existe este spec

Las nueve specs anteriores construyeron el dominio completo (auth, roles, catálogo, áreas,
usuarios, movimientos/kardex, vale PDF, dashboard, historial, y estados de carga/error) de forma
incremental, spec por spec. Ninguna se detuvo a mirar el conjunto: si la RPC de movimientos sigue
siendo atómica bajo concurrencia, si el rol `usuario` de verdad solo ve lo suyo, si las páginas
que cargan todas las filas van a escalar cuando el kardex tenga miles de movimientos, o si hay
deuda de calidad acumulada entre los cinco `-client.tsx` de admin.

Este spec cierra ese hueco: es una **auditoría de solo lectura**. No corrige nada — cada hallazgo
queda documentado con severidad, evidencia y una recomendación de spec futuro. La corrección
concreta (si el usuario la aprueba) se implementa después, en su propia spec, siguiendo el mismo
flujo `/spec` → `/spec-impl` que ya usa el proyecto.

---

## 2. Alcance

**In:**

- Auditoría de las **4 dimensiones** acordadas con el usuario: correctitud funcional, seguridad,
  escalabilidad y calidad de código.
- Cobertura: **Specs 01–09 completas**, incluida la Spec 09 (estados de carga/error/404), asumiendo
  que su rama está commiteada/mergeada al momento de ejecutar `/spec-impl` de esta auditoría.
- Metodología: revisión de código y migraciones (lectura), partiendo de los hallazgos ya relevados
  en la exploración previa a este spec (RPC `registrar_movimiento` / `registrar_movimientos_lote`,
  políticas RLS por tabla, guard del Route Handler del vale PDF, patrón de "cargar todo y filtrar
  en cliente", índices existentes vs. filtros/joins reales, agrupación de lotes y armado del vale),
  ampliada con:
  - una pasada dedicada a **calidad de código**: duplicación entre los 5 `-client.tsx` de admin,
    consistencia de convenciones (manejo de `pending`, errores, nombres) entre specs;
  - el **mapa de cobertura de tests** ya relevado (sin E2E; ninguna server action, ningún Server
    Component async ni `proxy.ts` tienen test) como insumo de la dimensión correctitud/calidad.
- Se ejecutan los **advisors de seguridad y performance de Supabase**
  (`mcp__supabase__get_advisors`) como insumo adicional de las dimensiones seguridad y escalabilidad.
- Cada hallazgo se documenta con: dimensión, severidad (Crítica/Alta/Media/Baja), descripción,
  archivo(s):línea(s) de evidencia, impacto concreto, y recomendación (qué spec futuro lo resolvería).
- **Roadmap de specs futuros**, en dos bloques: (a) specs correctivos derivados de hallazgos,
  priorizados por severidad; (b) specs de nuevas funcionalidades sugeridas — ideas de producto más
  allá de arreglar bugs (p. ej. anulación/reversa de movimientos, exportar reportes, notificaciones
  de stock bajo/caducidad, paginación server-side, E2E con Playwright como spec propio).
- El informe se guarda en `context-system/auditorias/01-informe.md` (se crea la carpeta si no
  existe) y se enlaza desde `context-system/README.md`.

**Fuera de alcance (para specs futuros):**

- **Ninguna corrección de código, migración ni configuración.** Cada arreglo —incluidos los ya
  identificados en la exploración previa: edición manual de `stock_actual` fuera del kardex,
  paginación server-side, índices faltantes, revoke de `mi_area_id()`, orden determinista del
  historial— queda documentado como recomendación, no aplicado aquí.
- **Pruebas E2E (Playwright):** no se instalan ni configuran en esta spec; se documenta como idea
  breve dentro del roadmap de specs futuros, sin detallar su implementación.
- **Smoke test manual con sesiones autenticadas reales:** no se ejecuta un recorrido de clics en
  vivo (sin credenciales de prueba ni herramienta de navegador disponibles en este entorno); la
  dimensión de correctitud se audita releyendo cada `specs/NN-*.md` y verificando por lectura de
  código si sus criterios de aceptación se siguen cumpliendo, no por ejecución en vivo.
- **Auditoría de UX/diseño visual** ni de performance de bundle/Core Web Vitals.

---

## 3. Estructura del informe

Este spec no introduce tablas ni tipos de datos nuevos (es 100% documentación). En su lugar, fija
la estructura fija que debe seguir `context-system/auditorias/01-informe.md`:

```
context-system/auditorias/01-informe.md
├── Resumen ejecutivo (semáforo por dimensión + conteo de hallazgos por severidad)
├── 1. Correctitud funcional (por spec/flujo, contra sus criterios de aceptación)
├── 2. Seguridad (RLS, guards, service role, resultado de los advisors de Supabase)
├── 3. Escalabilidad (índices, N+1, paginación, correlativos)
├── 4. Calidad de código (duplicación, consistencia, cobertura de tests)
├── 5. Roadmap sugerido
│   ├── 5.a Specs correctivos (derivados de hallazgos, priorizados por severidad)
│   └── 5.b Specs de nuevas funcionalidades (ideas de producto)
└── Anexo: metodología y alcance de la auditoría
```

Cada hallazgo individual sigue esta forma fija:

```
### [DIM-NN] Título del hallazgo
- **Severidad:** Crítica | Alta | Media | Baja
- **Evidencia:** archivo(s):línea(s)
- **Impacto:** qué pasa en concreto si no se corrige
- **Recomendación:** spec futuro sugerido (nº + objetivo de una frase)
```

---

## 4. Plan de implementación

1. **Confirmar el estado de la rama y consolidar hallazgos ya relevados.** Verificar que la Spec 09
   esté commiteada/mergeada (si no, anotarlo como advertencia en el informe en vez de bloquear).
   Reutilizar como insumo base lo ya encontrado en la exploración previa a este spec (RPC de
   movimientos, RLS por tabla, guard del vale PDF, patrón de carga total en cliente, índices,
   agrupación de lotes) — no repetir esa exploración desde cero.
2. **Correr `mcp__supabase__get_advisors`** (seguridad y performance) sobre el proyecto real y
   sumar sus hallazgos a las dimensiones correspondientes.
3. **Auditar correctitud funcional, spec por spec (01–09):** releer los criterios de aceptación de
   cada `specs/NN-*.md` y verificar por lectura de código si el estado actual los sigue cumpliendo;
   señalar cualquier divergencia con evidencia.
4. **Auditar calidad de código:** duplicación entre los `-client.tsx` de admin, consistencia de
   convenciones entre specs, cobertura de tests por flujo (con el mapa ya relevado).
5. **Redactar el informe** (`context-system/auditorias/01-informe.md`) siguiendo la estructura de
   la Sección 3, con severidad y recomendación por hallazgo.
6. **Redactar el roadmap** (specs correctivos + specs de nuevas funcionalidades) como sección final
   del informe.
7. **Enlazar el informe** desde `context-system/README.md` y dejar `specs/10-auditoria-integral.md`
   guardado en estado `Draft`.

---

## 5. Criterios de aceptación

- [ ] `context-system/auditorias/01-informe.md` existe y sigue la estructura de la Sección 3.
- [ ] Las 4 dimensiones (correctitud, seguridad, escalabilidad, calidad de código) tienen al menos
      una subsección con hallazgos, o una nota explícita de "sin hallazgos" si no aplica.
- [ ] Cada hallazgo tiene severidad, evidencia (archivo:línea), impacto y recomendación.
- [ ] Se ejecutaron y documentaron los resultados de `mcp__supabase__get_advisors`.
- [ ] El roadmap distingue explícitamente specs correctivos de specs de nuevas funcionalidades,
      cada uno con objetivo de una frase.
- [ ] Ningún archivo de código, migración o configuración fue modificado por esta spec.
- [ ] `context-system/README.md` enlaza al informe.

---

## 6. Decisiones

- **Sí:** entregable = informe + roadmap, sin tocar código (elección del usuario). Evita mezclar
  diagnóstico con corrección; cada arreglo queda revisable por separado, como el resto del roadmap.
- **Sí:** cubre las 4 dimensiones (correctitud, seguridad, escalabilidad, calidad) — auditoría
  completa, no parcial.
- **No:** no se monta E2E/Playwright en esta spec ni se detalla su implementación; queda como idea
  en el roadmap (elección del usuario: "no por ahora").
- **Sí:** se corren los advisors de Supabase como insumo adicional (elección del usuario).
- **Sí:** alcance = todo lo actual incluida Spec 09 (elección del usuario), asumiendo que la rama
  se commitea/mergea antes de auditar.
- **Sí:** el informe vive en `context-system/auditorias/01-informe.md`, separado del spec en sí
  (elección del usuario), análogo a `context-system/bugs/registro.md`.
- **Definición acelerada en Fase 3 (a pedido del usuario):** las 7 secciones se desarrollaron de una
  sola vez, sin confirmación sección-por-sección, reutilizando el 100% de las respuestas ya dadas
  en la Fase 2. Registrado aquí como exige el flujo `/spec` cuando se salta ese paso.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La Spec 09 sigue sin commitear/mergear al momento de correr `/spec-impl` de esta auditoría. | El paso 1 verifica el estado de la rama antes de auditar; si Spec 09 no está integrada, se anota como advertencia en el informe en vez de bloquear el resto de la auditoría. |
| Sin smoke test en vivo, algún hallazgo de "correctitud" puede ser un falso positivo de lectura de código. | Cada hallazgo de correctitud cita el archivo/línea exacto para que sea verificable por el usuario; el informe no afirma "está roto", sino "el código sugiere X, verificar". |
| El roadmap resultante puede ser largo y disperso. | Se prioriza explícitamente (severidad para specs correctivos, valor/tamaño estimado para specs de features) para que el usuario pueda elegir por dónde seguir. |
