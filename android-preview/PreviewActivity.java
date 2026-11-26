package app.misfinanzas.preview;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;

public final class PreviewActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(248, 245, 240));
        getWindow().setNavigationBarColor(Color.rgb(248, 245, 240));
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.rgb(248, 245, 240));
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView source, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView source, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!isLocal(url)) return unavailable();
                String path = url.getPath();
                if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
                if (!path.matches("/[a-zA-Z0-9_./-]+") || path.contains("..") || path.equals("/sw.js")) {
                    return unavailable();
                }
                try {
                    return new WebResourceResponse(mime(path), null, getAssets().open("web" + path));
                } catch (IOException missing) {
                    return unavailable();
                }
            }
        });
        setContentView(view);
        view.loadUrl("https://" + HOST + "/");
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost());
    }

    private static WebResourceResponse unavailable() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }
}
