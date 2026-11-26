import { createClient } from "@supabase/supabase-js";
import { initial, settings, today, type Ledger } from "./model";
const url = window.location.origin + "/backend";
const key = "backend-proxy";
export const db =
  import.meta.env.VITE_ENABLE_SUPABASE === "true"
    ? createClient(url, key)
    : null;
export const initialLedger = (): Ledger => ({
  ...initial,
  months: { [today().slice(0, 7)]: settings(initial, today().slice(0, 7)) },
});
export async function readLedger(id: string) {
  const result = await db!
    .from("finance_ledgers")
    .select("data,version")
    .eq("user_id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (result.data)
    return {
      data: result.data.data as Ledger,
      version: Number(result.data.version),
    };
  return { data: initialLedger(), version: 0 };
}
export async function mutateLedger(
  id: string,
  change: (data: Ledger) => Ledger,
) {
  if (!db) throw new Error("Configurá Supabase para guardar tus datos.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const old = await readLedger(id);
    const next = change(old.data);
    const result = await db.rpc("save_finance_ledger", {
      expected: old.version,
      next_data: next,
    });
    if (result.error) throw result.error;
    if (result.data) return next;
  }
  throw new Error("Los datos cambiaron en otro dispositivo. Volvé a intentar.");
}

export async function deleteAccount(
  id: string,
  email: string,
  password: string,
) {
  if (!db) throw new Error("La conexión a Supabase no está disponible.");
  const confirmed = await db.auth.signInWithPassword({ email, password });
  if (confirmed.error || confirmed.data.user?.id !== id)
    throw new Error("No se pudo verificar la contraseña.");

  const storage = db.storage.from("receipts");
  const paths: string[] = [];
  const folders = [id];
  const pageSize = 100;
  for (const folder of folders) {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await storage.list(folder, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("No se pudieron consultar los comprobantes.");
      for (const object of data) {
        const path = folder + "/" + object.name;
        if (object.id) paths.push(path);
        else folders.push(path);
      }
      if (data.length < pageSize) break;
    }
  }
  for (let offset = 0; offset < paths.length; offset += pageSize) {
    const { error } = await storage.remove(
      paths.slice(offset, offset + pageSize),
    );
    if (error)
      throw new Error(
        "No se pudieron borrar todos los comprobantes. Volvé a intentar.",
      );
  }

  const { error } = await db.rpc("delete_finance_account");
  if (error) throw error;
  await db.auth.signOut({ scope: "local" });
}
