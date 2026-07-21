# Context System

Base de conocimiento del proyecto, **para Claude y para el equipo**. Reúne en un solo sitio lo que Claude necesita saber para trabajar bien aquí (qué skills y MCP hay disponibles, cómo se documentan los bugs, etc.), de forma **portable**: la estructura se reutiliza en otros proyectos aunque cambien los contenidos.

## Estructura y convención

Cada categoría es una **carpeta con 2 archivos**:

- **`descripcion.md`** — describe **qué encontrarás** en la categoría (los campos de cada entrada) + la plantilla para mantenerla. **Portable**: no explica conceptos ni nombra los ítems concretos del proyecto → se copia tal cual a otros proyectos.
- **archivo de lista** (`mcp.md`, `skills.md`, `registro.md`) — lo **específico de este proyecto**: los ítems reales. Se rehace en cada proyecto.

```
context-system/
├── README.md            ← este manual
├── all-mcp/
│   ├── descripcion.md   ← qué encontrarás + plantilla (portable)
│   └── mcp.md           ← MCP de este proyecto
├── all-skills/
│   ├── descripcion.md   ← qué encontrarás + plantilla (portable)
│   └── skills.md        ← skills de este proyecto
├── all-subagents/
│   ├── descripcion.md   ← qué encontrarás + plantilla (portable)
│   └── subagents.md     ← subagentes de este proyecto
├── bugs/
│   ├── descripcion.md   ← qué encontrarás + criterio + plantilla (portable)
│   └── registro.md      ← bugs reales de este proyecto
└── auditorias/
    └── 01-informe.md    ← auditoría integral (Spec 10): hallazgos + roadmap
```

Principio: **las `descripcion.md` son estables; los archivos de lista son lo que cambia.** En el día a día, el único que se actualiza con frecuencia es `bugs/registro.md`.

## Cómo se usa

- **Claude** lo consulta como contexto: antes de tocar una parte del stack revisa el skill/MCP relevante, y **documenta cada bug no trivial** en `bugs/registro.md`. Por eso el `CLAUDE.md` del proyecto enlaza a este sistema y recoge la regla de documentar bugs (así Claude "recuerda" hacerlo).
- **El equipo** lo lee como documentación viva del proyecto.

## Auditorías

Revisiones integrales del proyecto (correctitud, seguridad, escalabilidad, calidad de código), de alcance amplio y análogas a `bugs/registro.md`. Viven en `auditorias/`:

- [Informe de auditoría integral — Spec 10](auditorias/01-informe.md) — 33 hallazgos priorizados por severidad (0 críticos · 2 altos · 7 medios · 24 bajos) sobre las Specs 01–09, más un roadmap de specs correctivos y de nuevas funcionalidades. Solo lectura: no modificó código ni BD.

## Cómo recrearlo en un proyecto nuevo (plano)

1. Copia la carpeta `context-system/` al nuevo proyecto.
2. **Conserva los `descripcion.md`** (son portables, no dependen del proyecto).
3. **Vacía/rehaz los archivos de lista** (`mcp.md`, `skills.md`, `subagents.md`, `registro.md`) con lo que tenga ese proyecto. Los MCP, skills y subagentes concretos **no tienen que ser los mismos**.
4. Enlaza `context-system/README.md` desde el `CLAUDE.md` del nuevo proyecto e incluye la regla de documentar bugs.
5. (Opcional) Añade nuevas categorías siguiendo el mismo patrón (`<categoria>/descripcion.md` + archivo de lista).

## Qué más puedes colocar

Categorías adicionales útiles a medida que el proyecto crece (mismo patrón carpeta + `descripcion.md` + lista):

- **Convenciones de código** — naming, estructura de carpetas, estilo, patrones a seguir/evitar.
- **Arquitectura y decisiones (ADR)** — decisiones técnicas con su porqué y alternativas descartadas.
- **Glosario del dominio** — términos del negocio (para un almacén: SKU, stock, lote, kardex…).
- **Modelo de datos** — entidades, tablas y relaciones.
- **Flujos / comandos** — cómo correr, testear y desplegar.
- **Testing** — estrategia y convenciones de pruebas.
- **Seguridad** — checklist y políticas (RLS, roles, secretos).
- **Onboarding** — cómo arrancar el proyecto desde cero.
- **Variables de entorno** — qué significa cada una (sin secretos).

## Skill asociado

Este sistema se monta y mantiene con el skill **`context-system`** de Claude Code (en `.claude/skills/context-system/`). Invócalo con `/context-system` (o Claude lo usa cuando trabajas sobre el sistema de contexto): scaffoldea esta estructura y guía cómo añadir entradas y documentar bugs.
