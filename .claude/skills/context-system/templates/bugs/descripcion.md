# Bugs — descripción

> Qué vas a encontrar en esta carpeta (portable). El registro real del proyecto está en `registro.md`.

En `registro.md` encontrarás el **registro de bugs no triviales**: un índice (ID, título, estado, fecha) y una entrada por bug con síntoma, causa raíz, investigación, solución, archivos afectados y lección aprendida.

## Qué se documenta

Solo bugs con **causa raíz real** que requieren investigación:
- Fallo lógico o de negocio (corre pero da resultado incorrecto).
- Comportamiento incorrecto en runtime (excepción, estado inconsistente, UI rota).
- Race conditions y problemas de concurrencia/timing.
- Datos mal calculados, corruptos o perdidos.
- Errores que solo aparecen bajo ciertas condiciones (entorno, datos, orden de eventos).

**No** se documentan los triviales: erratas, imports faltantes, errores de compilación de una línea, ajustes de formato.

## Convenciones

- **ID** incremental: `BUG-001`, `BUG-002`, …
- **Estados**: 🔴 Abierto · 🟡 En investigación · 🟢 Resuelto · ⚪ No reproducible
- **Fechas** absolutas en formato `YYYY-MM-DD`.

## Cómo documentar un bug

1. Reserva el siguiente `BUG-NNN` y añade una fila al índice de `registro.md`.
2. Copia la plantilla de abajo en la zona de entradas y complétala mientras investigas (empieza en 🟡 En investigación).
3. Al resolver, rellena **Causa raíz**, **Solución**, **Archivos afectados** y **Prevención / lección**, y pon el estado en 🟢 Resuelto.

## Plantilla de entrada

```markdown
### BUG-NNN — Título del bug

- **Estado:** 🟡 En investigación
- **Fecha:** YYYY-MM-DD
- **Severidad:** Baja | Media | Alta | Crítica

**Síntoma.** Qué se observó y cómo reproducirlo (pasos, entrada, entorno). Incluir el error/mensaje exacto si lo hubo.

**Causa raíz.** El porqué real del fallo, no el síntoma. Qué suposición o condición estaba equivocada.

**Investigación.** Qué se revisó y cómo se aisló el problema (logs, queries, bisección, hipótesis descartadas).

**Solución.** Qué se cambió para arreglarlo.

**Archivos afectados.**
- `ruta/al/archivo.tsx:42`

**Prevención / lección.** Cómo evitar que vuelva a pasar (test, validación, patrón a seguir, regla a añadir a `CLAUDE.md`).

**Referencia.** Commit / branch / PR relacionado (opcional).
```
