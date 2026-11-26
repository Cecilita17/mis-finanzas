# Mis Finanzas

Organizador de finanzas personales en español rioplatense. La interfaz móvil se inspira en la maqueta y se adapta a tablet y escritorio. Arranca con $1.600.000 ARS de presupuesto, 13 categorías, el grupo Alimentación y cero movimientos. USD 40 de suscripciones se estima inicialmente a $84.760 ARS.

## Ejecutar

Requiere Node.js 22 o superior.

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Sin variables de entorno se puede recorrer la interfaz y consultar el presupuesto inicial. Guardar gastos, editar datos y usar el asistente requieren una cuenta autenticada. Vite expone los mismos handlers de API durante el desarrollo.

## Conectar los servicios

1. Creá o seleccioná un proyecto de **Supabase** dedicado para Mis Finanzas. Aplicá `supabase/migrations/202611260001_finances.sql` con la CLI de Supabase o el editor SQL. Dejá habilitado el ingreso por correo y contraseña.
2. En Authentication → URL Configuration configurá la URL pública de la app como Site URL. Agregá las URL autorizadas de desarrollo y preview a Redirect URLs cuando corresponda. Si la confirmación está habilitada, probá la entrega de correo para cuentas reales.
3. Copiá `.env.example` a `.env.local` para desarrollo. En Vercel importá el directorio o el repositorio como proyecto Vite y cargá estas variables para el entorno correspondiente. Volvé a compilar al cambiar `VITE_ENABLE_SUPABASE`.

| Variable                    | Dónde se usa                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `VITE_ENABLE_SUPABASE=true` | Bandera pública para habilitar cuentas                                                   |
| `SUPABASE_URL`              | Backend, URL del proyecto                                                                |
| `SUPABASE_PUBLISHABLE_KEY`  | Backend, clave publicable del proyecto                                                   |
| `GROQ_API_KEY`              | Backend, credencial de Groq                                                              |
| `FINANCE_PROPOSAL_SECRET`   | Backend, secreto aleatorio para firmar propuestas. Generá uno con `openssl rand -hex 32` |
| `GROQ_TEXT_MODEL`           | Opcional, utiliza `openai/gpt-oss-120b` por defecto                                      |
| `GROQ_VISION_MODEL`         | Opcional, utiliza `qwen/qwen3.8-27b` por defecto                                         |

Los modelos configurados deben admitir JSON Object Mode, y el modelo de tickets también debe admitir imágenes. Verificá su disponibilidad en el proyecto de Groq al desplegar. La ruta `/backend/*` conecta el cliente con Supabase mediante el backend de Vercel. En el navegador quedan el JWT de sesión y una bandera de configuración. Las consultas financieras estructuradas se calculan en el servidor después de que Groq identifica la intención.

## Datos y reglas

- Supabase Auth administra las cuentas. `finance_ledgers` contiene un documento JSONB versionado por usuario con categorías, presupuestos y asignaciones, movimientos, vencimientos, aportes, conversaciones y referencias a comprobantes. Las escrituras comparan la versión y reintentan en caso de concurrencia. Al volver a la app o cada 12 segundos se consulta la versión remota.
- Los importes se guardan en centavos. Los movimientos USD mantienen la cotización usada al registrarse. Los presupuestos y las conversiones futuras pueden personalizarse por mes.
- Las obligaciones de ejemplo se ofrecen como plantillas para que el usuario configure sus vencimientos. Para conciliar un resumen, el período se define con el día de cierre opcional. Si se carga un importe que contiene compras ya registradas con el método «Tarjeta de crédito», se registra solo la parte pendiente del resumen.
- El fondo destina presupuesto mensual y permite registrar aportes y usos. El indicador diario resta obligaciones y reservas antes de repartir el saldo entre los días restantes.
- Los comprobantes se guardan en un bucket privado, admiten JPG, PNG o WebP de hasta 4 MB y se vinculan con los movimientos por ruta. El hash del archivo se comprueba al confirmar. Cuando la lectura identifica todos los datos necesarios, también se compara una huella del comercio, fecha, total y líneas.
- La PWA instala la interfaz y sus recursos. Las consultas y escrituras de la cuenta requieren conexión. La caché del service worker guarda únicamente recursos de la interfaz.

## Verificación de puesta en marcha

- Creá dos cuentas de prueba. Verificá que sus categorías, movimientos y comprobantes se mantengan aislados.
- Guardá un gasto manual, archivá su categoría y comprobá que el movimiento siga en el historial. Revisá la sincronización desde un segundo dispositivo.
- Probá el mensaje «Hoy gasté 15k en pollo y verduras, 3k en galletitas y 6k en Uber». Revisá categorías y total de $24.000 antes de confirmar.
- Escaneá un ticket real con descuentos. Editá una línea, ajustá el cuadre con el total y volvé a subir el mismo archivo para comprobar que aparece el aviso de duplicado.
- Configurá una obligación y simulá un resumen con compras ya registradas. Comprobá que un pago pendiente afecta el saldo libre y que el resumen no vuelve a sumar las compras conciliadas.
- Abrí la URL HTTPS en Chrome para Android. Seleccioná «Instalar aplicación» y abrila desde la pantalla de inicio para comprobar el modo standalone.

Las pruebas automatizadas incluyen el presupuesto inicial, las conversiones ARS/USD, la conciliación de tarjeta, la reserva, la proyección y la validación del backend con respuestas controladas de Supabase y Groq.

También se verificaron cuatro tamaños de pantalla (320, 390, 768 y 1440 px), la instalabilidad en Chromium y la reapertura de la interfaz sin conexión. El flujo autenticado de gastos, categorías y pagos se probó con una API controlada. La migración de Postgres se ejecutó localmente con dos identidades para comprobar el aislamiento. Queda pendiente probar Supabase y Groq en vivo y confirmar la instalación en un dispositivo Android.
