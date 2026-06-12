"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Plus, Minus, ShoppingCart, CreditCard, Trash2, Lock } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/layout/public-header";
import { PublicBreadcrumb } from "@/components/layout/public-breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { clienteSchema, type ClienteFormData } from "@/lib/validators";
import { formatCurrency } from "@/lib/utils";
import type { Servicio } from "@/lib/types";
import { HORARIO_APERTURA, HORARIO_CIERRE } from "@/lib/types";
import { cn } from "@/lib/utils";

type ItemCarrito  = { servicio: Servicio; cantidad: number };
type SlotStatus   = { hora: string; disponible: boolean };

function horaFin(hora: string, duracionMin: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total  = h * 60 + m + duracionMin;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const STEPS = ["Servicios", "Fecha", "Horario", "Datos"];

function ReservarContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [holdId, setHoldId]           = useState<number | null>(null);
  const [holdExpiry, setHoldExpiry]   = useState<Date | null>(null);
  const [holdSecsLeft, setHoldSecsLeft] = useState(0);
  const refreshIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalDuracion = carrito.reduce((s, it) => s + it.servicio.duracion_minutos * it.cantidad, 0);
  const totalPrecio   = carrito.reduce((s, it) => s + Number(it.servicio.precio) * it.cantidad, 0);
  const totalItems    = carrito.reduce((s, it) => s + it.cantidad, 0);

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: { nombre: "", email: "", telefono: "", notas: "" },
  });

  useEffect(() => {
    // Si venimos de cancelar Stripe, liberar el hold que quedó bloqueado
    const cancelHoldId = searchParams.get("cancel_hold");
    if (cancelHoldId) {
      fetch("/api/citas/hold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_id: Number(cancelHoldId) }),
      }).catch(() => {/* best-effort */});
    }

    fetch("/api/servicios?activos=true")
      .then((r) => r.json())
      .then((data: Servicio[]) => {
        setServicios(Array.isArray(data) ? data : []);
        const preselect = searchParams.get("servicio");
        if (preselect) {
          const s = data.find((x) => x.id === Number(preselect));
          if (s) setCarrito([{ servicio: s, cantidad: 1 }]);
        }
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  const getCantidad = (id: number) => carrito.find((x) => x.servicio.id === id)?.cantidad ?? 0;

  const maxCantidad = (s: Servicio) => {
    const maxMinutos = (HORARIO_CIERRE - HORARIO_APERTURA) * 60;
    const otrosDuracion = carrito
      .filter((x) => x.servicio.id !== s.id)
      .reduce((acc, x) => acc + x.servicio.duracion_minutos * x.cantidad, 0);
    return Math.max(1, Math.floor((maxMinutos - otrosDuracion) / s.duracion_minutos));
  };

  const aumentar = (s: Servicio) => {
    setCarrito((prev) => {
      const exist = prev.find((x) => x.servicio.id === s.id);
      const max   = maxCantidad(s);
      if (exist) {
        if (exist.cantidad >= max) return prev; // ya llegó al límite
        return prev.map((x) => x.servicio.id === s.id ? { ...x, cantidad: x.cantidad + 1 } : x);
      }
      return [...prev, { servicio: s, cantidad: 1 }];
    });
  };

  const disminuir = (s: Servicio) => {
    setCarrito((prev) => {
      const exist = prev.find((x) => x.servicio.id === s.id);
      if (!exist) return prev;
      if (exist.cantidad <= 1) return prev.filter((x) => x.servicio.id !== s.id);
      return prev.map((x) => x.servicio.id === s.id ? { ...x, cantidad: x.cantidad - 1 } : x);
    });
  };

  const eliminar = (id: number) => setCarrito((prev) => prev.filter((x) => x.servicio.id !== id));

  const loadAvailableDays = useCallback(async (duracion: number, date: Date) => {
    if (duracion === 0) return;
    const res = await fetch(
      `/api/citas?year=${date.getFullYear()}&month=${date.getMonth()}&duracion=${duracion}`
    );
    const days = await res.json();
    setAvailableDays(Array.isArray(days) ? days : []);
  }, []);

  useEffect(() => {
    if (totalDuracion > 0) loadAvailableDays(totalDuracion, calendarMonth);
  }, [totalDuracion, calendarMonth, loadAvailableDays]);

  const fetchSlots = useCallback((fecha: string, duracion: number) => {
    setSlotsLoading(true);
    fetch(`/api/citas?fecha=${fecha}&duracion=${duracion}&ocupados=true`)
      .then(async (r) => {
        if (!r.ok) { console.error("[fetchSlots] error", r.status); return []; }
        const d = await r.json();
        return Array.isArray(d) ? d : [];
      })
      .then((d) => setSlots(d))
      .catch((e) => { console.error("[fetchSlots] parse error", e); setSlots([]); })
      .finally(() => setSlotsLoading(false));
  }, []);

  useEffect(() => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    if (totalDuracion > 0 && selectedDate && step === 2) {
      const fecha = format(selectedDate, "yyyy-MM-dd");
      fetchSlots(fecha, totalDuracion);
      // Auto-refresh cada 20s para reflejar reservas recientes de otros usuarios
      refreshIntervalRef.current = setInterval(() => fetchSlots(fecha, totalDuracion), 20000);
    }
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [totalDuracion, selectedDate, step, fetchSlots]);

  // Countdown del hold mientras el usuario está en paso 3
  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (!holdExpiry) { setHoldSecsLeft(0); return; }
    const tick = () => {
      const secs = Math.max(0, Math.floor((holdExpiry.getTime() - Date.now()) / 1000));
      setHoldSecsLeft(secs);
      if (secs === 0) {
        // Hold expiró — regresar al paso de horario
        setStep(2);
        setHoldId(null);
        setHoldExpiry(null);
        toast.error("Tu reserva temporal expiró. Elige otro horario.");
      }
    };
    tick();
    countdownIntervalRef.current = setInterval(tick, 1000);
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [holdExpiry]);

  const cancelHold = async (id: number) => {
    setHoldId(null);
    setHoldExpiry(null);
    await fetch("/api/citas/hold", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold_id: id }),
    }).catch(() => {/* best-effort */});
  };

  const isDayAvailable = (date: Date) => availableDays.includes(format(date, "yyyy-MM-dd"));

  const handleSubmit = async (data: ClienteFormData) => {
    if (!carrito.length || !selectedDate || !selectedSlot) return;
    setSubmitting(true);
    try {
      const fecha_hora = `${format(selectedDate, "yyyy-MM-dd")}T${selectedSlot}:00`;
      const payload: Record<string, unknown> = {
        items: carrito.map((it) => ({ id: it.servicio.id, cantidad: it.cantidad })),
        fecha_hora,
        cliente: data,
      };
      if (holdId) payload.hold_id = holdId;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al procesar el pago");
      window.location.href = json.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al procesar el pago");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Skeleton className="mx-auto h-96 max-w-2xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <PublicBreadcrumb items={[{ label: "Reservar", href: "/reservar" }, { label: STEPS[step] }]} />
      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
              </div>
              <span className="mt-1 hidden text-xs sm:block">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 h-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{STEPS[step]}</span>
            {step === 0 && totalItems > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground">
                <ShoppingCart className="size-3" /> {totalItems}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {step === 0 && "Elige servicios y ajusta la cantidad con + y −"}
            {step === 1 && "Selecciona un día disponible"}
            {step === 2 && "Elige tu horario — los bloqueados ya están reservados"}
            {step === 3 && "Completa tus datos — el pago se realiza con tarjeta vía Stripe"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── STEP 0: Servicios con cantidad ── */}
          {step === 0 && (
            <>
              <div className="grid gap-3">
                {servicios.map((s) => {
                  const cantidad = getCantidad(s.id);
                  const max      = maxCantidad(s);
                  const enLimite = cantidad >= max;
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-4 transition-all",
                        cantidad > 0 && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s.nombre}</p>
                        <p className="text-sm text-muted-foreground truncate">{s.descripcion}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="size-3" /> {s.duracion_minutos} min</span>
                          <span className="font-semibold text-primary">{formatCurrency(s.precio)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => disminuir(s)}
                          disabled={cantidad === 0}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full border-2 transition-colors",
                            cantidad > 0
                              ? "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                              : "border-muted text-muted cursor-not-allowed"
                          )}
                        >
                          <Minus className="size-3" />
                        </button>

                        <span className={cn(
                          "w-6 text-center text-sm font-bold tabular-nums",
                          cantidad > 0 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {cantidad}
                        </span>

                        <button
                          type="button"
                          onClick={() => aumentar(s)}
                          disabled={enLimite}
                          title={enLimite ? `Máximo ${max} (${max * s.duracion_minutos} min)` : ""}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full border-2 transition-colors",
                            enLimite
                              ? "border-muted text-muted cursor-not-allowed opacity-40"
                              : "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                          )}
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {carrito.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="mb-3 flex items-center gap-2 font-semibold text-sm">
                    <ShoppingCart className="size-4 text-primary" />
                    Resumen ({totalItems} ítem{totalItems !== 1 ? "s" : ""})
                  </p>
                  <ul className="space-y-2">
                    {carrito.map((it) => (
                      <li key={it.servicio.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex-1 text-muted-foreground">
                          {it.servicio.nombre}
                          {it.cantidad > 1 && <span className="ml-1 text-xs">×{it.cantidad}</span>}
                          <span className="ml-1 text-xs opacity-60">({it.servicio.duracion_minutos * it.cantidad} min)</span>
                        </span>
                        <span className="font-medium">{formatCurrency(Number(it.servicio.precio) * it.cantidad)}</span>
                        <button
                          type="button"
                          onClick={() => eliminar(it.servicio.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 border-t pt-3 flex justify-between text-sm font-semibold">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3" /> {totalDuracion} min en total
                    </span>
                    <span className="text-primary text-base font-bold">{formatCurrency(totalPrecio)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 1: Fecha ── */}
          {step === 1 && (
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                month={calendarMonth}
                onMonthChange={(m) => setCalendarMonth(m)}
                onSelect={(d: Date | undefined) => {
                  setSelectedDate(d);
                  setSelectedSlot("");
                  setSlots([]);
                }}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (date < today) return true;
                  if (date.getDay() === 0) return true;
                  return !isDayAvailable(date);
                }}
              />
            </div>
          )}

          {/* ── STEP 2: Horario — bloques compactos ── */}
          {step === 2 && (
            <>
              {slots.length === 0 && slotsLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Clock className="size-7 mb-2 opacity-30 animate-pulse" />
                  <p className="text-sm">Cargando horarios...</p>
                </div>
              ) : (
                <>
                  {/* Leyenda + indicador de frescura */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-green-500" /> Libre</span>
                      <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-red-400" /> Ocupado</span>
                    </div>
                    {slotsLoading && (
                      <span className="text-xs text-muted-foreground animate-pulse">Actualizando...</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {slots.map(({ hora, disponible }) => {
                      const fin      = horaFin(hora, totalDuracion);
                      const selected = selectedSlot === hora;
                      return disponible ? (
                        <button
                          key={hora}
                          type="button"
                          onClick={() => setSelectedSlot(hora)}
                          className={cn(
                            "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-all active:scale-[0.98]",
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-green-200 bg-green-50 hover:border-green-400 hover:bg-green-100"
                          )}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {selected
                              ? <CheckCircle2 className="size-3.5 shrink-0" />
                              : <Clock className="size-3.5 shrink-0 text-green-600" />
                            }
                            <span className="font-semibold tabular-nums text-xs">{hora}–{fin}</span>
                          </div>
                          <span className={cn(
                            "text-[10px] font-medium shrink-0 ml-1",
                            selected ? "opacity-80" : "text-green-700"
                          )}>
                            {selected ? "✓" : "libre"}
                          </span>
                        </button>
                      ) : (
                        <div
                          key={hora}
                          className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 cursor-not-allowed select-none opacity-60"
                        >
                          <div className="flex items-center gap-1.5">
                            <Lock className="size-3.5 shrink-0 text-red-400" />
                            <span className="font-semibold tabular-nums text-xs text-muted-foreground line-through">{hora}–{fin}</span>
                          </div>
                          <span className="text-[10px] font-medium text-red-500 shrink-0 ml-1">ocupado</span>
                        </div>
                      );
                    })}
                  </div>

                  {selectedSlot && (
                    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary flex items-center gap-2">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      Seleccionado: <strong>{selectedSlot}–{horaFin(selectedSlot, totalDuracion)}</strong>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── STEP 3: Datos del cliente ── */}
          {step === 3 && (
            <>
              {/* Countdown del hold */}
              {holdExpiry && holdSecsLeft > 0 && (
                <div className={cn(
                  "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                  holdSecsLeft < 120
                    ? "border-orange-200 bg-orange-50 text-orange-700"
                    : "border-green-200 bg-green-50 text-green-700"
                )}>
                  <Clock className="size-3.5 shrink-0" />
                  Horario reservado — {Math.floor(holdSecsLeft / 60)}:{String(holdSecsLeft % 60).padStart(2, "0")} para completar el pago
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1 mb-2">
                <p className="font-semibold text-foreground mb-1">Resumen de tu reserva:</p>
                {carrito.map((it) => (
                  <div key={it.servicio.id} className="flex justify-between text-muted-foreground">
                    <span>
                      {it.servicio.nombre}
                      {it.cantidad > 1 && <span className="ml-1 text-xs">×{it.cantidad}</span>}
                      <span className="ml-1 text-xs opacity-60">({it.servicio.duracion_minutos * it.cantidad} min)</span>
                    </span>
                    <span>{formatCurrency(Number(it.servicio.precio) * it.cantidad)}</span>
                  </div>
                ))}
                <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
                  <span className="text-muted-foreground">
                    {selectedDate && format(selectedDate, "dd/MM/yyyy")} · {selectedSlot}
                    <span className="ml-1 text-xs font-normal">({totalDuracion} min)</span>
                  </span>
                  <span className="text-primary">{formatCurrency(totalPrecio)}</span>
                </div>
              </div>

              <form id="cliente-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="nombre">Nombre completo</Label>
                  <Input id="nombre" {...form.register("nombre")} />
                  {form.formState.errors.nombre && (
                    <p className="mt-1 text-sm text-destructive">{form.formState.errors.nombre.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...form.register("email")} />
                  {form.formState.errors.email && (
                    <p className="mt-1 text-sm text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input id="telefono" {...form.register("telefono")} />
                  {form.formState.errors.telefono && (
                    <p className="mt-1 text-sm text-destructive">{form.formState.errors.telefono.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="notas">Notas (opcional)</Label>
                  <Textarea id="notas" {...form.register("notas")} placeholder="Alergias, preferencias..." />
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navegación */}
      <div className="mt-6 flex justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={async () => {
            // Si retrocede desde paso 3 → 2, cancela el hold activo
            if (step === 3 && holdId) {
              await cancelHold(holdId);
              setSelectedSlot("");
            }
            setStep((s) => s - 1);
          }}
        >
          <ArrowLeft className="size-4" /> Anterior
        </Button>

        {step < 3 ? (
          <Button
            disabled={
              (step === 0 && carrito.length === 0) ||
              (step === 1 && !selectedDate) ||
              (step === 2 && (!selectedSlot || submitting))
            }
            onClick={async () => {
              if (step === 0) {
                setSelectedDate(undefined);
                setCalendarMonth(new Date());
                setSlots([]);
                loadAvailableDays(totalDuracion, new Date());
                setStep(1);
                return;
              }
              if (step === 2 && selectedSlot && selectedDate) {
                // Crear hold ANTES de avanzar al formulario
                setSubmitting(true);
                try {
                  const fecha_hora = `${format(selectedDate, "yyyy-MM-dd")}T${selectedSlot}:00`;
                  const res = await fetch("/api/citas/hold", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      items: carrito.map((it) => ({ id: it.servicio.id, cantidad: it.cantidad })),
                      fecha_hora,
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok) {
                    if (res.status === 409) {
                      toast.error("Ese horario acaba de ser reservado. Elige otro.");
                      // Refrescar slots para mostrar el cambio
                      const fecha = format(selectedDate, "yyyy-MM-dd");
                      fetchSlots(fecha, totalDuracion);
                      setSelectedSlot("");
                    } else {
                      toast.error(json.error ?? "Error al reservar horario");
                    }
                    return;
                  }
                  setHoldId(json.hold_id);
                  setHoldExpiry(new Date(json.expires_at));
                  setStep(3);
                } catch {
                  toast.error("Error de red al reservar horario");
                } finally {
                  setSubmitting(false);
                }
                return;
              }
              setStep((s) => s + 1);
            }}
          >
            {step === 2 && submitting ? "Reservando..." : <>Siguiente <ArrowRight className="size-4" /></>}
          </Button>
        ) : (
          <Button
            type="submit"
            form="cliente-form"
            disabled={submitting}
            className="gap-2"
          >
            <CreditCard className="size-4" />
            {submitting ? "Redirigiendo a pago..." : `Pagar ${formatCurrency(totalPrecio)}`}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ReservarPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">
        <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-2xl rounded-xl" />}>
          <ReservarContent />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
}
