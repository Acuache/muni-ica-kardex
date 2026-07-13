# MCP del proyecto

> Servidores MCP disponibles en este proyecto. Qué contiene cada entrada y la plantilla para añadir una, en [`descripcion.md`](descripcion.md).

## context7

**Qué es / para qué sirve.** Servidor de documentación actualizada de librerías y frameworks. Devuelve docs y ejemplos de código vigentes de la versión real que usa el proyecto, evitando respuestas basadas en datos de entrenamiento desactualizados.

**Herramientas clave.** `resolve-library-id` (resuelve el nombre de la librería a un ID `/org/project`), `query-docs` (consulta la documentación con la pregunta completa).

**Cuándo usarlo.** Siempre que se pregunte por sintaxis de API, configuración, migración de versión, setup o debugging específico de una librería/framework (Next.js, React, Tailwind, Prisma, etc.) — incluso las conocidas. Especialmente relevante aquí: este proyecto usa una versión de Next.js con breaking changes (ver `AGENTS.md`). No usarlo para refactors, lógica de negocio ni conceptos generales de programación.

**Notas / configuración.** Scope **usuario** (global, en `~/.claude.json`), tipo HTTP contra `https://mcp.context7.com/mcp` con API key en cabecera. Flujo: primero `resolve-library-id`, luego `query-docs` con la pregunta completa (una consulta por concepto). Hay una regla global del usuario en `~/.claude/rules/context7.md` que refuerza su uso.

## supabase

**Qué es / para qué sirve.** Servidor MCP oficial de Supabase conectado al proyecto Supabase de este repo. Da a Claude acceso directo al backend (base de datos, esquema, migraciones, logs, etc.) para trabajar contra la instancia real en lugar de a ciegas.

**Herramientas clave.** Tools `mcp__supabase__*` (se cargan bajo demanda vía `ToolSearch`): autenticación (`authenticate`, `complete_authentication`) y, una vez autenticado, gestión de base de datos, esquema/migraciones, Edge Functions y consulta de logs.

**Cuándo usarlo.** En cualquier tarea que toque el backend Supabase: cambios de esquema/migraciones, consultas a la BD, RLS/policies, auth, Edge Functions, Storage o revisión de logs. Combínalo con el skill [`supabase`](../all-skills/skills.md#supabase) (buenas prácticas) y [`supabase-postgres-best-practices`](../all-skills/skills.md#supabase-postgres-best-practices) (rendimiento Postgres).

**Notas / configuración.** Scope **proyecto** (`.mcp.json` en la raíz), tipo HTTP contra `https://mcp.supabase.com/mcp?project_ref=bvjfzwbrzgqlgxzfjnjc`. Requiere autenticación interactiva (puede no estar disponible en ejecuciones headless/cron). Las tools no aparecen listadas de inicio: búscalas con `ToolSearch` (p. ej. `select:mcp__supabase__...`) antes de llamarlas.
