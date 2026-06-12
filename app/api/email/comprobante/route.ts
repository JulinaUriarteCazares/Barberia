import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, cita, stripe_data } = body;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY no configurado" }, { status: 500 });
    }

    const nombre    = cita?.cliente_nombre  ?? stripe_data?.customer_name  ?? "Cliente";
    const email     = to ?? cita?.cliente_email ?? stripe_data?.customer_email;
    const servicio  = cita?.servicio_nombre ?? "Servicio";
    const fecha     = cita?.fecha_hora
      ? new Date(String(cita.fecha_hora).slice(0, 19)).toLocaleString("es-MX", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: false,
        })
      : "";
    const total     = cita?.precio_total ?? stripe_data?.amount ?? 0;
    const referencia = cita?.id ?? "—";

    if (!email) {
      return NextResponse.json({ error: "Email del destinatario requerido" }, { status: 400 });
    }

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <!-- Header -->
        <tr>
          <td style="background:#ea580c;padding:28px 32px;text-align:center">
            <p style="margin:0;color:#fff;font-size:22px;font-weight:bold">✂ BarberHost</p>
            <p style="margin:6px 0 0;color:#fed7aa;font-size:13px">Comprobante de reserva</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;color:#111827;font-size:16px">Hola, <strong>${nombre}</strong> 👋</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Tu cita ha sido confirmada y el pago procesado exitosamente.</p>

            <!-- Detalles -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:8px;padding:20px;margin-bottom:24px">
              <tr>
                <td style="padding:6px 0">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#6b7280;font-size:13px;width:120px">Servicio</td>
                      <td style="color:#111827;font-size:13px;font-weight:600">${servicio}</td>
                    </tr>
                    ${fecha ? `<tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Fecha y hora</td><td style="color:#111827;font-size:13px;font-weight:600;padding-top:8px;text-transform:capitalize">${fecha}</td></tr>` : ""}
                    <tr>
                      <td style="color:#6b7280;font-size:13px;padding-top:8px">Total pagado</td>
                      <td style="color:#ea580c;font-size:16px;font-weight:700;padding-top:8px">$${Number(total).toFixed(2)} MXN</td>
                    </tr>
                    <tr>
                      <td style="color:#6b7280;font-size:13px;padding-top:8px">Referencia</td>
                      <td style="color:#111827;font-size:12px;font-family:monospace;padding-top:8px">#${referencia}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;color:#6b7280;font-size:13px">¿Necesitas hacer algún cambio? Contáctanos con tu número de referencia.</p>
            <p style="margin:0;color:#6b7280;font-size:13px">¡Te esperamos!</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px">BarberHost · Tu barbería de confianza</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "BarberHost <onboarding@resend.dev>",
        to:      [email],
        subject: `✂ Confirmación de cita — BarberHost #${referencia}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error("[email/comprobante]", result);
      return NextResponse.json({ error: result.message ?? "Error al enviar" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("[email/comprobante]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
