// EasyTaller — create / edit a part (recambio): name, code, supplier, purchase
// and sale price, and stock (units + minimum). Leaving the minimum empty means
// its stock isn't tracked. Saving keeps the services' prices up to date.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { partsRepo } from "@/lib/db";
import { refreshServicePrices } from "@/lib/catalog";
import type { Part, Tenant } from "@/types";

interface PartFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant;
  part?: Part | null;
  onSaved?: (part: Part) => void;
}

function num(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function str(n?: number): string {
  return n == null ? "" : String(n).replace(".", ",");
}

export function PartFormDialog({ open, onOpenChange, tenant, part, onSaved }: PartFormDialogProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [min, setMin] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(part?.name ?? "");
    setSku(part?.sku ?? "");
    setSupplier(part?.supplier ?? "");
    setCost(str(part?.cost));
    setPrice(str(part?.price));
    setStock(str(part?.stockQty));
    setMin(str(part?.minStock));
  }, [open, part]);

  const costN = num(cost);
  const priceN = num(price);
  const margin =
    costN && priceN && costN > 0 ? Math.round(((priceN - costN) / costN) * 100) : null;

  const save = () => {
    if (!name.trim()) {
      toast.error("Ponle un nombre al recambio.");
      return;
    }
    if (priceN == null || priceN < 0) {
      toast.error("Indica el precio de venta.");
      return;
    }
    const payload: Partial<Part> = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      supplier: supplier.trim() || undefined,
      cost: costN,
      price: priceN,
      stockQty: num(stock) != null ? Math.max(0, Math.round(num(stock)!)) : undefined,
      minStock: num(min) != null ? Math.max(0, Math.round(num(min)!)) : undefined,
    };
    const saved = part
      ? partsRepo.update(tenant.id, part.id, payload)
      : partsRepo.create(tenant.id, { tenantId: tenant.id, ...payload } as Omit<Part, "id">);
    refreshServicePrices(tenant);
    if (saved) {
      toast.success(part ? "Recambio guardado" : "Recambio creado");
      onSaved?.(saved);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{part ? "Editar recambio" : "Nuevo recambio"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Nombre</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pastillas de freno delanteras"
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-sku">Código</Label>
              <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="PF-2048" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-supplier">Proveedor</Label>
              <Input
                id="p-supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="A quién se lo pides"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-cost">Precio de compra</Label>
              <Input id="p-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Precio de venta</Label>
              <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Precios sin IVA.{margin !== null ? ` Margen: ${margin}%.` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-stock">Unidades en stock</Label>
              <Input id="p-stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-min">Mínimo</Label>
              <Input id="p-min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Sin control" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Cuando queden el mínimo o menos, sale en «Por pedir». Déjalo vacío si no quieres controlar su stock.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>{part ? "Guardar" : "Crear recambio"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
