// EasyTaller — datos para facturar de un trabajo. Shows the printable summary
// (InvoiceDocument) and lets the shop complete what the gestoría needs: the
// customer's NIF and fiscal address, the payment (method and amount) and,
// once invoiced in its own program, the invoice number. Sends it by email or
// downloads it as a spreadsheet. EasyTaller doesn't issue the invoice.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Download, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/base/EmptyState";
import { InvoiceDocument, printInvoiceDocument } from "@/components/InvoiceDocument";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthContext";
import { customersRepo } from "@/lib/db";
import {
  BILLING_STAGE_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  billingEmailUrl,
  billingRows,
  billingStage,
  downloadBillingCsv,
  getBillingSettings,
  markSent,
  updateBilling,
} from "@/lib/invoices";
import { formatCurrencyCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Invoice, PaymentMethod } from "@/types";

export const Route = createFileRoute("/app/facturacion/$id")({
  component: BillingDetail,
});

function BillingDetail() {
  const { id } = Route.useParams();
  const { ready, tenant } = useAuth();
  const [version, setVersion] = useState(0);

  const row = useMemo(() => {
    if (!ready || !tenant) return null;
    return billingRows(tenant.id).find((r) => r.invoice.id === id) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tenant, id, version]);

  if (!tenant) return null;
  if (!row) {
    return (
      <div>
        <BackLink />
        <EmptyState
          title="No encontramos este trabajo"
          description="Es posible que se haya eliminado."
        />
      </div>
    );
  }

  const { invoice, order, customer, vehicle } = row;
  const stage = billingStage(invoice);
  const location =
    tenant.locations.find((l) => l.id === order?.locationId) ?? tenant.locations[0];
  const refresh = () => setVersion((v) => v + 1);

  const sendEmail = () => {
    const to = getBillingSettings(tenant.id).gestoriaEmail;
    window.location.href = billingEmailUrl(tenant, [row], to);
    if (!invoice.sentAt) markSent(tenant.id, [invoice.id]);
    refresh();
    toast.success(
      to
        ? "Email preparado para tu gestoría. Lo marcamos como enviado."
        : "Email preparado. Guarda el email de tu gestoría en Facturación para que salga ya puesto.",
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => printInvoiceDocument("invoice-print")}>
            <Printer strokeWidth={1.5} />
            Imprimir / PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadBillingCsv(tenant, [row], `datos-facturar-${invoice.number}.csv`)}
          >
            <Download strokeWidth={1.5} />
            Excel
          </Button>
          <Button onClick={sendEmail}>
            <Mail strokeWidth={1.5} />
            {invoice.sentAt ? "Reenviar a la gestoría" : "Enviar a la gestoría"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          <InvoiceDocument
            invoice={invoice}
            tenant={tenant}
            customer={customer}
            vehicle={vehicle}
            location={location}
            printId="invoice-print"
          />
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <StageCard invoice={invoice} stage={stage} />
          {customer && (
            <CustomerTaxCard
              key={`${customer.id}-${version}`}
              tenantId={tenant.id}
              customerId={customer.id}
              taxId={customer.taxId}
              address={customer.address}
              onSaved={refresh}
            />
          )}
          <PaymentCard
            key={`pay-${version}`}
            tenantId={tenant.id}
            invoice={invoice}
            currency={tenant.currency}
            onSaved={refresh}
          />
          <InvoicedCard
            key={`num-${version}`}
            tenantId={tenant.id}
            invoice={invoice}
            onSaved={refresh}
          />
        </div>
      </div>
    </div>
  );
}

