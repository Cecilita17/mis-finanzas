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
  "reporte-permiso": "Mercado Pago rechazó el permiso para generar el reporte.",
  "reporte-error": "Mercado Pago no aceptó la solicitud de reporte.",
  token: "Mercado Pago rechazó el intercambio de la autorización.",
  error: "La autorización no se completó. Volvé a iniciar la prueba.",
};

export default function AdminPanel() {
  const [probe, setProbe] = useState(() => {
    const status = new URLSearchParams(window.location.search).get("mp-prueba");
    return status ? results[status] ?? "" : "";
  });
  const [probing, setProbing] = useState(false);

  async function connectMercadoPago(mode: "create" | "list") {
    setProbing(true);
    setProbe("");
    try {
      const { data } = await db!.auth.getSession();
      if (!data.session) throw new Error();
      const response = await fetch(`/api/mercadopago/start?report=${mode}`, {
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
