import { createFileRoute, redirect } from "@tanstack/react-router";
import { IS_DEMO } from "@/lib/mode";
import { LegalPage } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/privacidad")({
  // SaaS-only page: the demo goes straight to the shop website.
  beforeLoad: () => {
    if (IS_DEMO) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Política de privacidad · EasyTaller" },
      {
        name: "description",
        content: "Cómo EasyTaller trata y protege los datos personales. Plantilla de ejemplo.",
      },
      { property: "og:title", content: "Política de privacidad · EasyTaller" },
      {
        property: "og:description",
        content: "Cómo EasyTaller trata y protege los datos personales. Plantilla de ejemplo.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      updated="31 de mayo de 2026"
      intro="Tu privacidad nos importa. Este documento explica, de forma general, qué datos se tratan al usar EasyTaller y con qué finalidad."
      sections={[
        {
          heading: "Responsable del tratamiento",
          body: (
            <p>
              EasyTaller actúa como responsable del tratamiento de los datos facilitados a través de su
              sitio y de la aplicación. Puedes contactarnos en cualquier momento desde la página de
              contacto.
            </p>
          ),
        },
        {
          heading: "Datos que recogemos",
          body: (
            <p>
              Datos identificativos y de contacto (nombre, email, taller), datos de uso del servicio
              y, en su caso, información de vehículos y órdenes necesaria para prestar el servicio.
            </p>
          ),
        },
        {
          heading: "Finalidad",
          body: (
            <p>
              Tratamos los datos para prestar y mejorar el servicio, gestionar la relación con los
              talleres y sus clientes, y responder a solicitudes de información o soporte.
            </p>
          ),
        },
        {
          heading: "Base legitimadora",
          body: (
            <p>
              La ejecución del contrato, el consentimiento del usuario y el interés legítimo en la
              mejora del servicio, según corresponda en cada caso.
            </p>
          ),
        },
        {
          heading: "Conservación",
          body: (
            <p>
              Conservamos los datos durante el tiempo necesario para la finalidad para la que fueron
              recabados y para cumplir las obligaciones legales aplicables.
            </p>
          ),
        },
        {
          heading: "Tus derechos",
          body: (
            <p>
              Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación
              y portabilidad dirigiéndote a nosotros a través de la página de contacto.
            </p>
          ),
        },
      ]}
    />
  );
}
