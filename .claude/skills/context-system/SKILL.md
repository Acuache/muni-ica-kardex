---
name: context-system
description: Monta y mantiene el "context-system" de un proyecto — una base de conocimiento portable, para Claude y para el equipo, con MCP, skills, subagentes y un registro de bugs. Úsalo para crear la estructura en un proyecto nuevo, añadir entradas a las listas (MCP/skill/subagente) o documentar un bug no trivial. Triggers: "context-system", "sistema de contexto", "montar la base de contexto", "documentar bug".
---

# Context System

Crea y mantiene un `context-system/` en el proyecto: documentación **portable**, para Claude y para el equipo, de lo que hay disponible (MCP, skills, subagentes) y un registro de bugs.

## Estructura

Cada categoría es una carpeta con un `descripcion.md` **portable** (describe qué encontrarás + una plantilla; no explica conceptos ni nombra ítems concretos) y un archivo de **lista** con los ítems reales del proyecto:

```
context-system/
├── README.md
├── all-mcp/         → descripcion.md + mcp.md
├── all-skills/      → descripcion.md + skills.md
├── all-subagents/   → descripcion.md + subagents.md
└── bugs/            → descripcion.md + registro.md
```

Principio: los `descripcion.md` son estables; en el día a día solo cambia `bugs/registro.md`.

## Montar la estructura en un proyecto nuevo

Si el proyecto **no** tiene `context-system/`:

1. Copia el contenido de `templates/` (junto a este `SKILL.md`) a `context-system/` en la raíz del proyecto. Incluye `README.md`, los cuatro `descripcion.md` (portables, se conservan tal cual) y los archivos de lista **stub** (vacíos, listos para llenar).
2. Rellena los archivos de lista con lo que tenga ese proyecto, usando la plantilla del `descripcion.md` de cada carpeta:
   - `all-mcp/mcp.md` — los servidores MCP configurados.
   - `all-skills/skills.md` — los skills instalados.
   - `all-subagents/subagents.md` — los subagentes propios (`.claude/agents/<nombre>.md`).
   - `bugs/registro.md` — arranca vacío.
3. Enlázalo desde el `CLAUDE.md` del proyecto y añade la **regla de documentar bugs** (ver abajo).

## Mantener la estructura

- **Añadir un MCP / skill / subagente**: abre el `descripcion.md` de la carpeta, copia su plantilla al archivo de lista y complétala. Mantén sincronizada cualquier tabla resumen del `CLAUDE.md`.
- **Documentar un bug**: cuando investigues y arregles un bug con **causa raíz real** (no una errata ni un cambio de una línea), añade una entrada en `bugs/registro.md` con la plantilla de `bugs/descripcion.md` y actualiza el índice.

## Regla para el `CLAUDE.md` del proyecto

Incluye un enlace a `context-system/README.md` y esta regla:

> Cuando investigues y arregles un bug con causa raíz real (fallo lógico, runtime incorrecto, race condition, datos mal calculados, error condicional), documenta una entrada en `context-system/bugs/registro.md` siguiendo la plantilla de `bugs/descripcion.md`. No hace falta documentar arreglos triviales (erratas, imports faltantes, errores de una línea, formato).

## Principios

- **Portable**: los `descripcion.md` no explican conceptos ("qué es un MCP/skill/subagente" ya se conoce) ni nombran ítems concretos; describen **qué encontrarás** en el archivo de lista y traen la plantilla. Así se copian a cualquier proyecto.
- **Específico por proyecto**: los archivos de lista (`mcp.md`, `skills.md`, `subagents.md`, `registro.md`) llevan los ítems reales.
- **Un agente, varios subagentes**: la sesión principal de Claude delega en subagentes definidos en `.claude/agents/`.
- **Extensible**: para una categoría nueva, crea `context-system/<categoria>/` con su `descripcion.md` (portable) + archivo de lista, siguiendo el mismo patrón.