function StageCard({
  invoice,
  stage,
}: {
  invoice: Invoice;
  stage: ReturnType<typeof billingStage>;
}) {
  const steps: Array<{ key: typeof stage; label: string; done: boolean; note?: string }> = [
    { key: "to_send", label: "Datos preparados", done: true, note: formatDate(invoice.createdAt) },
    {
      key: "sent",
      label: "Enviado a la gestoría",
      done: !!invoice.sentAt,
      note: invoice.sentAt ? formatDate(invoice.sentAt) : undefined,
    },
    {
      key: "invoiced",
      label: "Factura hecha",
      done: stage === "invoiced",
      note: invoice.externalNumber ? `Nº ${invoice.externalNumber}` : undefined,
    },
  ];
  return (
    <Card title={BILLING_STAGE_LABELS[stage]}>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                s.done
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-transparent",
              )}
            >
              <Check strokeWidth={2.5} className="h-3 w-3" />
            </span>
            <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
            {s.note && <span className="ml-auto text-xs text-muted-foreground">{s.note}</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function CustomerTaxCard({
  tenantId,
  customerId,
  taxId,
  address,
  onSaved,
}: {
  tenantId: string;
  customerId: string;
  taxId?: string;
  address?: string;
  onSaved: () => void;
}) {
  const [nif, setNif] = useState(taxId ?? "");
  const [addr, setAddr] = useState(address ?? "");
  const dirty = nif.trim() !== (taxId ?? "") || addr.trim() !== (address ?? "");

  const save = () => {
    customersRepo.update(tenantId, customerId, {
      taxId: nif.trim().toUpperCase() || undefined,
      address: addr.trim() || undefined,
    });
    toast.success("Datos del cliente guardados");
    onSaved();
  };

  return (
    <Card
      title="Datos fiscales del cliente"
      hint="Solo si quiere la factura a nombre de una empresa o autónomo. Se guardan en su ficha."
    >
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">NIF / CIF</Label>
        <Input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="B12345678" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">Dirección fiscal</Label>
        <Input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="Calle, número, CP y ciudad"
        />
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={!dirty}>
        <Check strokeWidth={1.5} />
        Guardar
      </Button>
    </Card>
  );
}

function PaymentCard({
  tenantId,
  invoice,
  currency,
  onSaved,
}: {
  tenantId: string;
  invoice: Invoice;
  currency: string;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<Invoice["status"]>(invoice.status);
  const [method, setMethod] = useState<PaymentMethod | "">(invoice.paymentMethod ?? "");
  const [amount, setAmount] = useState(
    invoice.paidAmount != null ? String(invoice.paidAmount) : "",
  );

  const save = () => {
    const paid =
      status === "paid"
        ? invoice.total
        : status === "partial"
          ? Math.max(0, Number(amount.replace(",", ".")) || 0)
          : 0;
    updateBilling(tenantId, invoice.id, {
      status,
      paymentMethod: method || undefined,
      paidAmount: paid,
    });
    toast.success("Cobro guardado");
    onSaved();
  };

  return (
    <Card title="Cobro">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Estado</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Invoice["status"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(INVOICE_STATUS_LABELS) as Invoice["status"][]).map((s) => (
                <SelectItem key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Forma de pago</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger>
              <SelectValue placeholder="Elegir" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {status === "partial" && (
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">
            Importe cobrado (de {formatCurrencyCents(invoice.total, currency)})
          </Label>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>
      )}
      <Button size="sm" variant="outline" onClick={save}>
        <Check strokeWidth={1.5} />
        Guardar cobro
      </Button>
    </Card>
  );
}

function InvoicedCard({
  tenantId,
  invoice,
  onSaved,
}: {
  tenantId: string;
  invoice: Invoice;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState(invoice.externalNumber ?? "");

  const save = () => {
    updateBilling(tenantId, invoice.id, {
      externalNumber: number.trim() || undefined,
      sentAt: invoice.sentAt ?? (number.trim() ? new Date().toISOString() : undefined),
    });
    toast.success(number.trim() ? "Marcado como facturado" : "Número de factura quitado");
    onSaved();
  };

  return (
    <Card
      title="Factura"
      hint="Cuando la gestoría (o tu programa) haga la factura, apunta aquí su número para tenerlo todo junto."
    >
      <div className="flex gap-2">
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Ej. 2026/0153"
        />
        <Button
          variant="outline"
          onClick={save}
          disabled={number.trim() === (invoice.externalNumber ?? "")}
        >
          <Check strokeWidth={1.5} />
          Guardar
        </Button>
      </div>
    </Card>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/facturacion"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft strokeWidth={1.5} className="h-4 w-4" />
      Facturación
    </Link>
  );
}
