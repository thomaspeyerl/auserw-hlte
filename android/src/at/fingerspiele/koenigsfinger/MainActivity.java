package at.fingerspiele.koenigsfinger;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Vollbild-WebView mit den Spielen aus den App-Assets. Die Dateien werden unter einer virtuellen https-Adresse
 *  ausgeliefert, damit ES-Module, localStorage und Web Audio wie im Browser funktionieren (file:// erlaubt das nicht).
 *  Offline spielbar; der Online-Modus verbindet sich mit dem Cloudflare-Server. */
public class MainActivity extends Activity {
  static final String HOST = "appassets.androidplatform.net";
  WebView web;

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    Window w = getWindow();
    w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (Build.VERSION.SDK_INT >= 28) w.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(18, 11, 6));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (!HOST.equals(u.getHost())) return null;
        String p = u.getPath();
        if (p == null || p.isEmpty() || p.endsWith("/")) p = (p == null ? "/" : p) + "index.html";
        try {
          InputStream in = getAssets().open("www" + p);
          Map<String, String> h = new HashMap<>();
          h.put("Cache-Control", "no-cache");
          return new WebResourceResponse(mime(p), "utf-8", 200, "OK", h, in);
        } catch (Exception e) {
          return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
        }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        return !HOST.equals(r.getUrl().getHost());   // fremde Links nicht in der App öffnen
      }
    });
    setContentView(web);
    immersive();
    if (b != null) web.restoreState(b); else web.loadUrl("https://" + HOST + "/koenigsfinger/index.html");
  }

  static String mime(String p) {
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".woff2")) return "font/woff2";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".json")) return "application/json";
    return "application/octet-stream";
  }

  void immersive() {
    web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }
  @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
  @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
  @Override protected void onPause() { super.onPause(); web.onPause(); }
  @Override protected void onResume() { super.onResume(); web.onResume(); }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
