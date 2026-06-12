"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, XCircle, Loader2, CalendarCheck,
  Clock, CreditCard, User, Download, Mail, MailCheck,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { PublicBreadcrumb } from "@/components/layout/public-breadcrumb";

type PagoData = {
  paid: boolean;
  cita_id?: number;
  nombre: string;
  email: string;
  telefono: string;
  servicio: string;
  fecha_hora: string;
  precio_total: number;
  duracion_total: number;
  notas: string;
  referencia: string;
};

type Result =
  | { status: "loading" }
  | { status: "paid"; data: PagoData }
  | { status: "pending" }
  | { status: "error"; message: string };

function formatFecha(iso: string) {
  if (!iso) return "";
  try {
    // slice(0,19) strips timezone offset so the string is parsed as local time
    return new Date(iso.slice(0, 19)).toLocaleString("es-MX", {
      weekday: "long", year: "numeric", month: "long",
      day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
  } catch { return iso; }
}

function ExitoContent() {
  const searchParams   = useSearchParams();
  const [result, setResult]       = useState<Result>({ status: "loading" });
  const [emailSent, setEmailSent] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const emailDone = useRef(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      setResult({ status: "error", message: "No se encontró la sesión de pago." });
      return;
    }

    fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || data.error) {
          setResult({ status: "error", message: data.error ?? "Error al verificar" });
        } else if (data.paid) {
          setResult({ status: "paid", data });
        } else {
          setResult({ status: "pending" });
        }
      })
      .catch((e) => setResult({ status: "error", message: String(e) }));
  }, [searchParams]);

  // Enviar email una sola vez cuando se confirma el pago
  useEffect(() => {
    if (result.status !== "paid" || emailDone.current) return;
    emailDone.current = true;
    const { data } = result;
    if (!data.email) return;
    setEmailSent("sending");
    fetch("/api/email/comprobante", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: data.email,
        cita: {
          id: data.cita_id ?? data.referencia,
          cliente_nombre: data.nombre,
          cliente_email: data.email,
          servicio_nombre: data.servicio,
          fecha_hora: data.fecha_hora,
          precio_total: data.precio_total,
          duracion_total: data.duracion_total,
        },
        stripe_data: null,
      }),
    })
      .then((r) => r.json())
      .then((d) => setEmailSent(d.ok ? "ok" : "error"))
      .catch(() => setEmailSent("error"));
  }, [result]);

  const descargarPdf = async () => {
    if (result.status !== "paid") return;
    const { data } = result;
    const { exportCitaComprobante } = await import("@/lib/pdf-export");
    await exportCitaComprobante({
      id:              data.cita_id ?? data.referencia,
      servicio_nombre: data.servicio,
      precio_total:    data.precio_total,
      cliente_nombre:  data.nombre,
      cliente_email:   data.email,
      fecha_hora:      data.fecha_hora,
      duracion_total:  data.duracion_total,
      notas:           data.notas,
    });
  };

  const reenviarEmail = () => {
    if (result.status !== "paid") return;
    const { data } = result;
    setEmailSent("sending");
    fetch("/api/email/comprobante", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: data.email,
        cita: {
          id: data.cita_id ?? data.referencia,
          cliente_nombre: data.nombre,
          cliente_email: data.email,
          servicio_nombre: data.servicio,
          fecha_hora: data.fecha_hora,
          precio_total: data.precio_total,
          duracion_total: data.duracion_total,
        },
        stripe_data: null,
      }),
    })
      .then((r) => r.json())
      .then((d) => setEmailSent(d.ok ? "ok" : "error"))
      .catch(() => setEmailSent("error"));
  };

  /* ── Loading ── */
  if (result.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <Loader2 className="size-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Verificando tu pago...</p>
      </div>
    );
  }

  /* ── Éxito ── */
  if (result.status === "paid") {
    const d = result.data;
    return (
      <div className="container mx-auto max-w-lg px-4 py-12">
        <div className="mb-8 flex flex-col items-center text-center">
          <CheckCircle2 className="mb-4 size-16 text-green-500" />
          <h1 className="text-2xl font-bold">¡Reserva confirmada!</h1>
          <p className="mt-2 text-muted-foreground">
            Tu cita fue agendada y el pago procesado exitosamente.
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            {emailSent === "sending" && (
              <><Loader2 className="size-3 animate-spin" /><span className="text-muted-foreground">Enviando comprobante...</span></>
            )}
            {emailSent === "ok" && (
              <><MailCheck className="size-4 text-green-500" /><span className="text-green-600">Comprobante enviado a {d.email}</span></>
            )}
            {emailSent === "error" && (
              <span className="text-destructive text-xs">No se pudo enviar el email — descárgalo abajo</span>
            )}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de tu cita</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row icon={<User />}        label="Cliente"     value={d.nombre} />
            {d.fecha_hora && (
              <Row icon={<CalendarCheck />} label="Fecha y hora" value={<span className="capitalize">{formatFecha(d.fecha_hora)}</span>} />
            )}
            <Row icon={<Clock />}       label="Servicio"    value={d.servicio + (d.duracion_total ? ` (${d.duracion_total} min)` : "")} />
            <Row
              icon={<CreditCard />}
              label="Total pagado"
              value={<span className="text-lg font-bold text-primary">{formatCurrency(d.precio_total)}</span>}
            />
            <div className="border-t pt-3 text-xs text-muted-foreground">
              Cita: <span className="font-mono font-semibold">#{d.cita_id ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="outline" className="gap-2" onClick={descargarPdf}>
            <Download className="size-4" /> Descargar PDF
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={emailSent === "sending" || emailSent === "ok"}
            onClick={reenviarEmail}
          >
            <Mail className="size-4" />
            {emailSent === "ok" ? "Email enviado" : "Reenviar email"}
          </Button>
        </div>

        <div className="mt-4 flex gap-3">
          <Button asChild className="flex-1"><Link href="/">Inicio</Link></Button>
          <Button variant="outline" asChild className="flex-1"><Link href="/reservar">Nueva reserva</Link></Button>
        </div>
      </div>
    );
  }

  /* ── Pendiente ── */
  if (result.status === "pending") {
    return (
      <div className="container mx-auto max-w-lg px-4 py-12 text-center">
        <XCircle className="mx-auto mb-4 size-16 text-yellow-500" />
        <h1 className="text-2xl font-bold">Pago pendiente</h1>
        <p className="mt-2 text-muted-foreground">
          El pago aún no se ha confirmado. Espera unos momentos y recarga.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Button onClick={() => window.location.reload()}>Verificar de nuevo</Button>
          <Button variant="outline" asChild><Link href="/reservar">Volver</Link></Button>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  return (
    <div className="container mx-auto max-w-lg px-4 py-12 text-center">
      <XCircle className="mx-auto mb-4 size-16 text-destructive" />
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="mt-2 text-muted-foreground">{result.message}</p>
      <Button className="mt-6" asChild><Link href="/reservar">Intentar de nuevo</Link></Button>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

export default function ExitoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">
        <div className="container mx-auto max-w-lg px-4 pt-6">
          <PublicBreadcrumb items={[{ label: "Reservar", href: "/reservar" }, { label: "Confirmación" }]} />
        </div>
        <Suspense fallback={
          <div className="flex flex-col items-center gap-4 py-24">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
        }>
          <ExitoContent />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
}
