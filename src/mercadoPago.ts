export type MercadoPagoNotice = {
  id: string;
  amount: number;
  postedAt: number;
};

export function takeMercadoPagoNotice(): MercadoPagoNotice | null {
  const fragment = window.location.hash;
  if (!fragment.startsWith("#mp-aviso=")) return null;
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
  const match = /^#mp-aviso=([a-f0-9]{64})\.(\d{1,11})\.(\d{13})$/.exec(
    fragment,
  );
  if (!match) return null;
  const amount = Number(match[2]);
  const postedAt = Number(match[3]);
  const age = Date.now() - postedAt;
  return amount > 0 &&
    amount <= 10_000_000_000 &&
    age >= 0 &&
    age <= 30 * 60_000
    ? { id: match[1], amount, postedAt }
    : null;
}

export function refersToMercadoPagoNotice(text: string) {
  return (
    /\b(?:ultima|ultimo|ultimo aviso|acabo de|reci[eé]n|mercado\s*pago)\b/i.test(
      text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    ) && /\b(?:compra|pago|aviso|transferencia|gasto)\b/i.test(text)
  );
}
