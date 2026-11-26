import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Camera,
  Check,
  Image,
  Mic,
  Send,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  money,
  amountInput,
  cents,
  type Expense,
  type Ledger,
  type Proposal,
  type ReceiptReview,
} from "./model";
type Props = {
  data: Ledger;
  session: Session | null;
  save: (fn: (data: Ledger) => Ledger) => Promise<void>;
  upload: (file: File) => Promise<{ hash: string; path: string }>;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
};
type Dictation = {
  lang: string;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  onerror: () => void;
  start: () => void;
};
export default function Assistant({
  data,
  session,
  save,
  upload,
  notify,
  refresh,
}: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const tail = useRef<HTMLDivElement>(null);
  const prompts = [
    "¿Cuánto puedo gastar hoy?",
    "¿Cuánto me queda para almuerzo y cena?",
    "¿Cómo puedo reorganizar mi presupuesto?",
  ];
  useEffect(() => {
    if (data.messages.length)
      tail.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [data.messages.length]);
  async function call(payload: object) {
    if (!session) throw new Error("Iniciá sesión para usar el asistente IA.");
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok)
      throw new Error(
        result?.message || "El backend del asistente no está disponible.",
      );
    return result;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function ask(value: string, file?: File) {
    if (!value.trim() && !file) return;
    await run(async () => {
      if (!session) throw new Error("Iniciá sesión para usar el asistente IA.");
      const attachment = file ? await upload(file) : {};
      await call({ action: "ask", text: value, ...attachment });
      await refresh();
      setText("");
    });
  }
  function dictate() {
    const w = window as Window & {
      SpeechRecognition?: new () => Dictation;
      webkitSpeechRecognition?: new () => Dictation;
    };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) {
      notify("El dictado no está disponible en este navegador.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "es-AR";
    recognition.onresult = (e) =>
      setText((value) =>
        [value, e.results[0][0].transcript].filter(Boolean).join(" "),
      );
    recognition.onerror = () =>
      notify(
        "No se pudo acceder al dictado. Revisá los permisos del micrófono.",
      );
    recognition.start();
  }
  return (
    <section className="card assistant-card">
      <div className="assistant-head">
        <span className="glyph lavender">
          <Sparkles size={21} />
        </span>
        <div>
          <h2>Tu asistente financiero</h2>
          <small>Revisá las propuestas antes de guardarlas.</small>
        </div>
      </div>
      <div className="chat-log" aria-live="polite">
        {!data.messages.length && (
          <div className="welcome-chat">
            <span className="glyph lavender">
              <Wallet size={26} />
            </span>
            <h2>¿En qué te ayudo hoy?</h2>
            <p>
              Podés contarme qué compraste, adjuntar un ticket o preguntarme por
              tu presupuesto.
            </p>
            <div className="quick">
              {prompts.map((p) => (
                <button
                  className="secondary"
                  key={p}
                  disabled={busy}
                  onClick={() => void ask(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {data.messages.map((m) => (
          <div className={"message " + m.role} key={m.id}>
            <div className="bubble">{m.text}</div>
            {m.proposal && (
              <ProposalCard
                proposal={m.proposal}
                data={data}
                busy={busy}
                confirm={(items, adjustmentCategory, receiptReview) =>
                  void run(async () => {
                    await call({
                      action: "confirm",
                      id: m.proposal!.id,
                      items,
                      adjustmentCategory,
                      receiptReview,
                    });
                    await refresh();
                    notify("Cambios guardados.");
                  })
                }
                discard={() =>
                  void run(() =>
                    save((d) => ({
                      ...d,
                      messages: d.messages.map((x) =>
                        x.id === m.id && x.proposal && !x.proposal.status
                          ? {
                              ...x,
                              proposal: { ...x.proposal, status: "discarded" },
                            }
                          : x,
                      ),
                    })),
                  )
                }
              />
            )}
          </div>
        ))}
        {busy && <p className="muted">Procesando…</p>}
        <div ref={tail} />
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <label className="icon-button file-button" title="Fotografiar ticket">
          <Camera size={20} />
          <input
            type="file"
            aria-label="Fotografiar ticket"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ask("", f);
              e.target.value = "";
            }}
          />
        </label>
        <label className="icon-button file-button" title="Subir ticket">
          <Image size={19} />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Subir ticket"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ask("", f);
              e.target.value = "";
            }}
          />
        </label>
        <input
          aria-label="Mensaje"
          placeholder="Escribí un mensaje…"
          maxLength={1500}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Dictar mensaje"
          onClick={dictate}
        >
          <Mic size={19} />
        </button>
        <button
          className="primary send"
          aria-label="Enviar"
          disabled={busy || !text.trim()}
        >
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}
function ProposalCard({
  proposal,
  data,
  busy,
  confirm,
  discard,
}: {
  proposal: Proposal;
  data: Ledger;
  busy: boolean;
  confirm: (
    items: Expense[],
    adjustmentCategory: string,
    receiptReview?: ReceiptReview,
  ) => void;
  discard: () => void;
}) {
  const [draftItems, setItems] = useState(proposal.items);
  const items = proposal.confirmedItems ?? draftItems;
  const [totalInput, setTotalInput] = useState(() =>
    amountInput(proposal.receipt?.total ?? 0),
  );
  const [draftAdjustment, setAdjustment] = useState(
    proposal.receipt?.adjustment ?? 0,
  );
  const [editing, setEditing] = useState(false);
  const [adjustmentCategory, setAdjustmentCategory] = useState("");
  const totals = items.reduce(
    (a, i) => ({ ...a, [i.currency]: a[i.currency] + i.amount }),
    { ARS: 0, USD: 0 },
  );
  const cats = data.categories.filter((c) => !c.archived);
  const categoriesMissing = items.some(
    (e) => !cats.some((c) => c.id === e.category),
  );
  const total = proposal.receiptReview?.total ?? cents(totalInput);
  const adjustment = proposal.receiptReview?.adjustment ?? draftAdjustment;
  const difference = total - totals.ARS - adjustment;
  const validTotal = Number.isSafeInteger(total) && total > 0;
  const match =
    !proposal.receipt ||
    (validTotal &&
      !difference &&
      items.every((item) => item.currency === "ARS"));
  const edit = (index: number, patch: Partial<Expense>) =>
    setItems((values) =>
      values.map((item, i) => (index === i ? { ...item, ...patch } : item)),
    );
  return (
    <div className="proposal">
      <h3>
        {proposal.receipt
          ? "Revisión del ticket"
          : proposal.category
            ? "Cambio de categoría"
            : "Gastos propuestos"}
      </h3>
      {proposal.category && (
        <p>
          <b>{proposal.category.name}</b> ·{" "}
          {money(proposal.category.amount, proposal.category.currency)}
        </p>
      )}
      {items.map((item, i) => (
        <div className="proposal-item" key={item.id}>
          {editing ? (
            <div className="form-grid">
              <label>
                Producto o descripción
                <input
                  value={item.description}
                  onChange={(e) => edit(i, { description: e.target.value })}
                />
              </label>
              <label>
                Importe ({item.currency})
                <input
                  inputMode="decimal"
                  defaultValue={amountInput(item.amount)}
                  onChange={(e) =>
                    edit(i, { amount: cents(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                Categoría
                <select
                  value={item.category}
                  onChange={(e) => edit(i, { category: e.target.value })}
                >
                  <option value="">Elegí una categoría</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input
                  type="date"
                  value={item.date}
                  onChange={(e) => edit(i, { date: e.target.value })}
                />
              </label>
              <label>
                Comercio
                <input
                  value={item.merchant}
                  onChange={(e) => edit(i, { merchant: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <>
              <div>
                <strong>
                  {item.description ||
                    cats.find((c) => c.id === item.category)?.name ||
                    "Gasto"}
                </strong>
                <small>
                  {cats.find((c) => c.id === item.category)?.name ||
                    "Categoría por elegir"}{" "}
                  · {item.date}
                  {"quantity" in item && item.quantity
                    ? " · " + item.quantity + " u."
                    : ""}
                  {"discount" in item &&
                  typeof item.discount === "number" &&
                  item.discount > 0
                    ? " · Descuento " + money(item.discount)
                    : ""}
                </small>
              </div>
              <b>{money(item.amount, item.currency)}</b>
            </>
          )}
        </div>
      ))}
      {items.length > 0 && (
        <p className="proposal-total">
          Total de productos{" "}
          <b>
            {[
              totals.ARS || !totals.USD ? money(totals.ARS) : "",
              totals.USD ? money(totals.USD, "USD") : "",
            ]
              .filter(Boolean)
              .join(" + ")}
          </b>
        </p>
      )}
      {proposal.receipt && (
        <>
          {editing && !proposal.status ? (
            <label>
              Total del comprobante (ARS)
              <input
                inputMode="decimal"
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value)}
              />
            </label>
          ) : (
            <p className="proposal-total">
              Total del ticket{" "}
              <b>{money(validTotal ? total : proposal.receipt.total)}</b>
            </p>
          )}
          {!!adjustment && (
            <label>
              Ajuste de {money(adjustment)}
              <select
                value={adjustmentCategory}
                onChange={(e) => setAdjustmentCategory(e.target.value)}
                disabled={!!proposal.status}
              >
                <option value="">Usar la primera categoría</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!proposal.status && validTotal && difference !== 0 && (
            <>
              <p className="error">
                Queda una diferencia de {money(Math.abs(difference))}. Revisá
                las líneas y el total. Si la diferencia corresponde a un
                descuento o cargo del comprobante, podés registrarla como
                ajuste.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setAdjustment(total - totals.ARS)}
              >
                Aplicar ajuste de {money(total - totals.ARS)}
              </button>
            </>
          )}
          {!proposal.status && !!adjustment && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setAdjustment(0)}
            >
              Quitar ajuste
            </button>
          )}
          {!proposal.status && !validTotal && (
            <p className="error">Ingresá un total válido en Editar.</p>
          )}
          {proposal.receipt.warnings.map((w, i) => (
            <p className="error" key={i}>
              {w}
            </p>
          ))}
        </>
      )}
      {!proposal.status && categoriesMissing && (
        <p className="error">
          Elegí una categoría para cada movimiento en Editar.
        </p>
      )}
      {proposal.status ? (
        <p className="status">
          {proposal.status === "saved" ? "Guardado" : "Descartado"}
        </p>
      ) : (
        <div className="actions">
          <button
            className="primary"
            disabled={
              busy ||
              !match ||
              categoriesMissing ||
              items.some((e) => !e.date || e.amount <= 0)
            }
            onClick={() =>
              confirm(
                items,
                adjustmentCategory,
                proposal.receipt ? { total, adjustment } : undefined,
              )
            }
          >
            <Check size={16} /> Confirmar
          </button>
          {items.length > 0 && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Listo" : "Editar"}
            </button>
          )}
          <button className="text-button" disabled={busy} onClick={discard}>
            <X size={16} /> Descartar
          </button>
        </div>
      )}
    </div>
  );
}
