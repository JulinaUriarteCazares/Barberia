# BarberHost — Sistema de Gestión de Citas

Sistema completo de reservas para barbería construido con Next.js 16, Supabase y Stripe.

## Requisitos previos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (base de datos PostgreSQL)
- Cuenta en [Stripe](https://stripe.com) (pagos — modo test)
- Cuenta en [Resend](https://resend.com) (emails de confirmación — opcional)

---

## Instalación

```bash
cd BarberHost
npm install
```

---

## Variables de entorno

Crea `.env.local` en la raíz de `BarberHost/`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_KEY=<service_role key>

# Stripe
STRIPE_SECRET_KEY=sk_test_<clave secreta>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_<clave pública>

# URL base (para redirects de Stripe)
NEXT_PUBLIC_URL=http://localhost:3000

# Resend — opcional, para emails de confirmación
RESEND_API_KEY=re_<api key>
```

> **Nota:** `SUPABASE_SERVICE_KEY` omite RLS. Nunca lo expongas en el cliente (`NEXT_PUBLIC_`).

---

## Base de datos

Ejecuta el SQL en el **SQL Editor** de Supabase para crear las tablas. Los servicios de ejemplo y el usuario administrador se insertan automáticamente la primera vez que arranca la app.

---

## Correr el proyecto

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).  
El servidor escucha en `0.0.0.0:3000` — accesible también desde la red local.

---

## Credenciales de administrador

| Campo | Valor |
|-------|-------|
| Email | admin@barberhost.com |
| Contraseña | admin123 |

Panel: [http://localhost:3000/admin](http://localhost:3000/admin)

> Cambia la contraseña desde el SQL Editor de Supabase antes de producción.

---

## Scripts

```bash
npm run dev      # Desarrollo (Next.js + Turbopack)
npm run build    # Build de producción
npm run start    # Producción
npm run lint     # ESLint
```

---

## Dependencias

### Producción

| Paquete | Versión | Uso |
|---------|---------|-----|
| `next` | 16.2.9 | Framework (App Router + Turbopack) |
| `react` / `react-dom` | 19.1.0 | UI |
| `@supabase/supabase-js` | 2.108.1 | Base de datos (Supabase/PostgreSQL) |
| `stripe` | 22.2.0 | Pagos con tarjeta |
| `date-fns` | 4.1.0 | Manipulación de fechas |
| `react-day-picker` | 9.7.0 | Selector de calendario |
| `react-hook-form` | 7.57.0 | Formularios |
| `@hookform/resolvers` | 5.0.1 | Integración Zod + react-hook-form |
| `zod` | 3.25.51 | Validación de esquemas |
| `@react-pdf/renderer` | 4.3.0 | Generación de PDFs |
| `recharts` | 2.15.3 | Gráficas del dashboard |
| `sonner` | 2.0.5 | Notificaciones toast |
| `bcryptjs` | 3.0.2 | Hash de contraseñas admin |
| `lucide-react` | 0.513.0 | Íconos |
| `@radix-ui/*` | ^1–2 | Primitivos de UI (shadcn/ui) |
| `clsx` | 2.1.1 | Utilidad de clases CSS |
| `tailwind-merge` | 3.3.0 | Merge de clases Tailwind |
| `class-variance-authority` | 0.7.1 | Variantes de componentes |

### Desarrollo

| Paquete | Versión | Uso |
|---------|---------|-----|
| `typescript` | 5.9.3 | Tipado estático |
| `tailwindcss` | 4.1.8 | Estilos CSS |
| `@tailwindcss/postcss` | 4.1.8 | Plugin PostCSS para Tailwind |
| `eslint` | 9.28.0 | Linter |
| `eslint-config-next` | 15.3.3 | Reglas ESLint para Next.js |
| `@types/node` | 22.19.21 | Tipos Node.js |
| `@types/react` | 19.2.17 | Tipos React |
| `@types/bcryptjs` | 2.4.6 | Tipos bcryptjs |

> **Resend** no requiere paquete npm — el email se envía vía HTTP a `api.resend.com` usando fetch nativo.

---

## Flujo de reserva

1. **Servicios** — El cliente elige uno o más servicios del catálogo
2. **Fecha** — Elige un día disponible en el calendario
3. **Horario** — Elige un slot; el sistema crea un *hold* que bloquea ese slot 15 minutos
4. **Datos y pago** — Introduce sus datos y paga con Stripe Checkout
5. **Confirmación** — La cita se confirma automáticamente al completar el pago y se envía comprobante por email

## Seguridad

- El slot se bloquea con un *hold* antes de iniciar el pago (evita doble reserva)
- El teléfono del cliente no aparece en los PDFs del lado público
- Reprogramar desde "Mis Citas" requiere verificar el número de teléfono
- El panel de administración está protegido con sesión por cookie HTTP-only
