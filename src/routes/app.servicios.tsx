// EasyTaller — Servicios. The one place where services are created and edited:
// labor hours + the parts they usually need. The price is computed with the
// shop's hourly rate and is what the customer sees on the website (which
// services appear there is decided in "Mi web"). Everything local.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Globe, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/base/PageHeader";
import { EmptyState } from "@/components/base/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ServiceFormDialog } from "@/components/app/ServiceFormDialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { canEdit } from "@/lib/permissions";
import { partsRepo, servicesRepo } from "@/lib/db";
import {
  futureAppointmentsUsingService,
  hoursLabel,
  laborRate,
  listServices,
} from "@/lib/catalog";
import { getWebsiteSettings, serviceWebSettings } from "@/lib/website";
import { formatCurrencyCents } from "@/lib/format";
import type { Service } from "@/types";

export const Route = createFileRoute("/app/servicios")({
  component: ServicesPage,
});

function ServicesPage() {
  const { user, tenant } = useAuth();
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Service | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Service | null>(null);

  const services = useMemo(
    () => (tenant ? listServices(tenant.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenant, version],
  );
  const partsById = useMemo(
    () => new Map((tenant ? partsRepo.list(tenant.id) : []).map((p) => [p.id, p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenant, version],
  );

  if (!tenant || !user) return null;
  const editable = canEdit(user.role, "servicios");
  const web = getWebsiteSettings(tenant);
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);
  const q = query.trim().toLowerCase();
  const shown = services.filter((s) => !q || s.name.toLowerCase().includes(q));

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const remove = () => {
    if (!toDelete) return;
    servicesRepo.remove(tenant.id, toDelete.id);
    toast.success("Servicio eliminado");
    setToDelete(null);
    setVersion((v) => v + 1);
  };

  const booked = toDelete ? futureAppointmentsUsingService(tenant.id, toDelete.id) : 0;

  return (
    <div>
      <PageHeader
        title="Servicios"
        description="Lo que haces en el taller. El precio sale de las horas y los recambios, y es el que ve el cliente en tu web."
        actions={
          editable ? (
            <Button onClick={openNew}>
              <Plus strokeWidth={1.5} />
              Nuevo servicio
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar servicio…"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Mano de obra a {money(laborRate(tenant))}/h ·{" "}
          <Link to="/app/configuracion" className="font-medium text-primary hover:underline">
            cambiar
          </Link>
        </p>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={q ? "Sin resultados" : "Aún no hay servicios"}
          description={
            q ? "Prueba con otro nombre." : "Crea tu primer servicio: por ejemplo, un cambio de aceite."
          }
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => {
            const onWeb = serviceWebSettings(web, s).showOnWeb;
            const partNames = (s.parts ?? [])
              .map((p) => partsById.get(p.partId)?.name)
              .filter(Boolean) as string[];
            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock strokeWidth={1.5} className="h-3.5 w-3.5" />
                      {s.laborHours != null ? hoursLabel(s.laborHours) : "Precio fijo"}
                    </span>
                    {partNames.length > 0 && <span>{partNames.join(" · ")}</span>}
                  </p>
                  {onWeb && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Globe strokeWidth={1.5} className="h-3 w-3" />
                      Se ve en tu web
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <p className="font-display text-lg font-bold tabular-nums text-foreground">
                    {money(s.basePrice)}
                  </p>
                  <p className="-mt-2 text-[11px] text-muted-foreground">IVA incl.</p>
                  {editable && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditing(s);
                          setFormOpen(true);
                        }}
                        aria-label={`Editar ${s.name}`}
                      >
                        <Pencil strokeWidth={1.5} className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-[var(--destructive)]"
                        onClick={() => setToDelete(s)}
                        aria-label={`Eliminar ${s.name}`}
                      >
                        <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tenant={tenant}
        service={editing}
        onSaved={() => setVersion((v) => v + 1)}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{toDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {booked > 0
                ? `Hay ${booked} ${booked === 1 ? "cita" : "citas"} con este servicio. Seguirán en la agenda, pero sin servicio.`
                : "Deja de salir en tu web y en los presupuestos. Los presupuestos ya hechos no cambian."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
