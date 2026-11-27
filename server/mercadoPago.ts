import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const cookie = "__Host-mp-pkce";
const options = "Path=/; Secure; HttpOnly; SameSite=Lax";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const redirectUri = "https://mis-finanzas-ten-ecru.vercel.app/api/mercadopago/callback";
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
    const value = `${state}.${verifier}.${Date.now()}`;
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
  const match = /^([\w-]{43})\.([\w-]{43})\.(\d{13})\.([a-f0-9]{64})$/.exec(raw ?? "");
  if (!match) return finish("error");
  const [, state, verifier, issued, signature] = match;
  const age = Date.now() - Number(issued);
  if (age < 0 || age > 600_000 || state !== url.searchParams.get("state") ||
    !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(`${state}.${verifier}.${issued}`, secret), "hex"))) return finish("error");
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
    const { access_token: accessToken } = await token.json();
    if (typeof accessToken !== "string" || !accessToken) return finish("token");
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
