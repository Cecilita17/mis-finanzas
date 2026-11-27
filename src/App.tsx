import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Ellipsis,
  GripVertical,
  House,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  Tag,
  Wallet,
  X,
  Archive,
  Pencil,
} from "lucide-react";
import {
  allocation,
  amountInput,
  currencies,
  changeBaseCurrency,
  convertCategoryAllocations,
  convertCurrency,
  currencyRate,
  expenseRates,
  expenseValue,
  fxInput,
  toBase,
  categoryLimit,
  cents,
  days,
  guestLedger,
  money as formatMoney,
  monthLabel,
  obligations,
  projectedClose,
  reserveBalance,
  settings,
  shift,
  summary,
  today,
  type Category,
  type Currency,
  type Expense,
  type Ledger,
  type Rule,
} from "./model";
import { db, deleteAccount, mutateLedger, readLedger } from "./store";
import { colors, icons } from "./icons";
import Assistant from "./Assistant";
import { takeMercadoPagoNotice, type MercadoPagoNotice } from "./mercadoPago";
import AdminPanel from "./AdminPanel";

type Page =
  | "home"
  | "expenses"
  | "assistant"
  | "categories"
  | "more"
  | "admin"
  | "stats"
  | "rules"
  | "reserve"
  | "detail";
const nav = [
  { id: "home", label: "Inicio", icon: House },
  { id: "expenses", label: "Gastos", icon: Receipt },
  { id: "assistant", label: "Asistente IA", icon: Sparkles },
  { id: "categories", label: "Categorías", icon: Tag },
  { id: "more", label: "Más", icon: Ellipsis },
] as const;
const methods = [
  "Efectivo",
  "Débito",
  "Tarjeta de crédito",
  "Transferencia",
  "Otro",
];
type Modal =
  | "expense"
  | "category"
  | "budget"
  | "account"
  | "delete-account"
  | "rule"
  | "reserve"
  | null;
