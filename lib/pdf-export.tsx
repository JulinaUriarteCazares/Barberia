"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 8, fontWeight: "bold", color: "#c2410c" },
  subtitle: { fontSize: 12, marginBottom: 20, color: "#666" },
  section: { marginBottom: 12 },
  label: { fontWeight: "bold", marginBottom: 2 },
  row: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 6 },
  cell: { flex: 1 },
  header: { flexDirection: "row", backgroundColor: "#fff7ed", paddingVertical: 8, fontWeight: "bold" },
});

interface PdfColumn {
  header: string;
  key: string;
  width?: number;
}

export async function exportTableToPdf(
  title: string,
  subtitle: string,
  columns: PdfColumn[],
  rows: Record<string, string>[]
) {
  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.header}>
          {columns.map((col) => (
            <Text key={col.key} style={[styles.cell, col.width ? { flex: col.width } : {}]}>
              {col.header}
            </Text>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {columns.map((col) => (
              <Text key={col.key} style={[styles.cell, col.width ? { flex: col.width } : {}]}>
                {row[col.key] ?? ""}
              </Text>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );

  const blob = await pdf(Doc).toBlob();
  downloadBlob(blob, `${title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}

export async function exportCitaComprobante(cita: {
  id: number | string;
  servicio_nombre: string;
  precio_total: number;
  cliente_nombre: string;
  cliente_email?: string;
  cliente_telefono?: string;
  fecha_hora: string;
  estado?: string;
  notas?: string;
  duracion_total?: number;
}) {
  const Doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Comprobante de Cita</Text>
        <Text style={styles.subtitle}>BarberHost · Referencia #{cita.id}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Servicio</Text>
          <Text>{cita.servicio_nombre}{cita.duracion_total ? ` (${cita.duracion_total} min)` : ""}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Cliente</Text>
          <Text>{cita.cliente_nombre}</Text>
          {cita.cliente_email    && <Text>{cita.cliente_email}</Text>}
          {cita.cliente_telefono && <Text>{cita.cliente_telefono}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Fecha y hora</Text>
          <Text>{new Date(cita.fecha_hora.slice(0, 19)).toLocaleString("es-MX", {
            weekday: "long", year: "numeric", month: "long",
            day: "numeric", hour: "2-digit", minute: "2-digit",
            hour12: false,
          })}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Total pagado</Text>
          <Text>${Number(cita.precio_total).toFixed(2)} MXN</Text>
        </View>

        {cita.estado && (
          <View style={styles.section}>
            <Text style={styles.label}>Estado</Text>
            <Text>{cita.estado}</Text>
          </View>
        )}

        {cita.notas && (
          <View style={styles.section}>
            <Text style={styles.label}>Notas</Text>
            <Text>{cita.notas}</Text>
          </View>
        )}
      </Page>
    </Document>
  );

  const blob = await pdf(Doc).toBlob();
  downloadBlob(blob, `comprobante_${cita.id}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
