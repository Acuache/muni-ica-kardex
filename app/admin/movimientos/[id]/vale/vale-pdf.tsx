/**
 * Vale de salida de almacén en PDF (Spec 06 / 06.1).
 *
 * NO lleva `"use client"`: no es React DOM. `@react-pdf/renderer` tiene su
 * propio reconciler y estos `View`/`Text` no son elementos del navegador — el
 * componente solo se renderiza en el servidor con `renderToBuffer`.
 *
 * Fuente Helvetica (la estándar del formato PDF, sin registrar nada): cubre
 * Latin-1, así que los acentos y la ñ se imprimen bien.
 *
 * Solo pinta lo que recibe: los fallbacks, el formato de fecha y la agrupación
 * por categoría ya vienen resueltos por `construirDatosVale`
 * (`lib/movimientos/vale.ts`). Un vale de un solo producto es un vale con un
 * grupo de un item: mismo componente, sin rama especial.
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
    marginBottom: 20,
  },
  folio: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
  },
  fecha: {
    fontSize: 10,
    color: TENUE,
  },

  // Bloque de datos del documento (área, motivo): son del lote entero.
  datos: {
    borderWidth: 1,
    borderColor: LINEA,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 16,
    marginBottom: 20,
  },
  fila: {
    flexDirection: "row",
    marginBottom: 10,
  },
  filaUltima: {
    flexDirection: "row",
  },
  etiqueta: {
    width: 110,
    color: TENUE,
    fontSize: 10,
  },
  // El `flex: 1` va SIEMPRE en la columna y NUNCA en un `Text`: dentro de una
  // columna, `flex: 1` implica `flex-basis: 0`, que anula la altura del texto.
  valorCol: {
    flex: 1,
  },
  valor: {
    fontFamily: "Helvetica-Bold",
  },

  // Detalle de productos, agrupado en secciones por categoría (Spec 06.1)
  cabecera: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: TINTA,
    borderBottomStyle: "solid",
    paddingBottom: 4,
    marginBottom: 6,
  },
  thFolio: { width: 64, fontSize: 9, color: TENUE, letterSpacing: 0.3 },
  thProducto: { flex: 1, fontSize: 9, color: TENUE, letterSpacing: 0.3 },
  thCantidad: {
    width: 52,
    textAlign: "right",
    fontSize: 9,
    color: TENUE,
    letterSpacing: 0.3,
  },
  seccion: {
    marginBottom: 12,
  },
  categoria: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 5,
    color: TINTA,
  },
  itemFila: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
  },
  itemFolio: {
    width: 64,
    fontSize: 9,
    color: TENUE,
  },
  itemProdCol: {
    flex: 1,
  },
  itemProducto: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  itemSku: {
    fontSize: 8,
    color: TENUE,
    marginTop: 1,
  },
  itemCantidad: {
    width: 52,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },

  // Firmas
  firmas: {
    flexDirection: "row",
    gap: 24,
    marginTop: 40,
  },
  recuadro: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINEA,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 12,
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
      title={`Vale ${datos.loteTexto}`}
      author="Municipalidad Provincial de Ica"
      subject="Vale de salida de almacén"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.encabezado}>
          <Text style={styles.entidad}>Municipalidad Provincial de Ica</Text>
          <Text style={styles.documento}>Vale de salida de almacén</Text>
        </View>

        <View style={styles.meta}>
          <Text style={styles.folio}>Lote {datos.loteTexto}</Text>
          <Text style={styles.fecha}>Fecha: {datos.fecha}</Text>
        </View>

        {/* Datos del documento (del lote entero): área destino y motivo. */}
        <View style={styles.datos}>
          <View style={datos.motivo ? styles.fila : styles.filaUltima}>
            <Text style={styles.etiqueta}>Área destino</Text>
            <View style={styles.valorCol}>
              <Text style={styles.valor}>{datos.area}</Text>
            </View>
          </View>

          {/* El motivo es opcional: si no existe, la línea no se imprime. */}
          {datos.motivo && (
            <View style={styles.filaUltima}>
              <Text style={styles.etiqueta}>Motivo</Text>
              <View style={styles.valorCol}>
                <Text>{datos.motivo}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Detalle de productos: una sección por categoría (Spec 06.1). */}
        <View style={styles.cabecera}>
          <Text style={styles.thFolio}>FOLIO</Text>
          <Text style={styles.thProducto}>PRODUCTO</Text>
          <Text style={styles.thCantidad}>CANT.</Text>
        </View>

        {datos.grupos.map((grupo) => (
          // wrap={false}: una categoría no se parte a mitad entre páginas.
          <View key={grupo.categoria} style={styles.seccion} wrap={false}>
            <Text style={styles.categoria}>{grupo.categoria}</Text>
            {grupo.items.map((item) => (
              <View key={item.folioTexto} style={styles.itemFila}>
                <Text style={styles.itemFolio}>{item.folioTexto}</Text>
                <View style={styles.itemProdCol}>
                  <Text style={styles.itemProducto}>{item.producto}</Text>
                  <Text style={styles.itemSku}>SKU: {item.sku}</Text>
                </View>
                <Text style={styles.itemCantidad}>{item.cantidad}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.firmas}>
          <RecuadroFirma rotulo="Entregado por" nombre={datos.entregadoPor} />
          <RecuadroFirma rotulo="Recibido por" />
        </View>

        <Text style={styles.pie}>
          Lote {datos.loteTexto} · Documento generado por el sistema de almacén
          de la Municipalidad Provincial de Ica.
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
