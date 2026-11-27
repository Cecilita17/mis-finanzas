package app.misfinanzas.android;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class MercadoPagoListener extends NotificationListenerService {
    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("mercado_pago_detection", Context.MODE_PRIVATE);
    }

    static boolean hasPermission(Context context) {
        ComponentName component = new ComponentName(context, MercadoPagoListener.class);
        String components = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (components == null) return false;
        for (String name : components.split(":")) {
            if (component.equals(ComponentName.unflattenFromString(name))) return true;
        }
        return false;
    }

    @Override public void onNotificationPosted(StatusBarNotification posted) {
        if (!PaymentNotice.PACKAGE.equals(posted.getPackageName()) || !preferences(this).getBoolean("enabled", false)) return;
        Notification notification = posted.getNotification();
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence expanded = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = expanded != null ? expanded : extras.getCharSequence(Notification.EXTRA_TEXT);
        String body = (title == null ? "" : title.toString()) + "\n" + (text == null ? "" : text.toString());
        long amount = PaymentNotice.amount(posted.getPackageName(), body);
        long when = posted.getPostTime();
        SharedPreferences state = preferences(this);
        if (amount == 0 || when <= state.getLong("when", 0)) return;
        state.edit().putLong("amount", amount).putLong("when", when)
            .putString("id", fingerprint(posted.getKey() + ":" + when + ":" + amount)).apply();
    }

    private static String fingerprint(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(Character.forDigit((b >>> 4) & 15, 16));
                hex.append(Character.forDigit(b & 15, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
