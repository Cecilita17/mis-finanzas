export const currencies = ["ARS", "USD", "NZD"] as const;
export type Currency = (typeof currencies)[number];
export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  amount: number;
  currency: Currency;
  group: string;
  kind: "variable" | "fixed" | "reserve";
  period: "daily" | "weekly" | "monthly";
  limit?: number;
  redistribute: boolean;
  archived: boolean;
};
export type Expense = {
  id: string;
  amount: number;
  currency: Currency;
  rate: number;
  baseRate?: number;
  nzdPerUsd?: number;
  baseCurrency?: Currency;
  category: string;
  date: string;
  description: string;
  merchant: string;
  method: string;
  receipt?: string;
  quantity?: number;
  discount?: number;
  obligation?: string;
};
export type Rule = {
  id: string;
  category: string;
  name: string;
  amount: number;
  currency: Currency;
  day: number;
  start: string;
  frequency: number;
  statement: boolean;
  closingDay?: number;
};
export type Reserve = {
  id: string;
  date: string;
  amount: number;
  description: string;
};
export type Income = {
  id: string;
  date: string;
  amount: number;
  description: string;
};
export type ReceiptReview = { total: number; adjustment: number };
export type Proposal = {
  id: string;
  items: Expense[];
  category?: Category;
  incomes?: Income[];
  receipt?: {
    hash: string;
    path: string;
    fingerprint?: string;
    total: number;
    adjustment: number;
    warnings: string[];
  };
  confirmedItems?: Expense[];
  receiptReview?: ReceiptReview;
  signature?: string;
  status?: "saved" | "discarded";
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal?: Proposal;
};
export type Ledger = {
  categories: Category[];
  expenses: Expense[];
  rules: Rule[];
  reserves: Reserve[];
  incomes?: Income[];
  messages: Message[];
  budget: number;
  rate: number;
  nzdPerUsd?: number;
  baseCurrency?: Currency;
  months: Record<
    string,
    {
      budget: number;
      rate: number;
      nzdPerUsd?: number;
      allocations: Record<string, number>;
    }
  >;
  paid: string[];
  receipts: Record<string, string>;
  preferences?: { theme?: "light" | "dark" };
};
const seeds = [
  ["Desayunos y snacks", "coffee", "sage", 180000],
  ["Almuerzos y cenas", "utensils", "lavender", 450000],
  ["Extras alimenticios", "apple", "rose", 90000],
  ["Pañales", "baby", "mint", 70000],
  ["Suscripciones", "play", "lavender", 40],
  ["Deudas", "coins", "yellow", 110000],
  ["Tarjeta de crédito", "card", "rose", 200000],
  ["Medicamentos y farmacia", "pill", "mint", 70000],
  ["Internet y celular", "wifi", "lavender", 10000],
  ["Transporte", "bus", "blue", 104000],
  ["Electricidad", "zap", "yellow", 100000],
  ["Limpieza e higiene", "sparkles", "mint", 30000],
  ["Imprevistos", "shield", "rose", 101240],
] as const;
export const initial: Ledger = {
  categories: seeds.map(([name, icon, color, value], i) => ({
    id: String(i + 1),
    name,
    icon,
    color,
    amount: value * 100,
    currency: i === 4 ? "USD" : "ARS",
    group: i < 3 ? "Alimentación" : "",
    kind:
      i === 12
        ? "reserve"
        : [4, 5, 6, 8, 10].includes(i)
          ? "fixed"
          : "variable",
    period: "monthly",
    redistribute: true,
    archived: false,
  })),
  expenses: [],
  rules: [],
  reserves: [],
  messages: [],
  budget: 160000000,
  rate: 211900,
  months: {},
  paid: [],
  receipts: {},
};
const guestTemplates = [
  {
    id: "guest-food",
    name: "Comida",
    icon: "utensils",
    color: "sage",
    kind: "variable",
  },
  {
    id: "guest-card",
    name: "Tarjeta de crédito",
    icon: "card",
    color: "lavender",
    kind: "fixed",
  },
  {
    id: "guest-clothes",
    name: "Ropa",
    icon: "bag",
    color: "rose",
    kind: "variable",
  },
  {
    id: "guest-rent",
    name: "Alquiler",
    icon: "home",
    color: "yellow",
    kind: "fixed",
  },
  {
    id: "guest-leisure",
    name: "Ocio",
    icon: "play",
    color: "lavender",
    kind: "variable",
  },
  {
    id: "guest-health",
    name: "Salud",
    icon: "heart",
    color: "mint",
    kind: "variable",
  },
  {
    id: "guest-transport",
    name: "Transporte",
    icon: "bus",
    color: "blue",
    kind: "variable",
  },
  {
    id: "guest-empty",
    name: "Sin saldo",
    icon: "tag",
    color: "sage",
    kind: "variable",
  },
] as const;

