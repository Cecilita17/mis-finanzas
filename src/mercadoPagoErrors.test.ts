import test from "node:test";
import assert from "node:assert/strict";
import { safeErrorDetail } from "../server/mercadoPagoErrors";

test("muestra el mensaje de validación de Mercado Pago sin datos sensibles", () => {
  const detail = safeErrorDetail({
    message: "invalid structure.file_format.date_format for user 123456789",
    error: "bad_request",
    cause: [{ code: 4001, description: "Mail ana@example.com no valido" }],
    token: "APP_USR-1234567890-abcdef",
  });
  assert.match(detail, /structure\.file_format\.date_format/);
  assert.match(detail, /bad_request/);
  assert.doesNotMatch(detail, /123456789|ana@|APP_USR|example\.com/);
});

test("descarta tokens largos, URLs y cuerpos que no son objetos", () => {
  assert.equal(safeErrorDetail(null), "");
  assert.equal(safeErrorDetail("texto"), "");
  const detail = safeErrorDetail({
    message: "ver https://x.test/a?t=1 token abcdefghijklmnopqrstuvwxyz0123 <script>",
  });
  assert.doesNotMatch(detail, /https|abcdefghijklmnop/);
  assert.ok(detail.length <= 240);
});