const uid = () => crypto.randomUUID();
const blankCategory = (): Category => ({
  id: uid(),
  name: "",
  amount: 0,
  currency: "ARS",
  color: "sage",
  icon: "tag",
  archived: false,
  kind: "variable",
  group: "",
  period: "monthly",
  redistribute: true,
});
export function Glyph({ category }: { category?: Category }) {
  const Icon = icons[category?.icon as keyof typeof icons] ?? Tag;
  return (
    <span className={"glyph " + (category?.color ?? "sage")}>
      <Icon size={19} />
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Receipt size={25} />
      <p>{children}</p>
    </div>
  );
}
function Meter({ value, tone = "sage" }: { value: number; tone?: string }) {
  return (
    <div className="meter">
      <span
        className={tone}
        style={{ width: Math.max(0, Math.min(100, value)) + "%" }}
      />
    </div>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-title">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const [paymentNotice, setPaymentNotice] = useState<MercadoPagoNotice | null>(
    takeMercadoPagoNotice,
  );
  const [page, setPage] = useState<Page>(paymentNotice ? "assistant" : "home");
  useEffect(() => {
    const readNotice = () => {
      const notice = takeMercadoPagoNotice();
      if (notice) {
        setPaymentNotice(notice);
        setPage("assistant");
      }
    };
    window.addEventListener("hashchange", readNotice);
    return () => window.removeEventListener("hashchange", readNotice);
  }, []);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [session, setSession] = useState<Session | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [data, setData] = useState<Ledger>(guestLedger);
  const [modal, setModal] = useState<Modal>(null);
  const [budgetCurrency, setBudgetCurrency] = useState<Currency>("ARS");
  const [category, setCategory] = useState<Category | null>(null);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [rule, setRule] = useState<Rule | null>(null);
  const [detail, setDetail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [archive, setArchive] = useState(false);
  const [drag, setDrag] = useState("");
  const [filter, setFilter] = useState("month");
  const [merchant, setMerchant] = useState("");
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  useEffect(() => {
    if (!db) return;
    void db.auth.getSession().then((r) => setSession(r.data.session));
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  const userId = session?.user.id;
  const isAdmin = !!userId && adminId === userId;
  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).has("mp-prueba")) {
      setPage("admin");
    }
  }, [isAdmin]);
  useEffect(() => {
    if (!userId || !db) return;
    let active = true;
    void db.rpc("is_finance_admin").then(({ data }) => {
      if (active) setAdminId(data === true ? userId : null);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setData(guestLedger());
      return;
    }
    let active = true;
    const update = () =>
      readLedger(userId)
        .then((r) => {
          if (active) setData(r.data);
        })
        .catch((e) => {
          if (active) setNotice(e.message);
        });
    void update();
    const interval = window.setInterval(update, 12000);
    window.addEventListener("focus", update);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, [userId]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4600);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (data.preferences?.theme) setDark(data.preferences.theme === "dark");
  }, [data.preferences?.theme]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const info = summary(data, month);
  const conf = settings(data, month);
  const baseCurrency = data.baseCurrency ?? "ARS";
  const money = (amount: number, currency: Currency = baseCurrency) =>
    formatMoney(amount, currency);
  const active = data.categories.filter((c) => !c.archived);
  const selected = data.categories.find((c) => c.id === detail);
  const pending = obligations(data, month);
  const go = (p: Page) => {
    setPage(p);
    setDrawer(false);
    setFilter("month");
    setMerchant("");
    window.scrollTo(0, 0);
  };
  const open = (m: Modal) => {
    if (m === "delete-account") setDeleteConfirmation("");
    if (m === "budget") setBudgetCurrency(baseCurrency);
    setError("");
    setModal(m);
  };
  const editExpense = (e: Expense | null = null) => {
    setExpense(e);
    open("expense");
  };
  const editCategory = (c: Category | null = null) => {
    setCategory(c ?? { ...blankCategory(), currency: baseCurrency });
    open("category");
  };
  async function save(change: (d: Ledger) => Ledger) {
    if (!session)
      throw new Error(
        db
          ? "Iniciá sesión para guardar tus datos."
          : "La conexión a Supabase está pendiente de configuración.",
      );
    setData(await mutateLedger(session.user.id, change));
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const message =
        typeof e === "object" && e && "message" in e
          ? String(e.message)
          : "No se pudo completar la operación.";
      if (modal) setError(message);
      else setNotice(message);
    } finally {
      setBusy(false);
    }
  }
  const finish = (message: string) => {
    setModal(null);
    setNotice(message);
  };
  async function upload(file: File) {
    if (!db || !userId)
      throw new Error("Iniciá sesión para subir comprobantes.");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 4_000_000
    )
      throw new Error("Elegí una imagen JPG, PNG o WebP de hasta 4 MB.");
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    const path = userId + "/" + hash + "." + file.type.split("/")[1];
    const result = await db.storage
      .from("receipts")
      .upload(path, file, { upsert: true });
    if (result.error) throw result.error;
    return { hash, path };
  }
  async function handleExpense(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const again =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "again";
    const target = e.currentTarget;
    await action(async () => {
      if (!userId) throw new Error("Iniciá sesión para guardar gastos.");
      const amountText = String(form.get("amount")).trim();
      const adjustment = !!expense && expense.amount < 0;
      const amount =
        adjustment && amountText.startsWith("-")
          ? -cents(amountText.slice(1))
          : cents(amountText);
      if (
        !Number.isSafeInteger(amount) ||
        (adjustment ? amount >= 0 : amount <= 0)
      )
        throw new Error("Ingresá un importe válido.");
      const file = form.get("receipt") as File | null;
      const attachment = file?.size ? await upload(file) : null;
      const date = String(form.get("date"));
      const currency = form.get("currency") as Currency;
      const movement: Expense = {
        id: expense?.id ?? uid(),
        amount,
        currency,
        ...(expense?.currency === currency && expense.date === date
          ? {
              rate: expense.rate,
              baseRate: expense.baseRate,
              nzdPerUsd: expense.nzdPerUsd,
              baseCurrency: expense.baseCurrency,
            }
          : expenseRates(data, currency, date.slice(0, 7))),
        category: String(form.get("category")),
        date,
        description: String(form.get("description")).trim(),
        merchant: String(form.get("merchant")).trim(),
        method: String(form.get("method")),
        receipt: attachment?.path ?? expense?.receipt,
        obligation: expense?.obligation,
      };
      await save((d) => {
        if (
          attachment &&
          d.receipts[attachment.hash] &&
          d.receipts[attachment.hash] !== expense?.receipt
        )
          throw new Error("Este comprobante ya fue registrado.");
        return {
          ...d,
          receipts: attachment
            ? { ...d.receipts, [attachment.hash]: attachment.path }
            : d.receipts,
          expenses: expense
            ? d.expenses.map((item) =>
                item.id === expense.id ? movement : item,
              )
            : [...d.expenses, movement],
        };
      });
      if (again) {
        target.reset();
        setNotice("Gasto guardado. Podés agregar otro.");
      } else finish("Gasto guardado.");
    });
  }
  const moveCategory = (fromId: string, toId: string) =>
    save((d) => {
      const next = [...d.categories];
      const from = next.findIndex((i) => i.id === fromId);
      const to = next.findIndex((i) => i.id === toId);
      if (from < 0 || to < 0 || from === to) return d;
      next.splice(to, 0, next.splice(from, 1)[0]);
      return { ...d, categories: next };
    });
  const openDetail = (id: string) => {
    setDetail(id);
    go("detail");
  };
  const used = info.budget ? Math.round((info.spent / info.budget) * 100) : 0;
  const heading: Record<Page, string> = {
    home: "Mis finanzas",
    expenses: "Gastos",
    assistant: "Asistente IA",
    categories: "Categorías",
    more: "Más",
    admin: "Administración",
    stats: "Estadísticas",
    rules: "Pagos pendientes",
    reserve: "Fondo de imprevistos",
    detail: selected?.name ?? "Categoría",
  };
  const monthSelector = (
    <div className="month-select">
      <button
        aria-label="Mes anterior"
        className="icon-button"
        onClick={() => setMonth(shift(month, -1))}
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        <CalendarDays size={16} />
        <b>{monthLabel(month)}</b>
      </span>
      <button
        aria-label="Mes siguiente"
        className="icon-button"
        onClick={() => setMonth(shift(month, 1))}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
  const catRow = (c: Category) => {
    const budget = toBase(data, allocation(data, c, month), c.currency, month);
    const spent = info.categorySpent[c.id] ?? 0;
    const ratio = budget ? (spent / budget) * 100 : spent ? 100 : 0;
    return (
      <button
        className="category-row"
        key={c.id}
        onClick={() => openDetail(c.id)}
      >
        <Glyph category={c} />
        <div className="cat-name">
          <strong>{c.name}</strong>
          <small>
            {c.group ||
              {
                fixed: "Gasto fijo",
                variable: "Gasto variable",
                reserve: "Fondo de reserva",
              }[c.kind]}
          </small>
        </div>
        <div className="cat-progress">
          <Meter
            value={ratio}
            tone={ratio > 100 ? "rose" : ratio >= 80 ? "yellow" : "sage"}
          />
          <small>{Math.round(ratio)}%</small>
          <small>{money(budget - spent)} restantes</small>
        </div>
        <div className="cat-amount">
          <strong>{money(spent)}</strong>
          <small title={money(budget - spent) + " restantes"}>
            de {money(budget)}
          </small>
          <small className="mobile-remaining">
            {money(budget - spent)} restantes
          </small>
        </div>
        <ChevronRight className="chev" size={17} />
      </button>
    );
  };
  const movementList = (entries: Expense[]) =>
    entries.length ? (
      <div className="movement-list">
        {[...entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((item) => {
            const c = data.categories.find((x) => x.id === item.category);
            return (
              <div className="movement" key={item.id}>
                <Glyph category={c} />
                <div>
                  <strong>{item.description || c?.name || "Gasto"}</strong>
                  <small>
                    {item.date.split("-").reverse().join("/")} ·{" "}
                    {item.merchant || c?.name || item.method}
                  </small>
                </div>
                <b>{money(item.amount, item.currency)}</b>
                <button
                  className="icon-button"
                  aria-label="Editar gasto"
                  onClick={() => editExpense(item)}
                >
                  <Pencil size={16} />
                </button>
              </div>
            );
          })}
      </div>
    ) : (
      <Empty>Todavía no hay gastos registrados para este período.</Empty>
    );
  const periodEntries = (categoryId?: string) =>
    data.expenses.filter((e) => {
      if (categoryId && e.category !== categoryId) return false;
      if (!e.date.startsWith(month)) return false;
      const reference =
        month === today().slice(0, 7) ? today() : month + "-" + days(month);
      const distance = (Date.parse(reference) - Date.parse(e.date)) / 86400000;
      return (
        (filter === "month" ||
          (filter === "today"
            ? distance === 0
            : distance >= 0 && distance < 7)) &&
        (!merchant || e.merchant.toLowerCase().includes(merchant.toLowerCase()))
      );
    });
  const filters = (
    <div className="filters">
      <select
        aria-label="Período"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="month">Todo el mes</option>
        <option value="week">Últimos 7 días</option>
        <option value="today">Último día</option>
      </select>
      <input
        placeholder="Filtrar por comercio"
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
      />
    </div>
  );
  return (
    <div className="app">
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={"sidebar " + (drawer ? "shown" : "")}>
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-icon">
            <Wallet size={23} />
          </span>
          <span>
            <b>Mis Finanzas</b>
            <small>FINANZAS PERSONALES</small>
          </span>
        </button>
        <div className="sidebar-content">
          <div className="nav-caption">GENERAL</div>
          <nav aria-label="Navegación principal">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-current={page === id ? "page" : undefined}
                onClick={() => go(id)}
                className={
                  page === id || (page === "detail" && id === "categories")
                    ? "active"
                    : ""
                }
              >
                <Icon size={20} />
                <span>{label}</span>
                {id === "assistant" && (
                  <span className="nav-spark">
                    <Sparkles size={12} />
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-divider" />
          <div className="nav-caption">MI ORGANIZACIÓN</div>
          <nav aria-label="Mi organización">
            <button
              className={page === "stats" ? "active" : ""}
              onClick={() => go("stats")}
            >
              <BarChart3 size={20} />
              <span>Estadísticas</span>
            </button>
            <button
              className={page === "rules" ? "active" : ""}
              onClick={() => go("rules")}
            >
              <CalendarDays size={20} />
              <span>Pagos pendientes</span>
            </button>
            <button
              className={page === "reserve" ? "active" : ""}
              onClick={() => go("reserve")}
            >
              <Shield size={20} />
              <span>Fondo de imprevistos</span>
            </button>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button className="profile" onClick={() => open("account")}>
            <span className="avatar">
              {session?.user.email?.slice(0, 2).toUpperCase() || "MF"}
            </span>
            <span>
              <b>{session ? "Mi cuenta" : "Mi espacio"}</b>
              <small>
                {session
                  ? "Cuenta personal"
                  : db
                    ? "Iniciar sesión"
                    : "Vista inicial"}
              </small>
            </span>
            <ChevronDown size={16} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menú"
            onClick={() => setDrawer(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <House size={15} />
            <ChevronRight size={13} />
            <span>{page === "home" ? "Inicio" : heading[page]}</span>
          </div>
          <div className="top-actions">
            <button
              className="icon-button bell"
              onClick={() => go("rules")}
              aria-label="Pagos pendientes"
            >
              <Bell size={20} />
            </button>
            <button
              className="avatar top-avatar"
              onClick={() => open("account")}
              aria-label="Mi cuenta"
            >
              {session?.user.email?.slice(0, 2).toUpperCase() || "MF"}
            </button>
          </div>
        </header>
        <div className="content">
          {!online && (
            <p className="offline-note" role="status">
              Sin conexión. Los datos de tu cuenta estarán disponibles cuando
              vuelvas a conectarte.
            </p>
          )}
          <div className="page-heading">
            <div>
              {page === "detail" && (
                <button
                  className="text-button"
                  onClick={() => go("categories")}
                >
                  <ArrowLeft size={15} /> Categorías
                </button>
              )}
              <h1>{heading[page]}</h1>
              <p>
                {
                  {
                    home: "Organizá tus gastos y tomá el control de tu dinero.",
                    expenses: "Consultá y registrá tus movimientos.",
                    assistant:
                      "Registrá gastos, escaneá tickets y consultá tu presupuesto.",
                    categories: "Organizá tus gastos a tu manera.",
                    admin:
                      "Consultá el registro y la actividad de las cuentas.",
                    more: "Preferencias y herramientas para tus finanzas.",
                    stats: "Descubrí cómo se mueve tu dinero.",
                    rules: "Planificá tus próximos vencimientos.",
                    reserve: "Separá dinero para los gastos inesperados.",
                    detail: selected?.group || "Resumen de la categoría",
                  }[page]
                }
              </p>
            </div>
            {page === "home" || page === "expenses" ? (
              <button className="primary add" onClick={() => editExpense()}>
                <Plus size={20} /> Agregar gasto
              </button>
            ) : page === "categories" ? (
              <button className="primary" onClick={() => editCategory()}>
                <Plus size={19} /> Nueva categoría
              </button>
            ) : null}
          </div>
          {page === "home" && (
            <div className="home-grid">
              <div className="main-column">
                <section className="card budget-card">
                  <div className="card-top">{monthSelector}</div>
                  <div className="budget-core">
                    <div>
                      <div className="muted budget-label">
                        Disponible este mes{" "}
                        <button
                          className="mini-button"
                          aria-label="Editar presupuesto"
                          onClick={() => open("budget")}
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                      <div className="big-money">{money(info.remaining)}</div>
                    </div>
                    <span className="budget-percent">{used}% utilizado</span>
                  </div>
                  <Meter value={used} />
                  <div className="budget-legend">
                    <div>
                      <span className="dot lavender" />{" "}
                      <div>
                        <small>
                          Gastado{" "}
                          <span className="budget-days">
                            · {info.left} días restantes
                          </span>
                        </small>
                        <b>{money(info.spent)}</b>
                      </div>
                    </div>
                    <div>
                      <span className="dot sage" />{" "}
                      <div>
                        <small>Presupuesto</small>
                        <b>{money(info.budget)}</b>
                      </div>
                    </div>
                  </div>
                  <div className="budget-footer">
                    <div>
                      <Clock3 size={17} />
                      <span>Pagos pendientes</span>
                      <b>{money(info.pending)}</b>
                    </div>
                    <div>
                      <Wallet size={17} />
                      <span>Libre tras pendientes</span>
                      <b>{money(info.free)}</b>
                    </div>
                  </div>
                </section>
                <section className="category-section">
                  <div className="section-heading">
                    <div>
                      <h2>Por categoría</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("categories")}
                    >
                      Ver todas <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="card category-list">
                    {active.map(catRow)}
                    {!active.length && (
                      <Empty>Agregá una categoría para empezar.</Empty>
                    )}
                  </div>
                </section>
              </div>
              <aside className="right-column">
                <section className="card daily-card">
                  <div className="section-title">
                    <span className="glyph yellow">
                      <CalendarDays size={19} />
                    </span>
                    <h2>Presupuesto diario</h2>
                  </div>
                  <p>Podés gastar por día</p>
                  <strong>{money(info.daily)}</strong>
                  <div className="daily-foot">
                    <Clock3 size={16} />
                    <span>
                      {info.left}{" "}
                      {info.left === 1 ? "día restante" : "días restantes"} del
                      mes
                    </span>
                  </div>
                </section>
                <section className="ai-card">
                  <div className="ai-text">
                    <span className="glyph lavender">
                      <Sparkles size={19} />
                    </span>
                    <h2>Asistente IA</h2>
                    <p>
                      Contale tus gastos o escaneá un ticket. Tu asistente se
                      ocupa de organizarlos.
                    </p>
                    <button onClick={() => go("assistant")}>
                      Abrir asistente <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="wallet-art with-image" aria-hidden="true">
                    <img src="/wallet.webp" alt="" />
                  </div>
                </section>
                <section className="card recent-card">
                  <div className="section-title">
                    <span className="glyph mint">
                      <ArrowDownLeft size={19} />
                    </span>
                    <h2>Actividad reciente</h2>
                  </div>
                  {info.expenses.length ? (
                    <>
                      <p>
                        {info.expenses.length}{" "}
                        {info.expenses.length === 1
                          ? "movimiento"
                          : "movimientos"}{" "}
                        en este período
                      </p>
                      <button
                        className="text-button"
                        onClick={() => go("expenses")}
                      >
                        Ver movimientos <ArrowRight size={15} />
                      </button>
                    </>
                  ) : (
                    <div className="recent-empty">
                      <span className="receipt-empty">
                        <Receipt size={21} />
                      </span>
                      <strong>Todo listo para empezar</strong>
                      <p>Tus próximos gastos aparecerán acá.</p>
                    </div>
                  )}
                </section>
              </aside>
            </div>
          )}
          {page === "expenses" && (
            <section className="card inner-card">
              <div className="section-heading">
                <h2>Movimientos</h2>
                {monthSelector}
              </div>
              {filters}
              {movementList(periodEntries())}
            </section>
          )}
          {page === "categories" && (
            <section className="card inner-card">
              <div className="section-heading">
                <h2>Tus categorías</h2>
                <button
                  className="text-button"
                  onClick={() => setArchive(!archive)}
                >
                  {archive ? "Ver activas" : "Ver archivadas"}
                </button>
              </div>
              {[...new Set(active.map((c) => c.group).filter(Boolean))].map(
                (group) => (
                  <div className="group-line" key={group}>
                    <Tag size={15} />
                    <b>{group}</b>
                    <span>
                      {money(
                        active
                          .filter((c) => c.group === group)
                          .reduce(
                            (n, c) =>
                              n +
                              toBase(
                                data,
                                allocation(data, c, month),
                                c.currency,
                                month,
                              ),
                            0,
                          ),
                      )}
                    </span>
                  </div>
                ),
              )}
              {data.categories
                .filter((c) => c.archived === archive)
                .map((c, index) => (
                  <div
                    className={
                      "manage-row" + (drag === c.id ? " dragging" : "")
                    }
                    data-category-id={c.id}
                    key={c.id}
                    draggable={!archive}
                    onDragStart={() => setDrag(c.id)}
                    onDragEnd={() => setDrag("")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!drag || drag === c.id) return;
                      void action(() => moveCategory(drag, c.id));
                      setDrag("");
                    }}
                  >
                    <GripVertical
                      size={17}
                      className="grab"
                      onPointerDown={(event) => {
                        if (archive || event.pointerType === "mouse") return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDrag(c.id);
                      }}
                      onPointerUp={(event) => {
                        if (event.pointerType === "mouse" || drag !== c.id)
                          return;
                        const target = document
                          .elementFromPoint(event.clientX, event.clientY)
                          ?.closest<HTMLElement>("[data-category-id]")
                          ?.dataset.categoryId;
                        if (target && target !== c.id)
                          void action(() => moveCategory(c.id, target));
                        setDrag("");
                      }}
                      onPointerCancel={() => setDrag("")}
                    />
                    <Glyph category={c} />
                    <button
                      className="category-link"
                      onClick={() => openDetail(c.id)}
                    >
                      <b>{c.name}</b>
                      {c.group && <small>{c.group}</small>}
                    </button>
                    <span>{money(allocation(data, c, month), c.currency)}</span>
                    {!archive && (
                      <div className="move-controls">
                        <button
                          className="icon-button"
                          aria-label={"Subir " + c.name}
                          disabled={index === 0}
                          onClick={() =>
                            void action(() =>
                              moveCategory(c.id, active[index - 1].id),
                            )
                          }
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={"Bajar " + c.name}
                          disabled={index === active.length - 1}
                          onClick={() =>
                            void action(() =>
                              moveCategory(c.id, active[index + 1].id),
                            )
                          }
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    )}
                    <button
                      aria-label={"Editar " + c.name}
                      className="icon-button"
                      onClick={() => editCategory(c)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={archive ? "Restaurar" : "Archivar"}
                      className="icon-button"
                      onClick={() =>
                        void action(async () => {
                          await save((d) => ({
                            ...d,
                            categories: d.categories.map((i) =>
                              i.id === c.id
                                ? { ...i, archived: !i.archived }
                                : i,
                            ),
                          }));
                          setNotice(
                            archive
                              ? "Categoría restaurada."
                              : "Categoría archivada.",
                          );
                        })
                      }
                    >
                      <Archive size={17} />
                    </button>
                  </div>
                ))}
              {!data.categories.some((c) => c.archived === archive) && (
                <Empty>
                  {archive
                    ? "No hay categorías archivadas."
                    : "No hay categorías activas."}
                </Empty>
              )}
            </section>
          )}
          {page === "assistant" && (
            <Assistant
              paymentNotice={paymentNotice}
              dismissPaymentNotice={() => setPaymentNotice(null)}
              data={data}
              session={session}
              save={save}
              upload={upload}
              notify={setNotice}
              refresh={async () => {
                if (userId) setData((await readLedger(userId)).data);
              }}
            />
          )}
          {page === "admin" && isAdmin && <AdminPanel key={userId} />}
          {page === "more" && (
            <section className="card inner-card menu-list">
              {isAdmin && (
                <button onClick={() => go("admin")}>
                  <Shield /> Administración <ChevronRight />
                </button>
              )}
              <button onClick={() => go("stats")}>
                <BarChart3 /> Estadísticas <ChevronRight />
              </button>
              <button onClick={() => go("rules")}>
                <CalendarDays /> Gastos recurrentes y pagos pendientes{" "}
                <ChevronRight />
              </button>
              <button onClick={() => go("reserve")}>
                <Shield /> Fondo para imprevistos <ChevronRight />
              </button>
              <button onClick={() => open("budget")}>
                <Settings /> Presupuesto y tipo de cambio <ChevronRight />
              </button>
              <button
                onClick={() => {
                  setDark(!dark);
                  if (session)
                    void action(() =>
                      save((d) => ({
                        ...d,
                        preferences: {
                          ...d.preferences,
                          theme: dark ? "light" : "dark",
                        },
                      })),
                    );
                }}
              >
                <Sparkles />{" "}
                {dark ? "Activar modo claro" : "Activar modo oscuro"}{" "}
                <ChevronRight />
              </button>
              <button onClick={() => open("account")}>
                <LogIn /> Mi cuenta <ChevronRight />
              </button>
              <div className="install-note">
                <CircleHelp size={19} /> En Chrome para Android, abrí el menú y
                elegí «Instalar aplicación».
              </div>
            </section>
          )}
          {page === "detail" &&
            selected &&
            (() => {
              const budget = toBase(
                data,
                allocation(data, selected, month),
                selected.currency,
                month,
              );
              const spent = info.categorySpent[selected.id] ?? 0;
              const elapsed =
                days(month) -
                info.left +
                (month === today().slice(0, 7) ? 1 : 0);
              const plan = Math.floor(budget / days(month));
              const categoryPending = pending
                .filter((r) => !r.paid && r.category === selected.id)
                .reduce((n, r) => n + r.remaining, 0);
              const configured = categoryLimit(data, selected, month);
              const adjusted =
                selected.redistribute && info.left
                  ? Math.max(
                      0,
                      Math.floor(
                        (budget - spent - categoryPending) / info.left,
                      ),
                    )
                  : plan;
              const suggested = configured
                ? Math.min(adjusted, configured.daily)
                : adjusted;
              return (
                <div className="stack">
                  <section className="card inner-card">
                    <div className="section-heading">
                      <div className="section-title">
                        <Glyph category={selected} />
                        <h2>Resumen mensual</h2>
                      </div>
                      {monthSelector}
                    </div>
                    <div className="metrics">
                      {[
                        ["Presupuesto mensual", budget],
                        ["Total gastado", spent],
                        ["Saldo restante", budget - spent],
                        [
                          "Promedio diario",
                          elapsed > 0 ? Math.round(spent / elapsed) : 0,
                        ],
                        ["Límite diario planificado", plan],
                        ["Límite diario recomendado", suggested],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <small>{label}</small>
                          <b>{money(Number(value))}</b>
                        </div>
                      ))}
                    </div>
                    {configured && (
                      <p
                        className={
                          configured.used > configured.limit ? "error" : "muted"
                        }
                      >
                        Límite{" "}
                        {
                          {
                            daily: "diario",
                            weekly: "semanal",
                            monthly: "mensual",
                          }[selected.period]
                        }{" "}
                        · {money(configured.used)} de {money(configured.limit)}
                      </p>
                    )}
                    <Chart
                      currency={baseCurrency}
                      title="Evolución del gasto"
                      values={Array.from({ length: days(month) }, (_, i) => {
                        const date =
                          month + "-" + String(i + 1).padStart(2, "0");
                        return [
                          String(i + 1),
                          info.expenses
                            .filter(
                              (e) =>
                                e.category === selected.id && e.date <= date,
                            )
                            .reduce((n, e) => n + expenseValue(data, e), 0),
                        ];
                      })}
                    />
                    <Chart
                      currency={baseCurrency}
                      title="Comparación mensual"
                      values={[-2, -1, 0].map((offset) => {
                        const m = shift(month, offset);
                        return [
                          monthLabel(m),
                          summary(data, m).categorySpent[selected.id] ?? 0,
                        ];
                      })}
                    />
                  </section>
                  <section className="card inner-card">
                    <div className="section-heading">
                      <h2>Movimientos</h2>
                      <button
                        className="text-button"
                        onClick={() => editExpense()}
                      >
                        Agregar gasto <Plus size={16} />
                      </button>
                    </div>
                    {filters}
                    {movementList(periodEntries(selected.id))}
                  </section>
                </div>
              );
            })()}
          {page === "rules" && (
            <section className="card inner-card">
              <div className="section-heading">
                <h2>Obligaciones recurrentes</h2>
                {monthSelector}
              </div>
              <button
                className="primary"
                onClick={() => {
                  setRule(null);
                  open("rule");
                }}
              >
                <Plus size={18} /> Nueva obligación
              </button>
              {!data.rules.length && (
                <div className="quick">
                  {active
                    .filter((c) => c.kind === "fixed")
                    .map((c) => (
                      <button
                        className="secondary"
                        key={c.id}
                        onClick={() => {
                          setRule({
                            id: "",
                            category: c.id,
                            name: c.name,
                            amount: c.amount,
                            currency: c.currency,
                            day: 10,
                            start: month,
                            frequency: 1,
                            statement: c.icon === "card",
                          });
                          open("rule");
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              )}
              {!pending.length ? (
                <Empty>
                  Configurá tus vencimientos para incluirlos en el saldo
                  proyectado.
                </Empty>
              ) : (
                pending.map((r) => (
                  <div className="movement" key={r.key}>
                    <Glyph
                      category={data.categories.find(
                        (c) => c.id === r.category,
                      )}
                    />
                    <div>
                      <strong>{r.name}</strong>
                      <small>
                        {r.due.split("-").reverse().join("/")} ·{" "}
                        {r.paid ? "Pagado" : "Pendiente"}
                      </small>
                    </div>
                    <b>{money(r.remaining)}</b>
                    <button
                      className="icon-button"
                      aria-label="Editar obligación"
                      onClick={() => {
                        setRule(r);
                        open("rule");
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    {!r.paid && (
                      <button
                        className="secondary"
                        onClick={() =>
                          void action(async () => {
                            await save((d) => {
                              const current = obligations(d, month).find(
                                (o) => o.key === r.key,
                              );
                              if (!current || current.paid) return d;
                              const date = today();
                              const currency = current.statement
                                ? (d.baseCurrency ?? "ARS")
                                : current.currency;
                              return {
                                ...d,
                                paid: [...d.paid, r.key],
                                expenses: current.remaining
                                  ? [
                                      ...d.expenses,
                                      {
                                        id: r.key,
                                        amount: current.statement
                                          ? current.remaining
                                          : current.amount,
                                        currency,
                                        ...expenseRates(
                                          d,
                                          currency,
                                          date.slice(0, 7),
                                        ),
                                        category: r.category,
                                        date,
                                        description: r.name,
                                        merchant: "",
                                        method: "Transferencia",
                                        obligation: r.key,
                                      },
                                    ]
                                  : d.expenses,
                              };
                            });
                            setNotice("Obligación marcada como pagada.");
                          })
                        }
                      >
                        <Check size={16} /> Pagar
                      </button>
                    )}
                  </div>
                ))
              )}
            </section>
          )}
          {page === "reserve" && (
            <section className="card inner-card">
              <div className="section-heading">
                <h2>Saldo acumulado</h2>
                {monthSelector}
              </div>
              <div className="big-money">
                {money(reserveBalance(data, month))}
              </div>
              <p>Reserva disponible del período: {money(info.reserved)}</p>
              <div className="actions">
                <button className="primary" onClick={() => open("reserve")}>
                  <Plus size={18} /> Registrar aporte
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    const c = active.find((c) => c.kind === "reserve");
                    if (c) {
                      setExpense(null);
                      setDetail(c.id);
                      open("expense");
                    } else
                      setNotice(
                        "Creá una categoría de reserva para registrar gastos.",
                      );
                  }}
                >
                  Registrar uso
                </button>
              </div>
              {data.reserves.map((r) => (
                <div className="movement" key={r.id}>
                  <div>
                    <strong>{r.description || "Aporte adicional"}</strong>
                    <small>{r.date}</small>
                  </div>
                  <b>{money(r.amount)}</b>
                </div>
              ))}
              {movementList(
                info.expenses.filter((e) =>
                  data.categories.some(
                    (c) => c.kind === "reserve" && c.id === e.category,
                  ),
                ),
              )}
            </section>
          )}
          {page === "stats" && (
            <section className="card inner-card">
              <div className="section-heading">
                <h2>Tu actividad del mes</h2>
                {monthSelector}
              </div>
              <div className="metrics">
                <div>
                  <small>Total gastado</small>
                  <b>{money(info.spent)}</b>
                </div>
                <div>
                  <small>Proyección de cierre</small>
                  <b>{money(projectedClose(data, month))}</b>
                </div>
              </div>
              <Chart
                currency={baseCurrency}
                title="Distribución y categorías con mayor gasto"
                values={Object.entries(info.categorySpent)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, value]) => [
                    data.categories.find((c) => c.id === id)?.name ??
                      "Categoría",
                    value,
                  ])}
              />
              <Chart
                currency={baseCurrency}
                title="Gastos diarios"
                values={Array.from({ length: days(month) }, (_, i) => [
                  String(i + 1),
                  info.expenses
                    .filter((e) => Number(e.date.slice(8)) === i + 1)
                    .reduce((n, e) => n + expenseValue(data, e), 0),
                ])}
              />
              <Chart
                currency={baseCurrency}
                title="Evolución semanal"
                values={Array.from(
                  { length: Math.ceil(days(month) / 7) },
                  (_, i) => [
                    "Semana " + (i + 1),
                    info.expenses
                      .filter(
                        (e) =>
                          Math.floor((Number(e.date.slice(8)) - 1) / 7) === i,
                      )
                      .reduce((n, e) => n + expenseValue(data, e), 0),
                  ],
                )}
              />
              <Chart
                currency={baseCurrency}
                title="Comparación mensual"
                values={[-3, -2, -1, 0].map((offset) => {
                  const m = shift(month, offset);
                  return [monthLabel(m), summary(data, m).spent];
                })}
              />
              <Chart
                currency={baseCurrency}
                title="Evolución del fondo de emergencia"
                values={[-3, -2, -1, 0].map((offset) => {
                  const m = shift(month, offset);
                  return [monthLabel(m), reserveBalance(data, m)];
                })}
              />
            </section>
          )}
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            aria-current={page === id ? "page" : undefined}
            className={page === id ? "active" : ""}
            key={id}
            onClick={() => go(id)}
          >
            <span>
              <Icon size={21} />
            </span>
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Dialog
          title={
            modal === "expense"
              ? expense
                ? "Editar gasto"
                : "Agregar gasto"
              : modal === "category"
                ? data.categories.some((c) => c.id === category?.id)
                  ? "Editar categoría"
                  : "Nueva categoría"
                : modal === "rule"
                  ? rule?.id
                    ? "Editar obligación"
                    : "Nueva obligación"
                  : modal === "delete-account"
                    ? "Eliminar cuenta"
                    : modal === "account"
                      ? "Mi cuenta"
                      : modal === "reserve"
                        ? "Aporte al fondo"
                        : "Presupuesto del mes"
          }
          close={() => setModal(null)}
        >
          {modal === "expense" && (
            <form className="expense-form" onSubmit={handleExpense}>
              <div className="form-grid">
                <label>
                  <span className="expense-label">Importe</span>
                  <span className="expense-currency-mark" aria-hidden="true">
                    $
                  </span>
                  <input
                    aria-label="Importe"
                    name="amount"
                    inputMode="decimal"
                    placeholder="15.000"
                    defaultValue={amountInput(expense?.amount ?? 0)}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Moneda
                  <select
                    aria-label="Moneda"
                    name="currency"
                    defaultValue={expense?.currency ?? baseCurrency}
                  >
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Categoría
                  <select
                    aria-label="Categoría"
                    name="category"
                    defaultValue={
                      expense?.category ??
                      (page === "detail" || page === "reserve" ? detail : "")
                    }
                    required
                  >
                    <option value="" disabled>
                      Elegí una categoría
                    </option>
                    {data.categories
                      .filter((c) => !c.archived || c.id === expense?.category)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Fecha
                  <input
                    name="date"
                    type="date"
                    defaultValue={expense?.date ?? today()}
                    required
                  />
                </label>
                <label>
                  Descripción
                  <input
                    name="description"
                    defaultValue={expense?.description}
                    placeholder="Opcional"
                  />
                </label>
                <label>
                  Comercio
                  <input
                    name="merchant"
                    defaultValue={expense?.merchant}
                    placeholder="Opcional"
                  />
                </label>
                <label>
                  Método de pago
                  <select name="method" defaultValue={expense?.method}>
                    {methods.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Comprobante
                  <input
                    name="receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </label>
              </div>
              {!expense && data.expenses.length > 0 && (
                <div className="quick">
                  {[
                    ...new Set(
                      data.expenses
                        .slice(-8)
                        .reverse()
                        .map((e) => e.category),
                    ),
                  ]
                    .slice(0, 4)
                    .map((id) => {
                      const c = active.find((i) => i.id === id);
                      return (
                        c && (
                          <button
                            key={id}
                            type="button"
                            className="secondary"
                            onClick={(e) => {
                              const control =
                                e.currentTarget.form?.elements.namedItem(
                                  "category",
                                );
                              if (control instanceof HTMLSelectElement)
                                control.value = id;
                            }}
                          >
                            {c.name}
                          </button>
                        )
                      );
                    })}
                </div>
              )}
              {expense?.receipt && (
                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      void action(async () => {
                        const result = await db!.storage
                          .from("receipts")
                          .createSignedUrl(expense.receipt!, 60);
                        if (result.error) throw result.error;
                        const link = document.createElement("a");
                        link.href = result.data.signedUrl;
                        link.target = "_blank";
                        link.rel = "noopener";
                        link.click();
                      })
                    }
                  >
                    Ver comprobante
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void action(async () => {
                        const path = expense.receipt!;
                        const result = await db!.storage
                          .from("receipts")
                          .remove([path]);
                        if (result.error) throw result.error;
                        await save((d) => ({
                          ...d,
                          expenses: d.expenses.map((e) =>
                            e.receipt === path
                              ? { ...e, receipt: undefined }
                              : e,
                          ),
                        }));
                        setExpense({ ...expense, receipt: undefined });
                        setNotice("Imagen eliminada.");
                      })
                    }
                  >
                    Eliminar imagen
                  </button>
                </div>
              )}
              <div className="actions">
                <button disabled={busy} className="primary">
                  Guardar gasto
                </button>
                {!expense && (
                  <button disabled={busy} value="again" className="secondary">
                    Guardar y agregar otro
                  </button>
                )}
                {expense && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (window.confirm("¿Eliminar este movimiento?"))
                        void action(async () => {
                          await save((d) => ({
                            ...d,
                            paid: expense.obligation
                              ? d.paid.filter((id) => id !== expense.obligation)
                              : d.paid,
                            expenses: d.expenses.filter(
                              (x) => x.id !== expense.id,
                            ),
                          }));
                          finish("Movimiento eliminado.");
                        });
                    }}
                  >
                    Eliminar movimiento
                  </button>
                )}
              </div>
            </form>
          )}
          {modal === "category" && category && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const amount = cents(String(f.get("amount") || "0"));
                  const limitInput = String(f.get("limit") || "");
                  const limit = limitInput ? cents(limitInput) : undefined;
                  if (
                    !Number.isSafeInteger(amount) ||
                    amount < 0 ||
                    (limit !== undefined && !Number.isSafeInteger(limit))
                  )
                    throw new Error("Revisá los importes.");
                  const onlyThisMonth = f.has("only-month");
                  const next: Category = {
                    ...category,
                    name: String(f.get("name")).trim(),
                    group: String(f.get("group")).trim(),
                    currency: f.get("currency") as Category["currency"],
                    kind: f.get("kind") as Category["kind"],
                    period: f.get("period") as Category["period"],
                    amount: onlyThisMonth ? category.amount : amount,
                    limit,
                    redistribute: f.has("redistribute"),
                  };
                  if (!next.name)
                    throw new Error("Ingresá el nombre de la categoría.");
                  await save((d) => {
                    const months = convertCategoryAllocations(
                      d,
                      next.id,
                      next.currency,
                    );
                    const monthly = settings({ ...d, months }, month);
                    currencyRate(monthly, next.currency);
                    const allocations = { ...monthly.allocations };
                    const savedCategory =
                      onlyThisMonth && next.currency !== category.currency
                        ? {
                            ...next,
                            amount: convertCurrency(
                              category.amount,
                              category.currency,
                              next.currency,
                              monthly,
                            ),
                          }
                        : next;
                    if (onlyThisMonth) allocations[next.id] = amount;
                    else delete allocations[next.id];
                    return {
                      ...d,
                      months: {
                        ...months,
                        [month]: { ...monthly, allocations },
                      },
                      categories: d.categories.some((c) => c.id === next.id)
                        ? d.categories.map((c) =>
                            c.id === next.id ? savedCategory : c,
                          )
                        : [...d.categories, savedCategory],
                    };
                  });
                  finish("Categoría guardada.");
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Nombre
                  <input
                    name="name"
                    defaultValue={category.name}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Grupo o categoría superior
                  <input
                    name="group"
                    list="category-groups"
                    defaultValue={category.group}
                    placeholder="Ej. Alimentación"
                  />
                  <datalist id="category-groups">
                    {[
                      ...new Set(
                        active
                          .flatMap((c) => [c.group, c.name])
                          .filter((x) => x && x !== category.name),
                      ),
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </datalist>
                </label>
                <label>
                  Presupuesto mensual
                  <input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={amountInput(
                      allocation(data, category, month),
                    )}
                    placeholder="0"
                  />
                </label>
                <label>
                  Moneda
                  <select
                    aria-label="Moneda"
                    name="currency"
                    defaultValue={category.currency}
                  >
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select name="kind" defaultValue={category.kind}>
                    <option value="variable">Variable</option>
                    <option value="fixed">Fijo</option>
                    <option value="reserve">Fondo de reserva</option>
                  </select>
                </label>
                <label>
                  Período del límite
                  <select name="period" defaultValue={category.period}>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </label>
                <label>
                  Límite opcional
                  <input
                    name="limit"
                    inputMode="decimal"
                    defaultValue={amountInput(category.limit ?? 0)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="redistribute"
                    defaultChecked={category.redistribute}
                  />{" "}
                  Redistribuir saldo diario
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="only-month"
                    defaultChecked={conf.allocations[category.id] !== undefined}
                  />{" "}
                  Aplicar importe solo a {monthLabel(month)}
                </label>
              </div>
              <label>Color</label>
              <div className="choice-row">
                {colors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={"glyph " + color}
                    aria-label={color}
                    aria-pressed={color === category.color}
                    onClick={() => setCategory({ ...category, color })}
                  >
                    {color === category.color && <Check size={18} />}
                  </button>
                ))}
              </div>
              <label>Icono</label>
              <div className="choice-row">
                {Object.entries(icons).map(([name, Icon]) => (
                  <button
                    type="button"
                    key={name}
                    className={
                      "glyph " +
                      (category.icon === name ? category.color : "plain")
                    }
                    aria-label={name}
                    aria-pressed={category.icon === name}
                    onClick={() => setCategory({ ...category, icon: name })}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Guardar categoría
                </button>
              </div>
            </form>
          )}
          {modal === "budget" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const rawBudget = String(f.get("budget") ?? "").trim();
                  const budget = rawBudget ? cents(rawBudget) : undefined;
                  const rate = cents(String(f.get("rate")));
                  if (
                    (budget !== undefined &&
                      (!Number.isSafeInteger(budget) || budget < 0)) ||
                    !Number.isSafeInteger(rate) ||
                    rate <= 0
                  )
                    throw new Error(
                      "Revisá el presupuesto y el tipo de cambio.",
                    );
                  const base = budgetCurrency;
                  const rawNzd = String(f.get("nzdPerUsd") ?? "").trim();
                  const nzdPerUsd = rawNzd ? fxInput(rawNzd) : conf.nzdPerUsd;
                  if (
                    nzdPerUsd !== undefined &&
                    (!Number.isSafeInteger(nzdPerUsd) ||
                      nzdPerUsd <= 0 ||
                      nzdPerUsd > 1_000_000)
                  )
                    throw new Error(
                      "Ingresá una cotización de NZD válida, de hasta cuatro decimales.",
                    );
                  if (base === "NZD" && !nzdPerUsd)
                    throw new Error("Ingresá cuántos NZD equivalen a 1 USD.");
                  await save((d) => {
                    const next = {
                      ...d,
                      nzdPerUsd: f.has("default")
                        ? nzdPerUsd
                        : (d.nzdPerUsd ?? nzdPerUsd),
                      months: {
                        ...d.months,
                        [month]: {
                          ...settings(d, month),
                          rate,
                          nzdPerUsd,
                        },
                      },
                      ...(f.has("default") ? { rate } : {}),
                    };
                    const converted = changeBaseCurrency(next, base);
                    if (budget === undefined) return converted;
                    return {
                      ...converted,
                      months: {
                        ...converted.months,
                        [month]: { ...settings(converted, month), budget },
                      },
                      ...(f.has("default") ? { budget } : {}),
                    };
                  });
                  finish("Presupuesto actualizado.");
                });
              }}
            >
              <p className="muted capitalize">{monthLabel(month)}</p>
              <div className="form-grid">
                <label>
                  Moneda principal
                  <select
                    name="baseCurrency"
                    value={budgetCurrency}
                    onChange={(e) =>
                      setBudgetCurrency(e.target.value as Currency)
                    }
                  >
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Presupuesto total ({budgetCurrency})
                  <input
                    key={budgetCurrency}
                    name="budget"
                    inputMode="decimal"
                    defaultValue={
                      budgetCurrency === baseCurrency
                        ? amountInput(conf.budget)
                        : ""
                    }
                    placeholder={
                      budgetCurrency !== baseCurrency
                        ? "Convertir presupuesto actual"
                        : "0"
                    }
                    required={
                      budgetCurrency === baseCurrency && conf.budget !== 0
                    }
                  />
                </label>
                <label>
                  ARS por 1 USD
                  <input
                    name="rate"
                    inputMode="decimal"
                    defaultValue={amountInput(conf.rate)}
                    required
                  />
                </label>
                <label>
                  NZD por 1 USD
                  <input
                    name="nzdPerUsd"
                    inputMode="decimal"
                    placeholder="Ej. 1,7000"
                    defaultValue={
                      conf.nzdPerUsd
                        ? String(conf.nzdPerUsd / 10_000).replace(".", ",")
                        : ""
                    }
                  />
                </label>
              </div>
              <p className="muted">
                Si cambiás la moneda principal, dejá el importe vacío para
                convertir el presupuesto actual. Los aportes y presupuestos
                anteriores se convierten con la cotización configurada.
              </p>
              <label className="check">
                <input type="checkbox" name="default" /> Usar para meses sin
                presupuesto propio
              </label>
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Guardar presupuesto
                </button>
              </div>
            </form>
          )}
          {modal === "account" &&
            (session ? (
              <>
                <p>{session.user.email}</p>
                <button
                  className="secondary"
                  onClick={() =>
                    void action(async () => {
                      const response = await db!.auth.signOut();
                      if (response.error) throw response.error;
                      finish("Sesión cerrada.");
                    })
                  }
                >
                  <LogOut size={17} /> Cerrar sesión
                </button>
                <div className="actions">
                  <button
                    className="danger"
                    type="button"
                    onClick={() => open("delete-account")}
                  >
                    Eliminar cuenta
                  </button>
                </div>
              </>
            ) : db ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const result = signup
                      ? await db!.auth.signUp({ email, password })
                      : await db!.auth.signInWithPassword({ email, password });
                    if (result.error) throw result.error;
                    finish(
                      result.data.session
                        ? "Sesión iniciada."
                        : "Revisá tu correo para confirmar la cuenta.",
                    );
                  });
                }}
              >
                <label>
                  Correo electrónico
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                <div className="actions">
                  <button className="primary" disabled={busy}>
                    {signup ? "Crear cuenta" : "Iniciar sesión"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSignup(!signup)}
                  >
                    {signup ? "Ya tengo cuenta" : "Crear una cuenta"}
                  </button>
                </div>
              </form>
            ) : (
              <p>
                La conexión a Supabase está pendiente de configuración. Podés
                recorrer la aplicación y consultar el presupuesto inicial.
              </p>
            ))}
          {modal === "delete-account" && session?.user.email && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (deleteConfirmation !== "ELIMINAR" || busy) return;
                const currentUser = session.user;
                const currentPassword = String(
                  new FormData(event.currentTarget).get("delete-password"),
                );
                void action(async () => {
                  await deleteAccount(
                    currentUser.id,
                    currentUser.email!,
                    currentPassword,
                  );
                  setSession(null);
                  setData(guestLedger());
                  setEmail("");
                  setPassword("");
                  go("home");
                  finish("Cuenta eliminada.");
                });
              }}
            >
              <p>
                Se borrarán permanentemente los movimientos, las categorías, los
                comprobantes y las conversaciones de esta cuenta.
              </p>
              <label>
                Contraseña actual
                <input
                  type="password"
                  name="delete-password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                Escribí ELIMINAR para confirmar
                <input
                  value={deleteConfirmation}
                  onChange={(event) =>
                    setDeleteConfirmation(event.target.value)
                  }
                  autoComplete="off"
                  required
                />
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => open("account")}
                >
                  Cancelar
                </button>
                <button
                  className="danger"
                  disabled={busy || deleteConfirmation !== "ELIMINAR"}
                >
                  {busy ? "Eliminando…" : "Eliminar definitivamente"}
                </button>
              </div>
            </form>
          )}
          {modal === "rule" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const amount = cents(String(f.get("amount")));
                  if (!Number.isSafeInteger(amount) || amount <= 0)
                    throw new Error("Ingresá un importe válido.");
                  const next: Rule = {
                    id: rule?.id || uid(),
                    name: String(f.get("name")).trim(),
                    category: String(f.get("category")),
                    amount,
                    currency: f.get("currency") as Rule["currency"],
                    day: Number(f.get("day")),
                    start: String(f.get("month")),
                    frequency: Number(f.get("frequency")),
                    statement: f.has("statement"),
                    closingDay: f.get("closingDay")
                      ? Number(f.get("closingDay"))
                      : undefined,
                  };
                  if (!next.name) throw new Error("Ingresá un nombre.");
                  currencyRate(settings(data, month), next.currency);
                  await save((d) => {
                    if (
                      next.statement &&
                      d.rules.some((r) => r.statement && r.id !== next.id)
                    )
                      throw new Error(
                        "Ya hay una obligación configurada como resumen de tarjeta.",
                      );
                    return {
                      ...d,
                      rules: rule?.id
                        ? d.rules.map((r) => (r.id === next.id ? next : r))
                        : [...d.rules, next],
                    };
                  });
                  finish("Obligación guardada.");
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Nombre
                  <input name="name" defaultValue={rule?.name} required />
                </label>
                <label>
                  Categoría
                  <select
                    aria-label="Categoría"
                    name="category"
                    defaultValue={rule?.category}
                    required
                  >
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Importe
                  <input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={amountInput(rule?.amount ?? 0)}
                    required
                  />
                </label>
                <label>
                  Moneda
                  <select
                    aria-label="Moneda"
                    name="currency"
                    defaultValue={rule?.currency ?? baseCurrency}
                  >
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Día de vencimiento
                  <input
                    type="number"
                    name="day"
                    min="1"
                    max="31"
                    defaultValue={rule?.day ?? 10}
                    required
                  />
                </label>
                <label>
                  Desde
                  <input
                    type="month"
                    name="month"
                    defaultValue={rule?.start ?? month}
                    required
                  />
                </label>
                <label>
                  Frecuencia
                  <select name="frequency" defaultValue={rule?.frequency ?? 1}>
                    <option value="1">Mensual</option>
                    <option value="2">Bimestral</option>
                    <option value="3">Trimestral</option>
                    <option value="12">Anual</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="statement"
                    defaultChecked={rule?.statement}
                  />{" "}
                  Es un resumen de tarjeta
                </label>
                <label>
                  Día de cierre de tarjeta (opcional)
                  <input
                    type="number"
                    name="closingDay"
                    min="1"
                    max="31"
                    defaultValue={rule?.closingDay}
                    placeholder="Usa el mes calendario"
                  />
                </label>
              </div>
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Guardar obligación
                </button>
                {rule?.id && (
                  <button
                    className="danger"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm("¿Eliminar esta obligación recurrente?")
                      )
                        void action(async () => {
                          await save((d) => ({
                            ...d,
                            rules: d.rules.filter((r) => r.id !== rule.id),
                          }));
                          finish("Obligación eliminada.");
                        });
                    }}
                  >
                    Eliminar obligación
                  </button>
                )}
              </div>
            </form>
          )}
          {modal === "reserve" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const amount = cents(String(f.get("amount")));
                  if (!Number.isSafeInteger(amount) || amount <= 0)
                    throw new Error("Ingresá un importe válido.");
                  await save((d) => ({
                    ...d,
                    reserves: [
                      ...d.reserves,
                      {
                        id: uid(),
                        amount,
                        date: String(f.get("date")),
                        description: String(f.get("description")),
                      },
                    ],
                  }));
                  finish("Aporte registrado.");
                });
              }}
            >
              <label>
                Importe ({baseCurrency})
                <input name="amount" inputMode="decimal" required />
              </label>
              <label>
                Fecha
                <input
                  name="date"
                  type="date"
                  defaultValue={today()}
                  required
                />
              </label>
              <label>
                Descripción
                <input name="description" placeholder="Opcional" />
              </label>
              <button className="primary" disabled={busy}>
                Registrar aporte
              </button>
            </form>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Chart({
  title,
  values,
  currency,
}: {
  title: string;
  values: [string, number][];
  currency: Currency;
}) {
  const max = Math.max(1, ...values.map((v) => v[1]));
  return (
    <div className="chart">
      <h3>{title}</h3>
      {values.some((v) => v[1] > 0) ? (
        <div className={"chart-bars " + (values.length > 10 ? "dense" : "")}>
          {values.map(([label, value], index) => (
            <div
              key={label}
              title={label + " · " + formatMoney(value, currency)}
            >
              <i
                style={{
                  height: Math.max(2, (value / max) * 100) + "%",
                  background: ["#929f7e", "#b49bc7", "#e4bfc6", "#e9cf91"][
                    index % 4
                  ],
                }}
              />
              <small>{label}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Todavía no hay datos para este gráfico.</p>
      )}
    </div>
  );
}
