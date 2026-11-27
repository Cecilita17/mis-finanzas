// Resume el cuerpo de error de Mercado Pago para mostrarlo solo al administrador.
// Solo conserva texto de validación: descarta correos, números largos, tokens y URLs.
const allowed = /[^\p{L}\p{N} .,:;'"()[\]/_=<>-]/gu;

export function safeErrorDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const source = body as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const nested = (value: unknown) =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const parts = [
    source.message,
    source.error,
    nested(source.error).message,
    ...list(source.cause).flatMap(item => [nested(item).code, nested(item).description]),
    ...list(source.errors).flatMap(item => [nested(item).code, nested(item).message]),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return [...new Set(parts)].join(" | ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "")
    .replace(/\b(?:APP_USR|TEST)-[\w-]+/g, "")
    .replace(/\b[\w-]{24,}\b/g, "")
    .replace(/\d{5,}/g, "#")
    .replace(allowed, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
