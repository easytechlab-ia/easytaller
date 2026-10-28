# EasyTaller

Demo de app para talleres de coches, creada por **EasyTech**: web pública del taller, citas online y panel de gestión pensado para usarse desde el móvil (agenda, estado de cada coche con aviso al cliente, fichas con historial y recordatorios de ITV/revisión).

Todo funciona en el navegador: no hay backend y los datos de ejemplo se guardan en `localStorage`. Desde el botón **Demo** se puede reiniciar la demo en cualquier momento.

## Tecnología

- React 19 + TypeScript
- Vite
- TanStack Router (rutas por archivos en `src/routes/`; `src/routeTree.gen.ts` se genera solo al arrancar o compilar)
- Tailwind CSS 4 + shadcn/ui
- Publicación en Vercel como web estática (`vercel.json` redirige todas las rutas a `index.html`)

## Desarrollo

Requiere Node.js 20.19 o superior.

```sh
npm install
npm run dev        # servidor de desarrollo
npm run build      # build de producción en dist/
npm run preview    # sirve el build localmente
npm run typecheck  # comprobación de tipos (tras haber arrancado dev o build una vez)
```

## Estructura

- `src/routes/` — pantallas (web pública, reserva, panel del taller, vista del cliente)
- `src/lib/db/` — capa de datos: repositorios, almacenamiento y datos de ejemplo (`seed.ts`). Es el único sitio que toca `localStorage`, para poder cambiarlo por una base de datos real más adelante.
- `src/lib/` — lógica de negocio (citas, órdenes, recordatorios, vehículos…)
- `src/components/` — componentes de la app y de la interfaz

Basada en un caso de uso de la comunidad de formación, adaptada por EasyTech.
