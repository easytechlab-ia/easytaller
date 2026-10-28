// EasyTaller — WhatsApp helpers. Nothing is sent automatically: we build a
// wa.me link with the message already written and the person taps "send" in
// WhatsApp. Works on mobile (app) and desktop (WhatsApp Web).

/**
 * Normalise a phone for wa.me (digits only, with country code).
 * Spanish numbers written without prefix (9 digits starting by 6/7/8/9) get 34.
 */
export function toWhatsAppNumber(phone?: string): string {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (digits.length === 9 && /^[6789]/.test(digits)) return `34${digits}`;
  return digits;
}

/** wa.me link with a prefilled message. Without phone, WhatsApp asks for a contact. */
export function whatsappUrl(phone: string | undefined, message: string): string {
  const number = toWhatsAppNumber(phone);
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

/** Message for the customer when their car is ready to pick up. */
export function readyMessage(opts: {
  customerName?: string;
  vehicleLabel?: string;
  plate?: string;
  tenantName: string;
  trackingUrl?: string;
}): string {
  const firstName = opts.customerName?.split(" ")[0];
  const hello = firstName ? `¡Hola ${firstName}!` : "¡Hola!";
  const car = opts.vehicleLabel
    ? `tu ${opts.vehicleLabel}${opts.plate ? ` (${opts.plate})` : ""}`
    : "tu coche";
  const lines = [
    `${hello} Te escribimos de ${opts.tenantName}: ${car} ya está listo para recoger. 🚗✅`,
  ];
  if (opts.trackingUrl) {
    lines.push(`Aquí tienes el detalle del trabajo: ${opts.trackingUrl}`);
  }
  lines.push("¡Te esperamos!");
  return lines.join("\n\n");
}

/** Message to send a quote: total and link to review and approve it. */
export function quoteMessage(opts: {
  customerName?: string;
  vehicleLabel?: string;
  plate?: string;
  tenantName: string;
  total: string;
  link: string;
  reminder?: boolean;
}): string {
  const firstName = opts.customerName?.split(" ")[0];
  const hello = firstName ? `¡Hola ${firstName}!` : "¡Hola!";
  const car = opts.vehicleLabel
    ? `tu ${opts.vehicleLabel}${opts.plate ? ` (${opts.plate})` : ""}`
    : "tu coche";
  if (opts.reminder) {
    return [
      `${hello} Te escribimos de ${opts.tenantName}. Tienes pendiente el presupuesto de ${car} (${opts.total} IVA incluido).`,
      `Lo puedes revisar y aprobar aquí: ${opts.link}`,
      "Si tienes cualquier duda, respóndenos a este mensaje y te llamamos.",
    ].join("\n\n");
  }
  return [
    `${hello} Te escribimos de ${opts.tenantName}. Ya tienes el presupuesto de ${car}: ${opts.total} IVA incluido.`,
    `Puedes verlo y aprobarlo aquí, línea por línea: ${opts.link}`,
    "Cualquier duda, respóndenos a este mensaje.",
  ].join("\n\n");
}
