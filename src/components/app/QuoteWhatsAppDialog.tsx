// EasyTaller — send (or remind) a quote by WhatsApp. Opens WhatsApp with the
// message already written: the total and the link where the customer reviews
// and approves the quote line by line. Nothing is sent automatically.

import { useEffect, useMemo, useState } from "react";
import { FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quoteTotals } from "@/lib/orders";
import { formatCurrencyCents } from "@/lib/format";
import { quoteMessage, whatsappUrl } from "@/lib/whatsapp";
import type { Customer, Tenant, Vehicle, WorkOrder } from "@/types";

/** Link to the customer's page for this repair (where the quote is approved). */
export function customerOrderUrl(order: WorkOrder): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/c/${order.accessCode}`;
}

export function QuoteWhatsAppDialog({
  open,
  onOpenChange,
  order,
  tenant,
  customer,
  vehicle,
  reminder = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: WorkOrder;
  tenant: Tenant;
  customer?: Customer;
  vehicle?: Vehicle;
  reminder?: boolean;
}) {
  const initial = useMemo(
    () =>
      quoteMessage({
        customerName: customer?.name,
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model}` : undefined,
        plate: vehicle?.plate,
        tenantName: tenant.name,
        total: formatCurrencyCents(
          quoteTotals(order.items, tenant.taxRate).total,
          tenant.currency,
        ),
        link: customerOrderUrl(order),
        reminder,
      }),
    [customer, vehicle, tenant, order, reminder],
  );
  const [text, setText] = useState(initial);

  // Fresh draft every time the dialog opens.
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);

  const send = () => {
    window.open(whatsappUrl(customer?.phone, text), "_blank");
    toast.success("WhatsApp abierto con el mensaje listo para enviar");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-primary sm:mx-0">
            <FileText strokeWidth={1.5} className="h-6 w-6" />
          </div>
          <DialogTitle>
            {reminder ? "Recordar el presupuesto" : "Presupuesto listo. ¿Se lo enviamos?"}
          </DialogTitle>
          <DialogDescription>
            {customer
              ? `Se abrirá WhatsApp con este mensaje para ${customer.name} (${customer.phone}). Solo tienes que darle a enviar.`
              : "Se abrirá WhatsApp con este mensaje. Solo tienes que elegir el contacto y enviar."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          className="text-sm"
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Ahora no
          </Button>
          <Button onClick={send} className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
            <MessageCircle strokeWidth={1.75} />
            Enviar por WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
