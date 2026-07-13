# Skills del proyecto

> Referencia de los skills instalados en este proyecto. Qué contiene cada entrada y la plantilla para añadir una, en [`descripcion.md`](descripcion.md).

## context-system

**Referencia:** `.claude/skills/context-system/SKILL.md`

**Qué es / para qué sirve.** Monta y mantiene esta misma base de conocimiento (`context-system/`): scaffoldea la estructura en un proyecto nuevo y guía cómo añadir entradas a las listas y cómo documentar bugs no triviales en el registro.

**Cuándo usarlo.** Al crear la estructura en un proyecto nuevo, al añadir un MCP/skill/subagente a las listas, o al documentar un bug con causa raíz real. Triggers: "context-system", "sistema de contexto", "montar la base de contexto", "documentar bug".

**Capacidades clave.**
- Scaffolding de `context-system/` desde sus plantillas (`templates/`).
- Plantillas para documentar MCP, skills, subagentes y bugs.
- Regla de documentación de bugs para el `CLAUDE.md` del proyecto.

**Invocación.** Manual con `/context-system`, o automático cuando se trabaja sobre el sistema de contexto.

**Notas / gotchas.** Los `descripcion.md` son portables: no editarlos con contenido específico del proyecto; lo específico va en los archivos de lista.

## frontend-design

**Referencia:** `.claude/skills/frontend-design/SKILL.md`

**Qué es / para qué sirve.** Guía de diseño visual para construir UI nueva o rediseñar una existente con una identidad propia: dirección estética, tipografía y decisiones deliberadas que no parezcan plantilla genérica.

**Cuándo usarlo.** Al crear páginas o componentes nuevos con peso visual, al definir la dirección estética del proyecto, o al rediseñar una UI que se ve "por defecto".

**Capacidades clave.**
- Proceso en dos pasadas: plan de diseño (tokens de color, tipografía, layout, elemento firma) → crítica contra el brief → construcción.
- Calibración contra los "looks" genéricos de diseño generado por IA para evitarlos.
- Guía de copy/redacción para que el contenido no delate diseño plantilla.

**Invocación.** Automático cuando la tarea es de diseño visual de frontend.

**Notas / gotchas.** Pide anclar el diseño en el dominio real del producto (aquí: un kardex/almacén municipal). Cuidado con especificidades CSS que se cancelan entre secciones.

## vercel-react-best-practices

**Referencia:** `.claude/skills/vercel-react-best-practices/SKILL.md`

**Qué es / para qué sirve.** Guía de optimización de rendimiento para React y Next.js mantenida por Vercel: 70 reglas en 8 categorías priorizadas por impacto (waterfalls, bundle, server, data fetching, re-renders, etc.).

**Cuándo usarlo.** Al escribir, revisar o refactorizar componentes React o páginas Next.js; al implementar data fetching; al optimizar bundle o tiempos de carga.

**Capacidades clave.**
- Prioridad 1–2 (CRÍTICO): eliminar waterfalls (`async-*`) y optimizar bundle (`bundle-*`).
- Prioridad 3–4: rendimiento server-side (`server-*`) y data fetching cliente (`client-*`).
- Prioridad 5–8: re-renders, rendering, JS y patrones avanzados.

**Invocación.** Automático en tareas que tocan código React/Next.js.

**Notas / gotchas.** Combinar con la regla del proyecto: esta versión de Next.js tiene breaking changes — leer `node_modules/next/dist/docs/` antes de escribir código (ver `AGENTS.md`).

## shadcn

**Referencia:** `.claude/skills/shadcn/SKILL.md`

**Qué es / para qué sirve.** Gestiona componentes y proyectos shadcn/ui: añadir, buscar, arreglar, depurar, estilar y componer UI (incluidas interfaces de chat). Aporta contexto del proyecto, documentación de componentes y ejemplos de uso; el código de cada componente se copia como fuente al proyecto vía CLI.

**Cuándo usarlo.** Al trabajar con shadcn/ui, registries de componentes, presets (`--preset`) o cualquier proyecto con `components.json`. Triggers: "shadcn init", "create an app with --preset", "switch to --preset", y en general al construir o modificar UI basada en shadcn.

**Capacidades clave.**
- CLI vía el package runner del proyecto (`npx shadcn@latest`, `pnpm dlx …`, `bunx --bun …`): `search`, `add`, `info --json`, `docs <component>`.
- Reglas siempre aplicadas: `className` solo para layout (no colores/tipografía), `flex` + `gap-*` (nada de `space-x/y-*`), `size-*`, `truncate`, tokens semánticos (sin `dark:` manual ni valores crudos), `cn()` para clases condicionales.
- Principios de composición: reutilizar antes de reinventar, componer piezas existentes, usar variantes integradas.

**Invocación.** Automático (`user-invocable: false`); `allowed-tools` limitado a los runners de shadcn (`npx/pnpm dlx/bunx … shadcn@latest *`).

**Notas / gotchas.** Usar siempre el runner correcto según el `packageManager` del proyecto. Colores semánticos obligatorios (`bg-primary`, `text-muted-foreground`), nunca valores crudos tipo `bg-blue-500`.

## spec

**Referencia:** `.claude/skills/spec/SKILL.md`

**Qué es / para qué sirve.** Diseñador guiado de specs siguiendo el método spec-driven. **No escribe código:** ayuda a clarificar qué se quiere construir, hace preguntas cuando algo está poco definido y desarrolla la spec sección por sección hasta dejarla lista para guardar en `specs/`.

