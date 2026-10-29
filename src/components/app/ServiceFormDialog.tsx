// EasyTaller — create / edit a service. A service is: a name, the labor hours
// it takes and the parts it usually needs. Its price (shown on the website,
// IVA included) is computed from them with the shop's hourly rate, so it never
// gets out of date. All writes go through servicesRepo.

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { partsRepo, servicesRepo } from "@/lib/db";
import { laborRate, servicePrice } from "@/lib/catalog";
import { formatCurrencyCents } from "@/lib/format";
import type { Service, ServicePart, Tenant } from "@/types";

interface ServiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant;
  service?: Service | null;
  onSaved?: (service: Service) => void;
}

function num(v: string): number {
  return Number(v.replace(",", ".")) || 0;
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  tenant,
  service,
  onSaved,
}: ServiceFormDialogProps) {
  const parts = useMemo(
    () => partsRepo.list(tenant.id).sort((a, b) => a.name.localeCompare(b.name)),
    // Re-read the catalog every time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenant.id, open],
  );
  const partsById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  const [name, setName] = useState("");
  const [hours, setHours] = useState("1");
  const [used, setUsed] = useState<Array<{ partId: string; qty: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? "");
    setHours(String(service?.laborHours ?? (service ? 0 : 1)).replace(".", ","));
    setUsed((service?.parts ?? []).map((p) => ({ partId: p.partId, qty: String(p.qty) })));
  }, [open, service]);

  const cleanParts: ServicePart[] = used
    .filter((u) => u.partId && num(u.qty) > 0)
    .map((u) => ({ partId: u.partId, qty: num(u.qty) }));
  const price = servicePrice(tenant, num(hours), cleanParts, partsById);
  const rate = laborRate(tenant);
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);

  const save = () => {
    if (!name.trim()) {
      toast.error("Ponle un nombre al servicio.");
      return;
    }
    const laborHours = Math.max(0, num(hours));
    const payload = {
      name: name.trim(),
      laborHours,
      parts: cleanParts,
      basePrice: price.gross,
      estimatedMinutes: Math.max(30, Math.round(laborHours * 60)),
    };
    const saved = service
      ? servicesRepo.update(tenant.id, service.id, payload)
      : servicesRepo.create(tenant.id, { tenantId: tenant.id, ...payload } as Omit<Service, "id">);
    if (saved) {
      toast.success(service ? "Servicio guardado" : "Servicio creado");
      onSaved?.(saved);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            Las horas y los recambios que lleva normalmente. Al añadirlo a un presupuesto entran
            solos, y se pueden cambiar en cada coche.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Nombre</Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cambio de aceite y filtro"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-hours">Horas de mano de obra</Label>
            <div className="flex items-center gap-3">
              <Input
                id="s-hours"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                × {money(rate)}/h = {money(price.labor)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recambios que lleva</Label>
            {used.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ninguno. Por ejemplo, un diagnóstico solo lleva mano de obra.
              </p>
            )}
            {used.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={u.partId}
                  onValueChange={(v) =>
                    setUsed((prev) => prev.map((x, j) => (j === i ? { ...x, partId: v } : x)))
                  }
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder="Elige un recambio" />
                  </SelectTrigger>
                  <SelectContent>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {money(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="decimal"
                  value={u.qty}
                  onChange={(e) =>
                    setUsed((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                    )
                  }
                  className="w-16"
                  aria-label="Cantidad"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setUsed((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Quitar recambio"
                >
                  <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUsed((prev) => [...prev, { partId: "", qty: "1" }])}
              disabled={parts.length === 0}
            >
              <Plus strokeWidth={1.5} />
              Añadir recambio
            </Button>
            {parts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Primero da de alta tus recambios en «Recambios».
              </p>
            )}
          </div>

          <div className="space-y-1 rounded-lg bg-background-subtle p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Mano de obra</span>
              <span className="tabular-nums">{money(price.labor)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Recambios</span>
              <span className="tabular-nums">{money(price.parts)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
              <span>Precio con IVA (el que ve el cliente)</span>
              <span className="tabular-nums">{money(price.gross)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>{service ? "Guardar" : "Crear servicio"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
