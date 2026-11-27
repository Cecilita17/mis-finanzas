import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const cookie = "__Host-mp-pkce";
const options = "Path=/; Secure; HttpOnly; SameSite=Lax";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const redirectUri = "https://mis-finanzas-ten-ecru.vercel.app/api/mercadopago/callback";
const withdrawals = "https://api.mercadopago.com/v1/reporting/operations/activities_withdraw";
const reportIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const random = () => randomBytes(32).toString("base64url");

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function mercadoPago(request: Request) {
  const { MERCADOPAGO_CLIENT_ID: clientId, MERCADOPAGO_CLIENT_SECRET: secret,
    SUPABASE_URL: supabase, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
  const url = new URL(request.url);
  const callback = url.pathname.endsWith("/callback");
  const finish = (result: string) => new Response(null, {
    status: 303,
    headers: { ...headers, Location: "/?mp-prueba=" + result,
      "Set-Cookie": `${cookie}=; ${options}; Max-Age=0` },
  });
  const error = (status: number) => Response.json({}, { status, headers });
  if (request.method !== (callback ? "GET" : "POST")) return error(405);
  if (!clientId || !secret || !supabase || !key) return callback ? finish("error") : error(503);

  if (!callback) {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return error(401);
    const admin = await fetch(new URL("/rest/v1/rpc/is_finance_admin", supabase), {
      method: "POST",
      headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (!admin.ok || await admin.json() !== true) return error(403);
    const state = random();
    const verifier = random();
    const selection = url.searchParams.get("report");
    const id = url.searchParams.get("uid") ?? "";
    if (selection === "withdraw-check" && !reportIdPattern.test(id)) return error(400);
    const mode = selection === "withdraw-check" ? "withdraw-check:" + id :
      selection === "withdraw-create" || selection === "create" ? selection : "list";
    const value = `${state}.${verifier}.${Date.now()}.${mode}`;
    const authorize = new URL("https://auth.mercadopago.com.ar/authorization");
    authorize.search = new URLSearchParams({
      client_id: clientId, response_type: "code", platform_id: "mp",
      redirect_uri: redirectUri, state, code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    return Response.json({ url: authorize.href }, {
      headers: { ...headers, "Set-Cookie": `${cookie}=${value}.${sign(value, secret)}; ${options}; Max-Age=600` },
    });
  }

  const raw = request.headers.get("Cookie")?.split(/;\s*/).find(part => part.startsWith(cookie + "="))?.slice(cookie.length + 1);
  const match = /^([\w-]{43})\.([\w-]{43})\.(\d{13})\.(create|list|withdraw-create|withdraw-check:[\w-]{1,80})\.([a-f0-9]{64})$/.exec(raw ?? "");
  if (!match) return finish("error");
  const [, state, verifier, issued, mode, signature] = match;
  const age = Date.now() - Number(issued);
  if (age < 0 || age > 600_000 || state !== url.searchParams.get("state") ||
    !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(`${state}.${verifier}.${issued}.${mode}`, secret), "hex"))) return finish("error");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return finish("error");

  try {
    const token = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId, client_secret: secret, grant_type: "authorization_code",
        code, redirect_uri: redirectUri, code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!token.ok) return finish("token");
    const { access_token: accessToken, user_id: authorizedId } = await token.json();
    if (typeof accessToken !== "string" || !accessToken) return finish("token");
    const mpHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const productionToken = process.env.MERCADOPAGO_REPORTS_ACCESS_TOKEN;
    let verifiedProductionToken: string | null | undefined;
    async function withdrawalRequest(path: string, init: RequestInit) {
      const response = await fetch(withdrawals + path, { ...init, headers: mpHeaders });
      if (![401, 403].includes(response.status) || !productionToken ||
          !/^\d+$/.test(String(authorizedId ?? ""))) return response;
      if (verifiedProductionToken === undefined) {
        const owner = await fetch("https://api.mercadopago.com/users/me", {
          headers: { Authorization: `Bearer ${productionToken}` },
          signal: AbortSignal.timeout(5000),
        });
        const info = owner.ok ? await owner.json().catch(() => null) : null;
        verifiedProductionToken = String(info?.id ?? "") === String(authorizedId) ? productionToken : null;
      }
      if (!verifiedProductionToken) return response;
      return fetch(withdrawals + path, {
        ...init,
        headers: { ...mpHeaders, Authorization: `Bearer ${verifiedProductionToken}` },
        signal: AbortSignal.timeout(6000),
      });
    }
    const rejected = async (stage: string, response: Response) => {
      const body = await response.json().catch(() => null);
      const candidates: unknown[] = [
        body?.error?.code, body?.cause?.[0]?.code, body?.errors?.[0]?.code, body?.code, body?.error,
      ];
      const code = candidates.find(value =>
        typeof value === "string" && /^[a-z][a-z0-9_.-]{1,63}$/i.test(value),
      );
      const query = new URLSearchParams({ "mp-etapa": stage, "mp-http": String(response.status) });
      if (typeof code === "string") query.set("mp-codigo", code);
      const message = [body?.message, body?.error?.message, body?.cause?.[0]?.description]
        .filter(value => typeof value === "string").join(" ").toLowerCase();
      const fields = ["file_format", "display_timezone", "columns", "notifiers", "internal_sftp", "structure"];
      const field = fields.find(value => message.includes(value));
      if (field) query.set("mp-campo", field);
      return finish("retiros-error&" + query.toString());
    };
    if (mode.startsWith("withdraw-check:")) {
      const id = mode.slice("withdraw-check:".length);
      const report = await withdrawalRequest(`/statements/${id}`, {
        headers: mpHeaders,
        signal: AbortSignal.timeout(6000),
      });
      if (!report.ok) return rejected("consulta", report);
      const { status } = await report.json();
      if (["pending", "available", "failed", "empty"].includes(status)) return finish("retiros-" + status);
      return finish("retiros-desconocido");
    }
    if (mode === "create" || mode === "withdraw-create") {
      const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Argentina/Cordoba",
      }).format(new Date());
      const midnight = Date.parse(today + "T00:00:00-03:00");
      const end = new Date(midnight - 1000);
      const begin = new Date(midnight - 7 * 86_400_000);
      if (mode === "withdraw-create") {
        const config = await withdrawalRequest("/config", {
          headers: mpHeaders,
          signal: AbortSignal.timeout(6000),
        });
        if (config.status === 404) {
          const setup = await withdrawalRequest("/config", {
            method: "POST",
            headers: mpHeaders,
            body: JSON.stringify({
              structure: {
                name: "Mis Finanzas",
                columns: ["date_created", "operation_id", "status", "operation_type", "transaction_amount"].map(key => ({ key })),
              },
              notifiers: [{ type: "internal_sftp", data: {} }],
            }),
            signal: AbortSignal.timeout(6000),
          });
          if (!setup.ok) return rejected("crear-configuracion", setup);
        } else if (!config.ok) {
          return rejected("consultar-configuracion", config);
        }
        const report = await withdrawalRequest("/statements", {
          method: "POST",
          headers: mpHeaders,
          body: JSON.stringify({
            filters: { creation_date: { range: { gte: begin.toISOString(), lte: end.toISOString() } } },
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (!report.ok) return rejected("generacion", report);
        const { record_id: id } = await report.json();
        if (typeof id !== "string" || !reportIdPattern.test(id)) return finish("retiros-desconocido");
        return finish("retiros-solicitado&mp-uid=" + id);
      }
      const report = await fetch("https://api.mercadopago.com/v1/account/settlement_report", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ begin_date: begin.toISOString(), end_date: end.toISOString() }),
        signal: AbortSignal.timeout(8000),
      });
      if (report.ok) return finish("solicitado");
      const body: unknown = await report.json().catch(() => null);
      const code = body && typeof body === "object" && "error" in body &&
        typeof body.error === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(body.error)
        ? body.error : null;
      return finish(`reporte-error&mp-http=${report.status}${code ? "&mp-codigo=" + code : ""}`);
    }
    const reports = await fetch("https://api.mercadopago.com/v1/account/settlement_report/list", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    const result = reports.ok ? await reports.json() : null;
    if (!Array.isArray(result)) return finish("sin-acceso");
    return finish(result.length ? "con-reportes" : "sin-reportes");
  } catch {
    return finish("error");
  }
}
