# Subagentes — descripción

> Qué vas a encontrar en esta carpeta (portable). La lista real del proyecto está en `subagents.md`.

En `subagents.md` encontrarás los **subagentes propios del proyecto**. Cada entrada describe:

- **Referencia** — dónde está definido (`.claude/agents/<nombre>.md`).
- **Qué es / para qué sirve** — la tarea que resuelve.
- **Cuándo usarlo** — los triggers concretos que lo hacen relevante.
- **Herramientas** — las tools a las que tiene acceso.
- **Modelo** — override de modelo / effort, si aplica.
- **Notas / gotchas** — restricciones, aislamiento (worktree), invocación, etc.

Claude Code ya trae subagentes integrados (p. ej. `Explore`, `Plan`, `general-purpose`) disponibles sin crear ninguno; en `subagents.md` van los subagentes **propios** que definas para este proyecto.

## Plantilla — añadir un subagente a `subagents.md`

```markdown
## <nombre>

**Referencia:** `.claude/agents/<nombre>.md`

**Qué es / para qué sirve.** (2–4 frases)

**Cuándo usarlo.** (triggers concretos)

**Herramientas.** (tools permitidas)

**Modelo.** (override de modelo / effort, si aplica)

**Notas / gotchas.** (restricciones, aislamiento, invocación)
```