**Cuándo usarlo.** Al arrancar una feature grande, **antes** de escribir código. Argument-hint: descripción o requisito corto de la feature.

**Capacidades clave.**
- Cuatro fases en orden estricto: entender contexto → clarificar con preguntas (en bloques de 3–5) → escribir la spec → guardarla numerada en `specs/`.
- Se apoya en `template.md` (misma carpeta del skill) para la estructura completa.
- Responde en el idioma del prompt inicial y frena features demasiado grandes (si no caben en una frase, sugiere dividir).

**Invocación.** Manual `/spec` (`disable-model-invocation: true`); `argument-hint: 'short feature description or requirement'`.

**Notas / gotchas.** Deliberadamente lento en la fase de definición y rápido al escribir: una spec vaga se paga después en código. Lee la memoria del proyecto (`CLAUDE.md`/`AGENTS.md`/…) y specs previas para heredar convenciones.

## spec-impl

**Referencia:** `.claude/skills/spec-impl/SKILL.md`

**Qué es / para qué sirve.** Implementador de una spec ya aprobada: valida que el estado signifique "Approved" (en cualquier idioma), crea una rama git con el nombre de la spec, cambia a ella y arranca la implementación paso a paso con pausas para revisar diffs.

**Cuándo usarlo.** Una vez que una spec de `specs/` está aprobada y toca implementarla. Argument-hint: `<NN-spec-name>`.

**Capacidades clave.**
- Cuatro fases en orden estricto: identificar la spec → validar estado aprobado → crear/cambiar de rama → implementar por pasos con pausas de revisión.
- Lee `specs/.spec-config.yml` para la config de creación de rama (`AutoCreateBranch`, por defecto `true`).
- Trae contexto de sesión (`git status`, rama actual, specs disponibles) al inicio.

**Invocación.** Manual `/spec-impl` (`disable-model-invocation: true`); `argument-hint: <NN-spec-name>`; `allowed-tools` acotado a git de solo lectura + `cat`/`ls`.

**Notas / gotchas.** Encadena con [`spec`](#spec): sin una spec en estado aprobado no avanza. No salta de fase si la anterior no se completó correctamente.

## supabase

**Referencia:** `.claude/skills/supabase/SKILL.md`

**Qué es / para qué sirve.** Guía de buenas prácticas para cualquier tarea con Supabase: base de datos, Auth, Edge Functions, Realtime, Storage, migraciones e integración SSR (`supabase-js`, `@supabase/ssr`) en Next.js. Aporta un checklist de seguridad específico de Supabase (RLS, JWT, exposición de tablas al Data API, claves) y el reflejo de verificar contra el changelog antes de implementar.

**Cuándo usarlo.** En cualquier trabajo que involucre Supabase: cambios de esquema/migraciones, RLS y policies, login/sesiones/JWT/cookies, Edge Functions, Storage, extensiones Postgres, o el CLI/MCP de Supabase. Triggers: "Supabase", "RLS", "getSession/getUser", "@supabase/ssr", "migración", "auth".

**Capacidades clave.**
- Checklist de seguridad Supabase: RLS obligatorio en esquemas expuestos, `user_metadata` nunca para autorización, `security_invoker` en vistas, `TO authenticated` + predicado de propiedad, `USING` + `WITH CHECK` en UPDATE.
- Reflejo de verificar contra `supabase.com/changelog.md` y docs vigentes antes de implementar (la API cambia entre versiones).
- Verificación post-cambio (correr una query de prueba) y recuperación de errores sin bucles.

**Invocación.** Automático cuando la tarea toca Supabase. Se apoya en el MCP [`supabase`](../all-mcp/mcp.md#supabase) para actuar sobre la instancia real.

**Notas / gotchas.** En Next.js cualquier `NEXT_PUBLIC_*` viaja al navegador: nunca exponer `service_role`/claves secretas en cliente. Combinar con [`supabase-postgres-best-practices`](#supabase-postgres-best-practices) para rendimiento y con la regla del proyecto sobre breaking changes de Next.js.

## supabase-postgres-best-practices

**Referencia:** `.claude/skills/supabase-postgres-best-practices/SKILL.md`

**Qué es / para qué sirve.** Guía de rendimiento y buenas prácticas de Postgres mantenida por Supabase: reglas en 8 categorías priorizadas por impacto, cada una con ejemplos SQL correcto/incorrecto, análisis de plan de consulta y métricas.

**Cuándo usarlo.** Al escribir o revisar queries SQL, diseñar esquemas, crear índices, configurar pooling de conexiones o diagnosticar problemas de rendimiento de la base de datos.

**Capacidades clave.**
- Prioridad 1–3 (CRÍTICO): rendimiento de consultas (`query-`), gestión de conexiones (`conn-`), seguridad y RLS (`security-`).
- Prioridad 4–8: diseño de esquema (`schema-`), concurrencia/locking (`lock-`), patrones de acceso (`data-`), monitoreo (`monitor-`), features avanzadas (`advanced-`).
- Reglas en `references/*.md`: explicación, SQL incorrecto vs. correcto, salida de `EXPLAIN` y notas específicas de Supabase.

**Invocación.** Automático en tareas de queries/esquemas/optimización Postgres.

**Notas / gotchas.** Complementa al skill [`supabase`](#supabase) (que cubre seguridad/Auth/SSR a nivel de plataforma); este se centra en el rendimiento de la capa Postgres.
