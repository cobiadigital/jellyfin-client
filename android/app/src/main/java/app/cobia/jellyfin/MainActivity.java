package app.cobia.jellyfin;

import android.view.KeyEvent;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  // Remote media keys and Menu are handed to the web app as a "remote" event, so they work
  // the same whether or not the WebView would have delivered them as key presses.
  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    String action = remoteAction(event.getKeyCode());
    if (action == null || getBridge() == null) {
      return super.dispatchKeyEvent(event);
    }
    WebView webView = getBridge().getWebView();
    if (webView == null) {
      return super.dispatchKeyEvent(event);
    }
    if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('remote',{detail:'" + action + "'}))",
        null
      );
    }
    return true;
  }

  private static String remoteAction(int keyCode) {
    switch (keyCode) {
      case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
        return "play-pause";
      case KeyEvent.KEYCODE_MEDIA_PLAY:
        return "play";
      case KeyEvent.KEYCODE_MEDIA_PAUSE:
        return "pause";
      case KeyEvent.KEYCODE_MEDIA_NEXT:
        return "next";
      case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
        return "previous";
      case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
        return "fast-forward";
      case KeyEvent.KEYCODE_MEDIA_REWIND:
        return "rewind";
      case KeyEvent.KEYCODE_MENU:
        return "menu";
      default:
        return null;
    }
  }
}
