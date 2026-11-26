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
