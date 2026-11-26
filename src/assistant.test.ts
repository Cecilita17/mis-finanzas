import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { handler } from "../api/assistant";
import {
  initial,
  today,
  type Expense,
  type Ledger,
  type Message,
} from "./model";

test("valida en backend propuestas de Groq, confirmaciones y tickets duplicados", async () => {
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  const user = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const image = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const hash = createHash("sha256").update(image).digest("hex");
  const path = user + "/" + hash + ".png";
  const date = today();
  let ledger: Ledger = structuredClone(initial);
  let version = 0;
  let result: unknown;
  process.env.SUPABASE_URL = "https://db.example.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  process.env.GROQ_API_KEY = "test-groq";
  process.env.FINANCE_PROPOSAL_SECRET = "test-secret";
  const response = (data: unknown, status = 200) =>
    Response.json(data, { status });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.groq.com")
      return response({
        choices: [{ message: { content: JSON.stringify(result) } }],
      });
    if (url.pathname === "/auth/v1/user")
      return response({
        id: user,
        aud: "authenticated",
        role: "authenticated",
        email: "test@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: date,
      });
    if (url.pathname === "/rest/v1/finance_ledgers")
      return response(version ? [{ data: ledger, version }] : []);
    if (url.pathname.endsWith("/rpc/save_finance_ledger")) {
      const body = JSON.parse(String(init?.body));
      if (body.expected !== version) return response(false);
      ledger = body.next_data;
      version++;
      return response(true);
    }
    if (url.pathname.startsWith("/storage/v1/object/"))
      return new Response(new Uint8Array(image), {
        headers: { "content-type": "image/png" },
      });
    throw new Error("Ruta de prueba inesperada: " + url.href);
  };
  const call = (body: object) =>
    handler(
      new Request("https://app.example.test/api/assistant", {
        method: "POST",
        headers: { Authorization: "Bearer test-jwt" },
        body: JSON.stringify(body),
      }),
    );
  const movement = (category: string, amount: number, description: string) => ({
    category,
    amount,
    description,
    currency: "ARS",
    date,
    merchant: "Mercado",
    method: "Efectivo",
  });
  const proposal = async (body: object) => {
    const asked = await call({ action: "ask", ...body });
    assert.equal(asked.status, 200, await asked.clone().text());
    return ((await asked.json()) as { messages: Message[] }).messages[1]
      .proposal!;
  };
  try {
    result = {
      text: "Revisá estos gastos.",
      items: [
        movement("2", 1500000, "Pollo"),
        movement("1", 300000, "Galletitas"),
        movement("10", 600000, "Uber"),
      ],
    };
    const batch = await proposal({
      text: "Hoy gasté 15k en pollo, 3 lucas en galletitas y 6k en Uber.",
    });
    assert.equal(ledger.expenses.length, 0);
    const confirm = (items: Expense[]) =>
      call({ action: "confirm", id: batch.id, items });
    assert.equal(
      (
        await confirm(
          batch.items.map((e) => ({ ...e, category: "desconocida" })),
        )
      ).status,
      422,
    );
    assert.equal((await confirm(batch.items)).status, 200);
    assert.equal(
      ledger.expenses.reduce((sum, e) => sum + e.amount, 0),
      2_400_000,
    );
    assert.equal((await confirm(batch.items)).status, 200);
    assert.equal(ledger.expenses.length, 3);
    result = {
      text: "Ticket identificado.",
      items: [
        {
          ...movement("12", 250000, "Detergente"),
          quantity: 2,
          discount: 10000,
        },
        movement("4", 1500000, "Pañales"),
      ],
      receipt: {
        total: 1740000,
        adjustment: -10000,
        warnings: ["Revisá el descuento global."],
      },
    };
    const receipt = await proposal({ text: "", hash, path });
    assert.equal(receipt.items[0].discount, 10000);
    assert.equal(
      (
        await call({
          action: "confirm",
          id: receipt.id,
          items: receipt.items.map((e, i) => (i ? e : { ...e, amount: 1 })),
        })
      ).status,
      422,
    );
    assert.equal(
      (await call({ action: "confirm", id: receipt.id, items: receipt.items }))
        .status,
      200,
    );
    assert.equal(
      ledger.expenses
        .filter((e) => e.receipt === path)
        .reduce((sum, e) => sum + e.amount, 0),
      1_740_000,
    );
    assert.equal(
      (await call({ action: "ask", text: "", hash, path })).status,
      409,
    );
    result = {
      text: "",
      query: { kind: "expenses", from: date, to: date, keyword: "galletitas" },
    };
    const queryResponse = await call({
      action: "ask",
      text: "¿Cuánto gasté en galletitas?",
    });
    assert.match((await queryResponse.json()).messages[1].text, /3\.000/);
    result = {
      text: "Propuesta",
      category: { name: "Ropa para los chicos", amount: 8_000_000 },
    };
    const category = await proposal({
      text: "Agregá una categoría de ropa para los chicos.",
    });
    const stored = ledger.messages.find(
      (m) => m.proposal?.id === category.id,
    )!.proposal!;
    stored.category!.amount = 1;
    assert.equal(
      (await call({ action: "confirm", id: category.id, items: [] })).status,
      422,
    );
  } finally {
    globalThis.fetch = realFetch;
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "GROQ_API_KEY",
      "FINANCE_PROPOSAL_SECRET",
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
});
