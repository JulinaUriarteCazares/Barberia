"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Search, Calendar, X } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/layout/public-header";
import { PublicBreadcrumb } from "@/components/layout/public-breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { EmptyState, EstadoBadge, LoadingState } from "@/components/shared/status-badge";
import { exportCitaComprobante } from "@/lib/pdf-export";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import type { CitaConDetalles } from "@/lib/types";

export default function MisCitasPage() {
  const [email, setEmail] = useState("");
  const [citas, setCitas] = useState<CitaConDetalles[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reprogramarId, setReprogramarId] = useState<number | null>(null);
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newSlot, setNewSlot] = useState("");
  const [slots, setSlots] = useState<string[]>([]);

  const buscar = async () => {
    if (!email.trim()) {
      toast.error("Introduce tu email");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/citas?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      setCitas(data);
      if (data.length === 0) toast.info("No se encontraron citas con ese email");
    } catch {
      toast.error("Error al buscar citas");
    } finally {
      setLoading(false);
    }
  };

  const cancelar = async (id: number) => {
    try {
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancelar", id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Cita cancelada");
      buscar();
    } catch {
      toast.error("Error al cancelar");
    }
  };

  const abrirReprogramar = async (cita: CitaConDetalles) => {
    setReprogramarId(cita.id);
    setNewDate(undefined);
    setNewSlot("");
    setSlots([]);
  };

  const cargarSlots = async (date: Date, cita: CitaConDetalles) => {
    setNewDate(date);
    const fecha = format(date, "yyyy-MM-dd");
    const res = await fetch(
      `/api/citas?fecha=${fecha}&duracion=${cita.servicio_duracion}&exclude_id=${cita.id}`
    );
    setSlots(await res.json());
  };

  const reprogramar = async (cita: CitaConDetalles) => {
    if (!newDate || !newSlot) return;
    try {
      const fecha_hora = `${format(newDate, "yyyy-MM-dd")}T${newSlot}:00`;
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprogramar", id: cita.id, fecha_hora }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success("Cita reprogramada");
      setReprogramarId(null);
      buscar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al reprogramar");
    }
  };

  const citaReprogramar = citas.find((c) => c.id === reprogramarId);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="container mx-auto flex-1 px-4 py-12">
        <PublicBreadcrumb items={[{ label: "Mis Citas" }]} />
        <h1 className="mb-2 text-3xl font-bold">Mis Citas</h1>
        <p className="mb-8 text-muted-foreground">
          Consulta tus citas introduciendo el email con el que reservaste
        </p>

        <Card className="mb-8">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
              />
            </div>
            <Button className="self-end" onClick={buscar} disabled={loading}>
              <Search className="size-4" />
              {loading ? "Buscando..." : "Buscar citas"}
            </Button>
          </CardContent>
        </Card>

        {loading && <LoadingState />}
        {!loading && searched && citas.length === 0 && (
          <EmptyState title="Sin citas" description="No encontramos citas asociadas a este email." />
        )}

        <div className="grid gap-4">
          {citas.map((cita) => (
            <Card key={cita.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{cita.servicio_nombre}</CardTitle>
                  <p className="text-sm text-muted-foreground">{formatDateTime(cita.fecha_hora)}</p>
                </div>
                <EstadoBadge estado={cita.estado} />
              </CardHeader>
              <CardContent>
                <p className="text-sm">{formatCurrency(cita.servicio_precio)} · Ref. #{cita.id}</p>
                {cita.estado !== "cancelada" && cita.estado !== "completada" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => abrirReprogramar(cita)}>
                      <Calendar className="size-4" /> Reprogramar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => cancelar(cita.id)}>
                      <X className="size-4" /> Cancelar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => exportCitaComprobante(cita)}>
                      <Download className="size-4" /> PDF
                    </Button>
                  </div>
                )}
                {(cita.estado === "cancelada" || cita.estado === "completada") && (
                  <Button size="sm" variant="secondary" className="mt-4" onClick={() => exportCitaComprobante(cita)}>
                    <Download className="size-4" /> Descargar comprobante
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={!!reprogramarId} onOpenChange={() => setReprogramarId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reprogramar cita</DialogTitle>
            </DialogHeader>
            {citaReprogramar && (
              <div className="space-y-4">
                <DateCalendar
                  mode="single"
                  selected={newDate}
                  onSelect={(d: Date | undefined) => d && cargarSlots(d, citaReprogramar)}
                  disabled={(date) => date < new Date() || date.getDay() === 0}
                />
                {slots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <Button
                        key={slot}
                        variant={newSlot === slot ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNewSlot(slot)}
                      >
                        {slot}
                      </Button>
                    ))}
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={!newDate || !newSlot}
                  onClick={() => reprogramar(citaReprogramar)}
                >
                  Confirmar nueva fecha
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
      <PublicFooter />
    </div>
  );
}
