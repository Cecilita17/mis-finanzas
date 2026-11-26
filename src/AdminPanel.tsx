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

export default function AdminPanel() {
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
