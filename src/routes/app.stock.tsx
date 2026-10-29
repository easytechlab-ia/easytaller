// EasyTaller — Recambios. The parts catalog and its stock in one place: code,
// supplier, purchase / sale price and units. Stock goes down on its own when a
// car is marked "Listo" (the parts the customer approved) and up with
// "Entrada" when an order arrives. "Por pedir" lists what's at or below its
// minimum, grouped by supplier, so the shop knows whom to call. All local.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes, PackagePlus, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/base/PageHeader";
import { EmptyState } from "@/components/base/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PartFormDialog } from "@/components/app/PartFormDialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { canEdit } from "@/lib/permissions";
import { partsRepo } from "@/lib/db";
import { adjustStock, isLowStock, listStock } from "@/lib/stock";
import { formatCurrencyCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Part } from "@/types";

export const Route = createFileRoute("/app/stock")({
  component: PartsPage,
});

type Filter = "all" | "order";

function PartsPage() {
  const { user, tenant } = useAuth();
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Part | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [receiving, setReceiving] = useState<Part | null>(null);
  const [toDelete, setToDelete] = useState<Part | null>(null);

  const parts = useMemo(
    () => (tenant ? listStock(tenant.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenant, version],
  );

  if (!tenant || !user) return null;
  const editable = canEdit(user.role, "stock");
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);
  const refresh = () => setVersion((v) => v + 1);

  const toOrder = parts.filter(isLowStock);
  const q = query.trim().toLowerCase();
  const shown = (filter === "order" ? toOrder : parts).filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.supplier ?? "").toLowerCase().includes(q),
  );

  // "Por pedir" is grouped by supplier: who to call and what to ask for.
  const bySupplier = new Map<string, Part[]>();
  if (filter === "order") {
    for (const p of shown) {
      const key = p.supplier?.trim() || "Sin proveedor";
      bySupplier.set(key, [...(bySupplier.get(key) ?? []), p]);
    }
  }

  const remove = () => {
    if (!toDelete) return;
    partsRepo.remove(tenant.id, toDelete.id);
    toast.success("Recambio eliminado");
    setToDelete(null);
    refresh();
  };

  const card = (p: Part) => (
    <PartCard
      key={p.id}
      part={p}
      money={money}
      editable={editable}
      onEdit={() => {
        setEditing(p);
        setFormOpen(true);
      }}
      onReceive={() => setReceiving(p)}
      onDelete={() => setToDelete(p)}
    />
  );

  return (
    <div>
      <PageHeader
        title="Recambios"
        description="Tu almacén: precios, proveedor y stock. El stock baja solo cuando marcas un coche como «Listo»."
        actions={
          editable ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus strokeWidth={1.5} />
              Nuevo recambio
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          {(
            [
              ["all", `Todos ${parts.length}`],
              ["order", `Por pedir ${toOrder.length}`],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : value === "order" && toOrder.length > 0
                    ? "border-[var(--destructive)]/40 text-[var(--destructive)]"
                    : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative max-w-md flex-1">
          <Search
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código o proveedor…"
            className="pl-9"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={
            filter === "order" ? "No falta nada" : q ? "Sin resultados" : "Aún no hay recambios"
          }
          description={
            filter === "order"
              ? "Todos los recambios están por encima de su mínimo."
              : q
                ? "Prueba con otro nombre o código."
                : "Da de alta los recambios que usas para añadirlos a los presupuestos."
          }
        />
      ) : filter === "order" ? (
        <div className="space-y-5">
          {[...bySupplier.entries()].map(([supplier, list]) => (
            <section key={supplier}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Truck strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" />
                {supplier}
                <span className="font-normal text-muted-foreground">
                  · {list.length} {list.length === 1 ? "recambio" : "recambios"}
                </span>
              </h2>
              <ul className="space-y-2">{list.map(card)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">{shown.map(card)}</ul>
      )}

      <PartFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tenant={tenant}
        part={editing}
        onSaved={refresh}
      />

      <ReceiveDialog
        part={receiving}
        onClose={() => setReceiving(null)}
        onSave={(qty) => {
          if (!receiving) return;
          adjustStock(tenant.id, receiving.id, qty);
          toast.success(`Entrada de ${qty} ${qty === 1 ? "unidad" : "unidades"} registrada`);
          setReceiving(null);
          refresh();
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{toDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en los presupuestos y en los servicios que lo usan. Los presupuestos
              ya hechos no cambian.
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

function PartCard({
  part: p,
  money,
  editable,
  onEdit,
  onReceive,
  onDelete,
}: {
  part: Part;
  money: (n: number) => string;
  editable: boolean;
  onEdit: () => void;
  onReceive: () => void;
  onDelete: () => void;
}) {
  const low = isLowStock(p);
  const tracked = p.stockQty != null;
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {p.name}
          {p.sku && <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {p.supplier ? p.supplier : "Sin proveedor"} · Compra {p.cost != null ? money(p.cost) : "—"} ·
          Venta {money(p.price)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {tracked ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              low
                ? "bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] text-[var(--destructive)]"
                : "bg-background-muted text-foreground",
            )}
          >
            {p.stockQty} {p.stockQty === 1 ? "ud." : "uds."}
            {low ? ` · mín. ${p.minStock}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin control de stock</span>
        )}
        {editable && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={onReceive}>
              <PackagePlus strokeWidth={1.5} />
              Entrada
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label={`Editar ${p.name}`}>
              <Pencil strokeWidth={1.5} className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-[var(--destructive)]"
              onClick={onDelete}
              aria-label={`Eliminar ${p.name}`}
            >
              <Trash2 strokeWidth={1.5} className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function ReceiveDialog({
  part,
  onClose,
  onSave,
}: {
  part: Part | null;
  onClose: () => void;
  onSave: (qty: number) => void;
}) {
  const [qty, setQty] = useState("1");
  const n = Math.round(Number(qty.replace(",", ".")) || 0);
  return (
    <Dialog
      open={!!part}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setQty("1");
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Entrada de {part?.name}</DialogTitle>
          <DialogDescription>
            ¿Cuántas unidades han llegado? Ahora hay {part?.stockQty ?? 0}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="in-qty">Unidades</Label>
          <Input
            id="in-qty"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={n <= 0}
            onClick={() => {
              onSave(n);
              setQty("1");
            }}
          >
            Añadir {n > 0 ? n : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
