import { useEffect, useState } from "react";
import { db } from "./store";

type Account = {
  id: string;
  email: string | null;
  created_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
};
type Overview = {
  metrics: {
    registered: number;
    confirmed: number;
    active_last_30_days: number;
  };
  users: Account[];
};
const pageSize = 30;
const date = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const results: Record<string, string> = {
  "con-reportes": "Autorización exitosa. Mercado Pago permite ver la lista de reportes existentes.",
  "sin-reportes": "Autorización exitosa. Mercado Pago devolvió una lista vacía de reportes.",
  "sin-acceso": "Autorización exitosa. La API no devolvió una lista de reportes utilizable.",
  solicitado: "Mercado Pago recibió la solicitud. Cuando termine de generar el reporte, usá Consultar reportes.",
  "reporte-error": "Mercado Pago no aceptó la solicitud de reporte.",
  "retiros-solicitado": "Mercado Pago recibió la solicitud. Consultá el estado después de unos minutos.",
  "retiros-pending": "Mercado Pago está preparando el reporte.",
  "retiros-available": "El reporte de retiros y transferencias está disponible en Mercado Pago.",
  "retiros-failed": "Mercado Pago no pudo preparar el reporte.",
  "retiros-empty": "Mercado Pago no encontró operaciones para esos siete días.",
  "retiros-desconocido": "Mercado Pago devolvió una respuesta que no pude interpretar.",
  token: "Mercado Pago rechazó el intercambio de la autorización.",
  error: "La autorización no se completó. Volvé a iniciar la prueba.",
};

export default function AdminPanel() {
  const [reportId] = useState(() => {
    const incoming = new URLSearchParams(window.location.search).get("mp-uid");
    const previous = window.sessionStorage.getItem("mp-withdraw-probe-id");
    const id = incoming ?? previous ?? "";
    return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : "";
  });
  useEffect(() => {
    if (reportId) window.sessionStorage.setItem("mp-withdraw-probe-id", reportId);
  }, [reportId]);
  const [probe, setProbe] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("mp-prueba");
    const http = params.get("mp-http") ?? "";
    const code = params.get("mp-codigo") ?? "";
    const stage = params.get("mp-etapa");
    if (status === "retiros-error" && /^[45]\d{2}$/.test(http)) {
      const step = stage === "configuracion" ? "configuración" : stage === "generacion" ? "generación" : "consulta";
      const detail = http === "401" || http === "403"
        ? " El acceso a la API de reportes fue denegado. El acceso de producción debe corresponder a la cuenta que autorizaste."
        : "";
      return `Mercado Pago rechazó la ${step} del reporte de retiros (HTTP ${http}).${detail}`;
    }
    if (status === "reporte-error" && /^[45]\d{2}$/.test(http)) {
      return `Mercado Pago rechazó el reporte (HTTP ${http}${/^[a-z][a-z0-9_]{0,63}$/.test(code) ? ", " + code : ""}).`;
    }
    return status ? results[status] ?? "" : "";
  });
  const [probing, setProbing] = useState(false);

  async function connectMercadoPago(mode: "create" | "list" | "withdraw-create" | "withdraw-check") {
    setProbing(true);
    setProbe("");
    try {
      const { data } = await db!.auth.getSession();
      if (!data.session) throw new Error();
      const query = new URLSearchParams({ report: mode });
      if (mode === "withdraw-check") query.set("uid", reportId);
      const response = await fetch(`/api/mercadopago/start?${query}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (response.status === 503) {
        setProbe("Las credenciales de Mercado Pago todavía no están disponibles en este despliegue.");
        return;
      }
      if (!response.ok) throw new Error();
      const target = new URL((await response.json()).url);
      if (target.origin !== "https://auth.mercadopago.com.ar") throw new Error();
      window.location.assign(target.href);
    } catch {
      setProbe("No se pudo iniciar la prueba con Mercado Pago.");
    } finally {
      setProbing(false);
    }
  }

  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void db!
      .rpc("finance_admin_users", { page_offset: offset })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(true);
          return;
        }
        setResult(data as Overview);
      });
    return () => {
      active = false;
    };
  }, [offset]);

  const paginate = (next: number) => {
    setResult(null);
    setError(false);
    setOffset(next);
  };

  if (error)
    return (
      <p className="error" role="alert">
        No se pudo cargar el panel. Volvé a abrirlo para reintentar.
      </p>
    );
  if (!result) return <p role="status">Cargando usuarios…</p>;

  return (
    <section className="card inner-card" aria-label="Usuarios registrados">
      <div>
        <button type="button" disabled={probing} onClick={() => void connectMercadoPago("list")}>
          {probing ? "Abriendo Mercado Pago…" : "Consultar reportes de Mercado Pago"}
        </button>
        <button type="button" disabled={probing} onClick={() => void connectMercadoPago("create")}>
          Generar reporte de los últimos 7 días
        </button>
        <p>Mercado Pago pedirá autorización. Se muestran los resultados de la prueba de reportes.</p>
        <h2>Retiros y transferencias salientes</h2>
        <p>Prueba de los últimos siete días completos. Mercado Pago puede requerir crear una configuración de reporte.</p>
        <button className="primary" type="button" disabled={probing} onClick={() => void connectMercadoPago("withdraw-create")}>
          Generar reporte de transferencias
        </button>
        {reportId && (
          <button className="secondary" type="button" disabled={probing} onClick={() => void connectMercadoPago("withdraw-check")}>
            Consultar estado del reporte
          </button>
        )}
        {probe && <p role="status">{probe}</p>}
      </div>
      <div className="metrics">
        <div>
          <small>Registrados</small>
          <b>{result.metrics.registered}</b>
        </div>
        <div>
          <small>Correo confirmado</small>
          <b>{result.metrics.confirmed}</b>
        </div>
        <div>
          <small>Activos en 30 días</small>
          <b>{result.metrics.active_last_30_days}</b>
        </div>
      </div>
      <h2>Usuarios registrados</h2>
      {result.users.length === 0 && (
        <p className="muted">No hay cuentas en esta página.</p>
      )}
      <ul className="admin-users">
        {result.users.map((user) => (
          <li key={user.id}>
            <strong>{user.email ?? "Sin correo electrónico"}</strong>
            <small>
              {user.email_confirmed_at
                ? "Correo confirmado"
                : "Correo sin confirmar"}
            </small>
            <dl>
              <div>
                <dt>Registro</dt>
                <dd>
                  {user.created_at
                    ? date.format(new Date(user.created_at))
                    : "Sin datos"}
                </dd>
              </div>
              <div>
                <dt>Último acceso</dt>
                <dd>
                  {user.last_sign_in_at
                    ? date.format(new Date(user.last_sign_in_at))
                    : "Sin datos"}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      {(offset > 0 || result.metrics.registered > pageSize) && (
        <div className="actions" aria-label="Páginas de usuarios">
          <button
            className="secondary"
            disabled={offset === 0}
            onClick={() => paginate(offset - pageSize)}
          >
            Anterior
          </button>
          <button
            className="secondary"
            disabled={offset + pageSize >= result.metrics.registered}
            onClick={() => paginate(offset + pageSize)}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
