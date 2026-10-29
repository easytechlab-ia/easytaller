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

interface CarMessageOpts {
  customerName?: string;
  vehicleLabel?: string;
  plate?: string;
  tenantName: string;
  trackingUrl?: string;
}

function greeting(customerName?: string): string {
  const firstName = customerName?.split(" ")[0];
  return firstName ? `¡Hola ${firstName}!` : "¡Hola!";
}

function carLabel(o: CarMessageOpts): string {
  return o.vehicleLabel
    ? `tu ${o.vehicleLabel}${o.plate ? ` (${o.plate})` : ""}`
    : "tu coche";
}

/** Car just received: send the link where the customer follows the repair. */
export function receivedMessage(o: CarMessageOpts): string {
  return [
    `${greeting(o.customerName)} Te escribimos de ${o.tenantName}: ya tenemos ${carLabel(o)} en el taller.`,
    o.trackingUrl
      ? `Aquí puedes ver cómo va en todo momento (estado, fotos y presupuesto): ${o.trackingUrl}`
      : "",
    "Te avisaremos por aquí en cuanto tengamos novedades.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Car handed back: thanks + summary and the car's history. */
export function deliveredMessage(o: CarMessageOpts & { askReview?: boolean }): string {
  return [
    `${greeting(o.customerName)} Gracias por confiar en ${o.tenantName}.`,
    o.trackingUrl
      ? `Aquí tienes el resumen del trabajo y el historial de ${carLabel(o)}: ${o.trackingUrl}`
      : "",
    o.askReview ? "Si nos dejas tu opinión ahí mismo, nos ayudas mucho. 🙏" : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Any other moment: a short update on where the repair is. */
export function progressMessage(
  o: CarMessageOpts & { status: string; readyBy?: string },
): string {
  const car = carLabel(o);
  const body: Record<string, string> = {
    diagnostico: `Estamos revisando ${car} para ver qué necesita.`,
    presupuesto_enviado: `Tienes pendiente el presupuesto de ${car}.`,
    aprobado: `Ya tenemos tu aprobación: nos ponemos con ${car}.`,
    en_reparacion: `Estamos trabajando en ${car}.`,
  };
  return [
    `${greeting(o.customerName)} Te escribimos de ${o.tenantName}. ${body[o.status] ?? `Te contamos cómo va ${car}.`}${o.readyBy ? ` Lo tendremos listo el ${o.readyBy}.` : ""}`,
    o.trackingUrl ? `Puedes verlo aquí: ${o.trackingUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** What the customer sends the shop from their repair page. */
export function customerToShopMessage(o: {
  vehicleLabel?: string;
  plate?: string;
  code: string;
}): string {
  const car = o.vehicleLabel ? `el ${o.vehicleLabel}${o.plate ? ` (${o.plate})` : ""}` : "mi coche";
  return `Hola, os escribo por ${car}, código ${o.code}. `;
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

/** Online booking confirmed by the shop. */
export function appointmentConfirmedMessage(o: {
  customerName?: string;
  tenantName: string;
  when: string; // "jueves 30 de octubre a las 10:00"
  plate?: string;
}): string {
  return `${greeting(o.customerName)} Te escribimos de ${o.tenantName}: tu cita queda confirmada para el ${o.when}${o.plate ? ` (${o.plate})` : ""}. ¡Te esperamos!`;
}

/** The shop can't take the requested time and proposes another. */
export function appointmentProposalMessage(o: {
  customerName?: string;
  tenantName: string;
  when: string;
}): string {
  return `${greeting(o.customerName)} Te escribimos de ${o.tenantName}. A la hora que pediste no podemos atenderte. ¿Te va bien el ${o.when}? Respóndenos por aquí y te la confirmamos.`;
}
