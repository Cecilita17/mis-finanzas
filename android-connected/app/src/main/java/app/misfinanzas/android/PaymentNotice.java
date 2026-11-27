package app.misfinanzas.android;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PaymentNotice {
    static final String PACKAGE = "com.mercadopago.wallet";
    static final long WINDOW_MS = 30 * 60 * 1000L;
    private static final Pattern OUTGOING = Pattern.compile(
        "\\b(pagaste|compraste|transferiste|pago realizado|compra aprobada|transferencia enviada)\\b");
    private static final Pattern OTHER = Pattern.compile(
        "\\b(recibiste|te enviaron|reintegro|devolucion|rechazad[oa]|pendiente|programad[oa]|confirmar|entre tus cuentas|tu propia cuenta|usd|u\\$s)\\b");
    private static final Pattern AMOUNT = Pattern.compile(
        "(?:ARS\\s*\\$?|(?<![\\p{L}\\p{N}])\\$)\\s*(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)(?![\\d.,])",
        Pattern.CASE_INSENSITIVE);

    private PaymentNotice() {}

    static long amount(String packageName, String content) {
        if (!PACKAGE.equals(packageName) || content == null || content.length() > 2048) return 0;
        String normalized = Normalizer.normalize(content, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
        if (!OUTGOING.matcher(normalized).find() || OTHER.matcher(normalized).find()) return 0;
        Matcher matches = AMOUNT.matcher(content);
        if (!matches.find()) return 0;
        String value = matches.group(1);
        while (matches.find()) {
            if (!value.equals(matches.group(1))) return 0;
        }
        try {
            long cents = new BigDecimal(value.replace(".", "").replace(',', '.')).movePointRight(2).longValueExact();
            return cents > 0 && cents <= 10_000_000_000L ? cents : 0;
        } catch (NumberFormatException | ArithmeticException ignored) {
            return 0;
        }
    }
}
