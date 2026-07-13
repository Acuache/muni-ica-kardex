# Skills — descripción

> Qué vas a encontrar en esta carpeta (portable). La lista real del proyecto está en `skills.md`.

En `skills.md` encontrarás los **skills instalados**. Cada entrada describe:

- **Referencia** — la ruta de su `SKILL.md` (`.claude/skills/<nombre>/SKILL.md`).
- **Qué es / para qué sirve** — el rol del skill.
- **Cuándo usarlo** — los triggers concretos que lo hacen relevante.
- **Capacidades clave** — lo que permite hacer o cubre.
- **Invocación** — si es automático o manual (`/<nombre>`), con su `argument-hint` / `allowed-tools` si aplican.
- **Notas / gotchas** — convenciones, dependencias y trampas.

Para el modo de invocación de un skill, revisa el frontmatter de su `SKILL.md`.

## Plantilla — añadir un skill a `skills.md`

```markdown
## <nombre>

**Referencia:** `.claude/skills/<nombre>/SKILL.md`

**Qué es / para qué sirve.** (2–4 frases)

**Cuándo usarlo.** (triggers concretos)

**Capacidades clave.**
- …

**Invocación.** (automático / manual `/<nombre>`; `argument-hint` y `allowed-tools` si aplican)

**Notas / gotchas.** (convenciones, dependencias, trampas)
```
