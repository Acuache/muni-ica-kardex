# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Sobre este proyecto

`muni-ica-kardex` — aplicación de **kardex / almacén** para la Municipalidad de Ica. Hoy es un scaffold recién generado con `create-next-app` (App Router); la lógica de dominio (SKU, stock, lotes, movimientos de kardex) todavía no está construida.

Stack: **Next.js 16.2.10**, **React 19.2.4**, **TypeScript 5** (strict), **Tailwind CSS v4**. Sin capa de datos, tests ni autenticación aún.

## Comandos

```bash
npm run dev      # servidor de desarrollo (http://localhost:3000)
npm run build    # build de producción
npm run start    # sirve el build de producción
npm run lint     # ESLint (eslint-config-next: core-web-vitals + typescript)
```

No hay framework de tests configurado todavía. Si vas a añadir uno, documéntalo aquí.

## ⚠️ Regla obligatoria: consultar context7 ANTES de escribir código

**Antes de escribir o modificar cualquier código que use una librería, framework, SDK, API o CLI** (Next.js, React, Tailwind, Supabase, TypeScript, etc. — incluso las que crees conocer), **consulta primero el MCP `context7`**. Tu conocimiento previo puede estar desactualizado; esta es una obligación, no una sugerencia.

Flujo (detalle en [`context-system/all-mcp/mcp.md`](context-system/all-mcp/mcp.md)):

1. `resolve-library-id` con el nombre de la librería → obtén el ID `/org/project`.
2. `query-docs` con ese ID y tu pregunta completa (una consulta por concepto).
3. Escribe el código basándote en la documentación devuelta.

Especialmente crítico aquí: esta versión de **Next.js tiene breaking changes** (ver `AGENTS.md`) y **Supabase cambia con frecuencia** entre versiones. No usar context7 para refactors puros, lógica de negocio ni conceptos generales de programación.

## Arquitectura y convenciones

- **App Router** en `app/` (`layout.tsx`, `page.tsx`, `globals.css`). No hay carpeta `pages/`; todo va bajo `app/`.
- **Alias de import** `@/*` → raíz del repo (ver `tsconfig.json`). Usa `@/app/...`, `@/components/...` en vez de rutas relativas largas.
- **Tailwind v4 con config CSS-first**: no hay `tailwind.config`. Los tokens de tema se declaran en `app/globals.css` dentro de `@theme inline` (colores `--background`/`--foreground`, fuentes Geist). Se engancha vía `@tailwindcss/postcss` en `postcss.config.mjs`. Para añadir tokens, edita `globals.css`, no busques un archivo de config.
- **`next.config.ts`** está vacío (solo el objeto `NextConfig`): añade aquí cualquier configuración de Next.
- **⚠️ Next.js con breaking changes** (ver `AGENTS.md`): esta versión difiere de tu conocimiento previo. Antes de escribir código de Next, lee la guía correspondiente en `node_modules/next/dist/docs/`.

## Skills, subagentes y MCP disponibles

Base de conocimiento completa en [`context-system/README.md`](context-system/README.md). Resumen:

**Skills** (`.claude/skills/<nombre>/SKILL.md` — detalle en [`context-system/all-skills/skills.md`](context-system/all-skills/skills.md)):

| Skill | Invocación | Para qué |
|-------|-----------|----------|
| `context-system` | `/context-system` | Monta/mantiene esta base de conocimiento y el registro de bugs. |
| `spec` | `/spec` | Diseñador guiado de specs (antes de codear una feature grande); las guarda en `specs/`. |
| `spec-impl` | `/spec-impl <NN-nombre>` | Implementa una spec **aprobada**: crea rama git y avanza por pasos con pausas de revisión. |
| `frontend-design` | automático | Dirección de diseño visual para UI nueva o rediseños con identidad propia. |
| `shadcn` | automático | Gestiona componentes shadcn/ui (añadir, buscar, componer, estilar). |
| `vercel-react-best-practices` | automático | Reglas de rendimiento React/Next.js de Vercel (waterfalls, bundle, re-renders). |
| `supabase` | automático | Buenas prácticas Supabase (BD, Auth, RLS, Edge Functions, SSR) + checklist de seguridad. |
| `supabase-postgres-best-practices` | automático | Rendimiento Postgres: queries, índices, conexiones, esquema (8 categorías por impacto). |

**Subagentes**: aún no hay subagentes propios (`.claude/agents/` no existe). Al crearlos, documéntalos en [`context-system/all-subagents/subagents.md`](context-system/all-subagents/subagents.md).

**MCP** (detalle en [`context-system/all-mcp/mcp.md`](context-system/all-mcp/mcp.md)):

| MCP | Para qué |
|-----|----------|
| `context7` | Documentación vigente de librerías/frameworks. Flujo: `resolve-library-id` → `query-docs`. Úsalo antes de escribir código de cualquier librería (especialmente Next.js, por los breaking changes). |
| `supabase` | Acceso directo al backend Supabase del proyecto (BD, esquema, migraciones, logs). Scope proyecto (`.mcp.json`); tools `mcp__supabase__*` bajo demanda vía `ToolSearch`; requiere auth interactiva. |

## Registro de bugs

Cuando investigues y arregles un bug con **causa raíz real** (fallo lógico, runtime incorrecto, race condition, datos mal calculados, error condicional), documenta una entrada en [`context-system/bugs/registro.md`](context-system/bugs/registro.md) siguiendo la plantilla de `bugs/descripcion.md`. No hace falta documentar arreglos triviales (erratas, imports faltantes, errores de una línea, formato).
