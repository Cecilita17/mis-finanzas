package app.misfinanzas.android;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

public final class FinanceLauncher extends LauncherActivity {
    private static final String SETUP_ACTION = "app.misfinanzas.android.DETECTION_SETTINGS";
    private boolean waitingForSettings;

    @Override protected boolean shouldLaunchImmediately() { return false; }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (isFinishing()) return;
        SharedPreferences preferences = MercadoPagoListener.preferences(this);
        if (SETUP_ACTION.equals(getIntent().getAction()) || !preferences.getBoolean("explained", false)) {
            preferences.edit().putBoolean("explained", true).apply();
            showDetectionSettings();
        } else {
            launchTwa();
        }
    }

    private void showDetectionSettings() {
        boolean enabled = MercadoPagoListener.preferences(this).getBoolean("enabled", false)
            && MercadoPagoListener.hasPermission(this);
        DialogInterface.OnClickListener open = new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface dialog, int which) { launchTwa(); }
        };
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Avisos de Mercado Pago")
            .setMessage("Android solicita acceso general a las notificaciones. Mis Finanzas solo procesa avisos salientes reconocibles de Mercado Pago y guarda en el teléfono el importe y la hora del último aviso. Revisás el movimiento antes de guardarlo.")
            .setNegativeButton("Abrir Mis Finanzas", open)
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override public void onCancel(DialogInterface dialog) { launchTwa(); }
            })
            .setPositiveButton(enabled ? "Desactivar detección" : "Activar detección", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface dialog, int which) { toggleDetection(enabled); }
            }).create();
        dialog.show();
    }

    private void toggleDetection(boolean enabled) {
        SharedPreferences preferences = MercadoPagoListener.preferences(this);
        if (enabled) {
            preferences.edit().clear().putBoolean("explained", true).apply();
            launchTwa();
            return;
        }
        preferences.edit().putBoolean("enabled", true).apply();
        if (MercadoPagoListener.hasPermission(this)) {
            launchTwa();
            return;
        }
        try {
            waitingForSettings = true;
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
        } catch (ActivityNotFoundException unavailable) {
            waitingForSettings = false;
            preferences.edit().putBoolean("enabled", false).apply();
            launchTwa();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (waitingForSettings) {
            waitingForSettings = false;
            launchTwa();
        }
    }

    @Override protected Uri getLaunchingUrl() {
        Uri home = super.getLaunchingUrl();
        SharedPreferences preferences = MercadoPagoListener.preferences(this);
        if (!preferences.getBoolean("enabled", false) || !MercadoPagoListener.hasPermission(this)) return home;
        long when = preferences.getLong("when", 0);
        long amount = preferences.getLong("amount", 0);
        String id = preferences.getString("id", null);
        long age = System.currentTimeMillis() - when;
        if (id == null || amount <= 0 || age < 0 || age > PaymentNotice.WINDOW_MS) return home;
        return home.buildUpon().fragment("mp-aviso=" + id + "." + amount + "." + when).build();
    }
}
