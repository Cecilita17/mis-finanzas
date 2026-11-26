import test from "node:test";
import assert from "node:assert/strict";
import {
  allocation,
  ars,
  cents,
  days,
  initial,
  obligations,
  projectedClose,
  reserveBalance,
  settings,
  shift,
  summary,
  type Expense,
  type Ledger,
} from "./model";

const month = "2026-11";
const fixture = (): Ledger => ({
  ...structuredClone(initial),
  months: { [month]: settings(initial, month) },
});
const expense = (patch: Partial<Expense> = {}): Expense => ({
  id: "test",
  amount: 1_500_000,
  currency: "ARS",
  rate: 211900,
  category: "2",
  date: "2026-11-01",
  description: "Pollo y verduras",
  merchant: "",
  method: "Efectivo",
  ...patch,
});

test("la asignación inicial suma el presupuesto y el historial inicia vacío", () => {
  const data = fixture();
  const info = summary(data, month, "2026-11-01");
  assert.equal(info.spent, 0);
  assert.equal(
    data.categories.reduce(
      (sum, c) => sum + ars(allocation(data, c, month), c.currency, data.rate),
      0,
    ),
    160_000_000,
  );
  assert.equal(
    data.categories
      .filter((c) => c.group === "Alimentación")
      .reduce((sum, c) => sum + c.amount, 0),
    72_000_000,
  );
  assert.equal(info.free, 149_876_000);
  assert.equal(info.daily, 4_995_866);
});
test("respeta unidades menores, formato argentino y conversión histórica", () => {
  assert.equal(cents("15.000"), 1_500_000);
  assert.equal(cents("2.119,25"), 211_925);
  assert.equal(cents("7,01"), 701);
  assert.ok(Number.isNaN(cents("7,001")));
  assert.equal(ars(4000, "USD", 211900), 8_476_000);
  assert.equal(
    summary(
      {
        ...fixture(),
        rate: 500000,
        expenses: [expense({ amount: 4000, currency: "USD" })],
      },
      month,
    ).spent,
    8_476_000,
  );
});
test("pagos pendientes y resumen de tarjeta afectan la proyección una sola vez", () => {
  const data = fixture();
  data.expenses = [
    expense({ amount: 8_000_000, method: "Tarjeta de crédito" }),
  ];
  data.rules = [
    {
      id: "r",
      category: "7",
      name: "Tarjeta",
      amount: 20_000_000,
      currency: "ARS",
      day: 31,
      start: month,
      frequency: 1,
      statement: true,
    },
  ];
  assert.equal(obligations(data, month)[0].due, "2026-11-30");
  assert.equal(summary(data, month).pending, 12_000_000);
  const before = summary(data, month).free;
  data.expenses.push(
    expense({ amount: 12_000_000, category: "7", obligation: "r/" + month }),
  );
  assert.equal(summary(data, month).spent, 20_000_000);
  assert.equal(summary(data, month).pending, 0);
  assert.equal(summary(data, month).free, before);
});
test("acumula reservas entre períodos y resta los usos una sola vez", () => {
  const data = fixture();
  data.expenses = [expense({ category: "13", amount: 750_000 })];
  data.reserves = [
    { id: "a", amount: 100_000, date: "2026-11-03", description: "" },
  ];
  assert.equal(reserveBalance(data, month), 9_474_000);
  assert.equal(reserveBalance(data, shift(month, 1)), 19_598_000);
});
test("los días y proyección distinguen meses pasados, futuros y en curso", () => {
  const data = fixture();
  data.expenses = [expense()];
  assert.equal(days("2028-02"), 29);
  assert.equal(summary(data, "2026-10", "2026-11-01").left, 0);
  assert.equal(summary(data, "2026-12", "2026-11-01").left, 31);
  assert.equal(summary(data, month, "2026-11-29").left, 2);
  assert.equal(projectedClose(data, month, "2026-11-02"), 22_500_000);
  assert.equal(projectedClose(data, month, "2026-12-01"), 1_500_000);
});
test("reconcilia un resumen con compras previas a su día de cierre", () => {
  const data = fixture();
  data.expenses = [
    expense({
      id: "before",
      date: "2026-10-21",
      amount: 8_000_000,
      method: "Tarjeta de crédito",
    }),
    expense({
      id: "after",
      date: "2026-10-28",
      amount: 4_000_000,
      method: "Tarjeta de crédito",
    }),
  ];
  data.rules = [
    {
      id: "r",
      category: "7",
      name: "Tarjeta",
      amount: 20_000_000,
      currency: "ARS",
      day: 10,
      closingDay: 25,
      start: "2026-11",
      frequency: 1,
      statement: true,
    },
  ];
  assert.equal(obligations(data, month)[0].remaining, 12_000_000);
  assert.equal(obligations(data, "2026-12")[0].remaining, 16_000_000);
});
