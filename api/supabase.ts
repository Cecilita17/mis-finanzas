import { asVercel } from "../server/vercel.js";
export const config = { maxDuration: 30 };
export async function handler(request: Request) {
  const target = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!target || !key)
    return Response.json(
      { message: "La conexión a Supabase está pendiente de configuración." },
      { status: 503 },
    );
  const url = new URL(request.url);
  const path =
    url.searchParams.get("_path") ??
    (url.pathname.startsWith("/backend/")
      ? url.pathname.slice("/backend/".length)
      : "");
  if (
    !/^(auth\/v1\/(token|signup|logout|user|verify|recover)|rest\/v1\/(finance_ledgers|rpc\/save_finance_ledger)|storage\/v1\/object\/(sign\/|authenticated\/)?receipts(?:\/[\w.\/-]+)?)$/.test(
      path,
    ) ||
    path.split("/").some((p) => p === ".." || p === ".")
  )
    return new Response(null, { status: 404 });
  if (path === "rest/v1/finance_ledgers" && request.method !== "GET")
    return new Response(null, { status: 405 });
  if (path.includes("/rpc/") && request.method !== "POST")
    return new Response(null, { status: 405 });
  for (const parameter of ["_path", "path", "_vercel_share"]) {
    url.searchParams.delete(parameter);
  }
  const headers = new Headers();
  for (const name of [
    "authorization",
    "content-type",
    "accept",
    "prefer",
    "range",
    "range-unit",
    "content-profile",
    "accept-profile",
    "cache-control",
    "x-upsert",
    "x-client-info",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("apikey", key);
  if (headers.get("authorization") === "Bearer backend-proxy")
    headers.delete("authorization");
  try {
    const response = await fetch(new URL("/" + path + url.search, target), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: "manual",
    });
    const outgoing = new Headers(response.headers);
    for (const h of ["content-encoding", "content-length", "set-cookie"])
      outgoing.delete(h);
    outgoing.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { message: "Supabase no está disponible en este momento." },
      { status: 502 },
    );
  }
}

export default asVercel(handler);
