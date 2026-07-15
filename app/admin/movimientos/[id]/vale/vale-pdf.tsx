/**
 * Vale de salida de almacén en PDF (Spec 06).
 *
 * NO lleva `"use client"`: no es React DOM. `@react-pdf/renderer` tiene su
 * propio reconciler y estos `View`/`Text` no son elementos del navegador — el
 * componente solo se renderiza en el servidor con `renderToBuffer`.
 *
 * Fuente Helvetica (la estándar del formato PDF, sin registrar nada): cubre
 * Latin-1, así que los acentos y la ñ se imprimen bien.
 *
 * Solo pinta lo que recibe: los fallbacks y el formato de fecha ya vienen
 * resueltos por `construirDatosVale` (`lib/movimientos/vale.ts`).
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

import type { DatosVale } from "@/lib/movimientos/types"

const TINTA = "#111111"
const TENUE = "#555555"
const LINEA = "#999999"

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: TINTA,
  },

  // Encabezado
  encabezado: {
    borderBottomWidth: 1,
    borderBottomColor: TINTA,
    borderBottomStyle: "solid",
    paddingBottom: 12,
    marginBottom: 20,
    alignItems: "center",
  },
  entidad: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  documento: {
    fontSize: 12,
    marginTop: 4,
    color: TENUE,
  },

  // Folio y fecha, uno a cada lado
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 24,
  },
  folio: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
  },
  fecha: {
    fontSize: 10,
    color: TENUE,
  },

  // Bloque de datos
  datos: {
    borderWidth: 1,
    borderColor: LINEA,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 16,
  },
  fila: {
    flexDirection: "row",
    marginBottom: 10,
  },
  // Última fila del bloque: sin margen para no descuadrar el recuadro.
  filaUltima: {
    flexDirection: "row",
  },
  etiqueta: {
    width: 110,
    color: TENUE,
    fontSize: 10,
  },
  // Columna con el valor de la fila. El `flex: 1` va SIEMPRE aquí y NUNCA en un
  // `Text`: dentro de una columna, `flex: 1` implica `flex-basis: 0`, que anula
  // la altura del texto y lo superpone al de la línea siguiente.
  valorCol: {
    flex: 1,
  },
  valor: {
    fontFamily: "Helvetica-Bold",
  },
  sku: {
    fontSize: 9,
    color: TENUE,
    marginTop: 2,
  },

  // Firmas
  firmas: {
    flexDirection: "row",
    gap: 24,
    marginTop: 56,
  },
  recuadro: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINEA,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 12,
    // Espacio real para firmar sobre el papel.
    height: 118,
  },
  rotulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  lineaFirma: {
    borderBottomWidth: 1,
    borderBottomColor: TINTA,
    borderBottomStyle: "solid",
    marginTop: 42,
  },
  campoFirma: {
    fontSize: 9,
    color: TENUE,
    marginTop: 6,
  },

  pie: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    textAlign: "center",
    fontSize: 8,
    color: TENUE,
  },
})

/**
 * Recuadro de firma: línea para firmar, más nombre y DNI.
 *
 * Quien entrega ya lo sabe el sistema (lo registró), así que su nombre va
 * impreso; quien recibe se identifica al firmar, así que su casilla va en
 * blanco. El DNI siempre se rellena a mano: no lo tenemos.
 */
function RecuadroFirma({
  rotulo,
  nombre,
}: {
  rotulo: string
  nombre?: string
}) {
  return (
    <View style={styles.recuadro}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <View style={styles.lineaFirma} />
      <Text style={styles.campoFirma}>Nombre: {nombre ?? ""}</Text>
      <Text style={styles.campoFirma}>DNI:</Text>
    </View>
  )
}

export function ValePDF({ datos }: { datos: DatosVale }) {
  return (
    <Document
      title={datos.folioTexto}
      author="Municipalidad Provincial de Ica"
      subject="Vale de salida de almacén"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.encabezado}>
          <Text style={styles.entidad}>Municipalidad Provincial de Ica</Text>
          <Text style={styles.documento}>Vale de salida de almacén</Text>
        </View>

        <View style={styles.meta}>
          <Text style={styles.folio}>{datos.folioTexto}</Text>
          <Text style={styles.fecha}>Fecha: {datos.fecha}</Text>
        </View>

        <View style={styles.datos}>
          <View style={styles.fila}>
            <Text style={styles.etiqueta}>Producto</Text>
            <View style={styles.valorCol}>
              <Text style={styles.valor}>{datos.producto}</Text>
              <Text style={styles.sku}>SKU: {datos.sku}</Text>
            </View>
          </View>

          <View style={styles.fila}>
            <Text style={styles.etiqueta}>Cantidad</Text>
            <View style={styles.valorCol}>
              <Text style={styles.valor}>{datos.cantidad}</Text>
            </View>
          </View>

          {/* El motivo es opcional: si no existe, la línea no se imprime. */}
          <View style={datos.motivo ? styles.fila : styles.filaUltima}>
            <Text style={styles.etiqueta}>Área destino</Text>
            <View style={styles.valorCol}>
              <Text style={styles.valor}>{datos.area}</Text>
            </View>
          </View>

          {datos.motivo && (
            <View style={styles.filaUltima}>
              <Text style={styles.etiqueta}>Motivo</Text>
              <View style={styles.valorCol}>
                <Text>{datos.motivo}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.firmas}>
          <RecuadroFirma rotulo="Entregado por" nombre={datos.entregadoPor} />
          <RecuadroFirma rotulo="Recibido por" />
        </View>

        <Text style={styles.pie}>
          {datos.folioTexto} · Documento generado por el sistema de almacén de
          la Municipalidad Provincial de Ica.
        </Text>
      </Page>
    </Document>
  )
}

/**
 * Renderiza el vale a los bytes del PDF. Vive aquí, y no en el Route Handler,
 * porque el JSX pertenece al módulo del componente: `route.ts` no es un `.tsx`
 * y `createElement` no encaja con el tipo que espera `renderToBuffer`.
 */
export function renderVale(datos: DatosVale): Promise<Buffer> {
  return renderToBuffer(<ValePDF datos={datos} />)
}