export function guestLedger(): Ledger {
  return {
    ...initial,
    budget: 0,
    categories: guestTemplates.map((template) => ({
      ...template,
      amount: 0,
      currency: "ARS",
      group: "",
      period: "monthly",
      redistribute: true,
      archived: false,
    })),
  };
}
export function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function days(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00Z"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function money(cents: number, currency: Currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    currencyDisplay: currency !== "ARS" ? "code" : "narrowSymbol",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function cents(input: string) {
  const cleaned = input.trim().replace(/\s/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  const [integer, fraction = ""] = normalized.split(".");
  const parsed = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(parsed) && parsed <= 10_000_000_000
    ? parsed
    : NaN;
}
function roundedRatio(amount: number, numerator: number, denominator: number) {
  const value = BigInt(Math.abs(amount)) * BigInt(numerator);
  return (
    Math.sign(amount) *
    Number((value + BigInt(denominator) / 2n) / BigInt(denominator))
  );
}
export function ars(amount: number, currency: Currency, rate: number) {
  return currency === "ARS" ? amount : roundedRatio(amount, rate, 100);
}
export function settings(data: Ledger, month: string) {
  const config = data.months[month] ?? {
    budget: data.budget,
    rate: data.rate,
    allocations: {},
  };
  return { ...config, nzdPerUsd: config.nzdPerUsd ?? data.nzdPerUsd };
}
export function currencyRate(
  config: { rate: number; nzdPerUsd?: number },
  currency: Currency,
) {
  if (currency === "ARS") return 100;
  if (currency === "USD") return config.rate;
  if (!config.nzdPerUsd)
    throw new Error(
      "Configurá la cotización de NZD en Presupuesto y tipo de cambio.",
    );
  return Math.max(1, roundedRatio(config.rate, 10_000, config.nzdPerUsd));
}
function exchangeDollarPair(
  amount: number,
  from: Currency,
  to: Currency,
  nzdPerUsd?: number,
) {
  if (!nzdPerUsd) return undefined;
  if (from === "USD" && to === "NZD")
    return roundedRatio(amount, nzdPerUsd, 10_000);
  if (from === "NZD" && to === "USD")
    return roundedRatio(amount, 10_000, nzdPerUsd);
  return undefined;
}
export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  config: { rate: number; nzdPerUsd?: number },
) {
  if (from === to) return amount;
  return (
    exchangeDollarPair(amount, from, to, config.nzdPerUsd) ??
    roundedRatio(amount, currencyRate(config, from), currencyRate(config, to))
  );
}
export function toBase(
  data: Ledger,
  amount: number,
  currency: Currency,
  month: string,
) {
  return convertCurrency(
    amount,
    currency,
    data.baseCurrency ?? "ARS",
    settings(data, month),
  );
}
export function expenseValue(data: Ledger, expense: Expense) {
  const base = data.baseCurrency ?? "ARS";
  if (expense.currency === base) return expense.amount;
  const month = settings(data, expense.date.slice(0, 7));
  const direct = exchangeDollarPair(
    expense.amount,
    expense.currency,
    base,
    expense.nzdPerUsd ?? month.nzdPerUsd,
  );
  if (direct !== undefined) return direct;
  const rate =
    expense.baseCurrency === base && expense.baseRate
      ? expense.baseRate
      : currencyRate(month, base);
  return roundedRatio(
    expense.amount,
    expense.currency === "ARS" ? 100 : expense.rate,
    rate,
  );
}
export function expenseRates(data: Ledger, currency: Currency, month: string) {
  const baseCurrency = data.baseCurrency ?? "ARS";
  const config = settings(data, month);
  return {
    rate: currencyRate(config, currency),
    baseRate: currencyRate(config, baseCurrency),
    nzdPerUsd: config.nzdPerUsd,
    baseCurrency,
  };
}
export function changeBaseCurrency(data: Ledger, baseCurrency: Currency) {
  const from = data.baseCurrency ?? "ARS";
  if (baseCurrency === from) return data;
  const convert = (
    amount: number,
    config: { rate: number; nzdPerUsd?: number },
  ) => convertCurrency(amount, from, baseCurrency, config);
  return {
    ...data,
    baseCurrency,
    budget: convert(data.budget, data),
    months: Object.fromEntries(
      Object.entries(data.months).map(([month, config]) => [
        month,
        { ...config, budget: convert(config.budget, settings(data, month)) },
      ]),
    ),
    reserves: data.reserves.map((r) => ({
      ...r,
      amount: convert(r.amount, settings(data, r.date.slice(0, 7))),
    })),
    incomes: (data.incomes ?? []).map((r) => ({
      ...r,
      amount: convert(r.amount, settings(data, r.date.slice(0, 7))),
    })),
  };
}
export function fxInput(raw: string) {
  const input = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(input)) return NaN;
  const [integer, fraction = ""] = input.split(".");
  return Number(integer) * 10_000 + Number(fraction.padEnd(4, "0"));
}
export function convertCategoryAllocations(
  data: Ledger,
  categoryId: string,
  currency: Currency,
) {
  const previous = data.categories.find(
    (category) => category.id === categoryId,
  );
  if (!previous || previous.currency === currency) return data.months;
  return Object.fromEntries(
    Object.entries(data.months).map(([month, config]) => {
      const amount = config.allocations[categoryId];
      if (amount === undefined) return [month, config];
      return [
        month,
        {
          ...config,
          allocations: {
            ...config.allocations,
            [categoryId]: convertCurrency(
              amount,
              previous.currency,
              currency,
              settings(data, month),
            ),
          },
        },
      ];
    }),
  );
}
export function allocation(data: Ledger, category: Category, month: string) {
  return settings(data, month).allocations[category.id] ?? category.amount;
}
export function obligations(data: Ledger, month: string) {
  return data.rules
    .filter((rule) => {
      const [y, m] = month.split("-").map(Number);
      const [sy, sm] = rule.start.split("-").map(Number);
      const offset = (y - sy) * 12 + m - sm;
      return offset >= 0 && offset % rule.frequency === 0;
    })
    .map((rule) => {
      const id = rule.id + "/" + month;
      const due =
        month + "-" + String(Math.min(days(month), rule.day)).padStart(2, "0");
      let firstDate = month + "-01";
      let endDate = month + "-" + days(month);
      if (rule.closingDay) {
        const closingDay = rule.closingDay;
        const close = (period: string) =>
          period +
          "-" +
          String(Math.min(days(period), closingDay)).padStart(2, "0");
        const closingMonth = close(month) <= due ? month : shift(month, -1);
        firstDate = close(shift(closingMonth, -1));
        endDate = close(closingMonth);
      }
      const matched = data.expenses.filter(
        (e) =>
          (rule.closingDay ? e.date > firstDate : e.date >= firstDate) &&
          e.date <= endDate &&
          e.method === "Tarjeta de crédito" &&
          !e.obligation,
      );
      const total = toBase(data, rule.amount, rule.currency, month);
      const charged = rule.statement
        ? matched.reduce((sum, e) => sum + expenseValue(data, e), 0)
        : 0;
      return {
        ...rule,
        key: id,
        due,
        remaining: Math.max(0, total - charged),
        paid:
          data.paid.includes(id) ||
          data.expenses.some((e) => e.obligation === id),
      };
    });
}
export function summary(data: Ledger, month: string, date = today()) {
  const config = settings(data, month);
  const expenses = data.expenses.filter((e) => e.date.startsWith(month));
  const categorySpent: Record<string, number> = {};
  for (const e of expenses)
    categorySpent[e.category] =
      (categorySpent[e.category] ?? 0) + expenseValue(data, e);
  const spent = Object.values(categorySpent).reduce((a, b) => a + b, 0);
  const pending = obligations(data, month)
    .filter((r) => !r.paid)
    .reduce((a, r) => a + r.remaining, 0);
  const reserved = data.categories
    .filter((c) => c.kind === "reserve" && !c.archived)
    .reduce(
      (a, c) =>
        a +
        Math.max(
          0,
          toBase(data, allocation(data, c, month), c.currency, month) -
            (categorySpent[c.id] ?? 0),
        ),
      0,
    );
  const added = data.reserves
    .filter((r) => r.amount > 0 && r.date.startsWith(month))
    .reduce((a, r) => a + r.amount, 0);
  const left =
    month < date.slice(0, 7)
      ? 0
      : month > date.slice(0, 7)
        ? days(month)
        : days(month) - Number(date.slice(8)) + 1;
  const reserveUse = data.categories
    .filter((c) => c.kind === "reserve" && !c.archived)
    .reduce(
      (a, c) =>
        a +
        Math.max(
          0,
          (categorySpent[c.id] ?? 0) -
            toBase(data, allocation(data, c, month), c.currency, month),
        ),
      0,
    );
  const carryUsed = reserveUse
    ? Math.min(reserveUse, Math.max(0, reserveBalance(data, shift(month, -1))))
    : 0;
  const free = config.budget - spent - pending - reserved - added + carryUsed;
  return {
    expenses,
    categorySpent,
    budget: config.budget,
    spent,
    pending,
    reserved: reserved + added,
    remaining: config.budget - spent,
    free,
    left,
    daily: left ? Math.max(0, Math.floor(free / left)) : 0,
  };
}
// Ingresos reales del mes y saldo en mano. Lo que sobra de un mes pasa al
// siguiente. Se cuenta desde el mes del primer ingreso registrado, para que los
// gastos anteriores a empezar a cargar ingresos no generen un saldo negativo.
export function cashflow(data: Ledger, month: string) {
  const incomes = data.incomes ?? [];
  const start = incomes.map((i) => i.date.slice(0, 7)).sort()[0];
  if (!start || month < start)
    return { tracked: !!start, received: 0, carry: 0, inHand: 0 };
  const received = incomes
    .filter((i) => i.date.startsWith(month))
    .reduce((sum, i) => sum + i.amount, 0);
  const before = (date: string) => date.slice(0, 7) >= start && date.slice(0, 7) < month;
  const carry =
    incomes.filter((i) => before(i.date)).reduce((sum, i) => sum + i.amount, 0) -
    data.expenses
      .filter((e) => before(e.date))
      .reduce((sum, e) => sum + expenseValue(data, e), 0);
  const spent = data.expenses
    .filter((e) => e.date.startsWith(month))
    .reduce((sum, e) => sum + expenseValue(data, e), 0);
  return { tracked: true, received, carry, inHand: carry + received - spent };
}
export function reserveBalance(data: Ledger, month: string) {
  const start = Object.keys(data.months).sort()[0];
  let accumulated = 0;
  const funds = data.categories.filter((c) => c.kind === "reserve");
  if (start)
    for (let cursor = start; cursor <= month; cursor = shift(cursor, 1)) {
      accumulated += funds
        .filter((c) => !c.archived)
        .reduce(
          (total, c) =>
            total +
            toBase(data, allocation(data, c, cursor), c.currency, cursor),
          0,
        );
    }
  const usage = data.expenses
    .filter(
      (e) =>
        e.date.slice(0, 7) <= month && funds.some((c) => c.id === e.category),
    )
    .reduce((total, e) => total + expenseValue(data, e), 0);
  const contributions = data.reserves
    .filter((r) => r.date.slice(0, 7) <= month)
    .reduce((sum, r) => sum + r.amount, 0);
  return accumulated + contributions - usage;
}
export function elapsedDays(month: string, date = today()) {
  const current = date.slice(0, 7);
  return month < current
    ? days(month)
    : month > current
      ? 0
      : Number(date.slice(8));
}
export function projectedClose(data: Ledger, month: string, date = today()) {
  const info = summary(data, month, date);
  const elapsed = elapsedDays(month, date);
  if (month < date.slice(0, 7)) return info.spent;
  const variable = new Set(
    data.categories.filter((c) => c.kind === "variable").map((c) => c.id),
  );
  const variableSpent = info.expenses
    .filter((e) => variable.has(e.category) && !e.obligation)
    .reduce((sum, e) => sum + expenseValue(data, e), 0);
  return (
    info.spent +
    info.pending +
    (elapsed
      ? Math.round(
          (variableSpent * Math.max(0, days(month) - elapsed)) / elapsed,
        )
      : 0)
  );
}
export function categoryLimit(
  data: Ledger,
  category: Category,
  month: string,
  date = today(),
) {
  if (category.limit === undefined) return null;
  const current = date.slice(0, 7);
  const at =
    month === current
      ? date
      : month < current
        ? month + "-" + days(month)
        : month + "-01";
  const anchor = new Date(at + "T00:00:00Z");
  const beginning = new Date(anchor);
  if (category.period === "weekly")
    beginning.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
  const from =
    category.period === "monthly"
      ? month + "-01"
      : beginning.toISOString().slice(0, 10);
  const end = new Date(anchor);
  if (category.period === "weekly")
    end.setUTCDate(anchor.getUTCDate() + 6 - ((anchor.getUTCDay() + 6) % 7));
  const to =
    category.period === "monthly"
      ? month + "-" + days(month)
      : end.toISOString().slice(0, 10);
  const used = data.expenses
    .filter((e) => e.category === category.id && e.date >= from && e.date <= to)
    .reduce((n, e) => n + expenseValue(data, e), 0);
  const limit = toBase(data, category.limit, category.currency, month);
  const divisor =
    category.period === "weekly"
      ? 1 + Math.round((end.getTime() - anchor.getTime()) / 86400000)
      : category.period === "monthly"
        ? days(month) - Number(at.slice(8)) + 1
        : 1;
  return {
    used,
    limit,
    daily: Math.max(0, Math.floor((limit - used) / divisor)),
  };
}

export const amountInput = (value: number) =>
  value ? String(value / 100).replace(".", ",") : "";
