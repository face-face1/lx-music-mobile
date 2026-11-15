package cn.toside.music.mobile.appIcon;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class AppIconModule extends ReactContextBaseJavaModule {

  private static final String[] ICON_NAMES = {"default", "blue", "purple", "orange"};

  private final ReactApplicationContext ctx;
  private final Map<String, ComponentName> aliasMap = new HashMap<>();

  public AppIconModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.ctx = reactContext;
    resolveAliases();
  }

  @Override
  public String getName() {
    return "AppIcon";
  }

  /**
   * 运行时从 PackageManager 获取各 alias 的真实组件名，
   * 避免 namespace / applicationId 前缀差异导致的组件名错误
   */
  private void resolveAliases() {
    try {
      PackageInfo pi = ctx.getPackageManager()
        .getPackageInfo(ctx.getPackageName(), PackageManager.GET_ACTIVITIES);
      if (pi.activities == null) return;
      for (ActivityInfo ai : pi.activities) {
        for (String name : ICON_NAMES) {
          String suffix = Character.toUpperCase(name.charAt(0)) + name.substring(1);
          if (ai.name.endsWith(".IconAlias" + suffix)) {
            aliasMap.put(name, new ComponentName(ai.packageName, ai.name));
          }
        }
      }
    } catch (Exception ignored) {
    }
  }

  private ComponentName aliasComponent(String name) {
    ComponentName component = aliasMap.get(name);
    if (component != null) return component;
    // 兜底：按 manifest 的命名规则构造
    String suffix = Character.toUpperCase(name.charAt(0)) + name.substring(1);
    return new ComponentName(ctx.getPackageName(),
      ctx.getPackageName() + ".IconAlias" + suffix);
  }

  @ReactMethod
  public void getAppIcon(Promise promise) {
    PackageManager pm = ctx.getPackageManager();
    try {
      for (String name : ICON_NAMES) {
        int state = pm.getComponentEnabledSetting(aliasComponent(name));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
          promise.resolve(name);
          return;
        }
      }
      promise.resolve("default");
    } catch (Exception e) {
      promise.reject("GET_ICON_FAILED", e.getMessage());
    }
  }

  @ReactMethod
  public void setAppIcon(String name, Promise promise) {
    if (name == null || !java.util.Arrays.asList(ICON_NAMES).contains(name)) {
      promise.reject("INVALID_ICON", "Unknown icon: " + name);
      return;
    }
    PackageManager pm = ctx.getPackageManager();
    String firstError = null;
    try {
      // 先启用目标，再禁用其它，避免中间出现无入口状态
      pm.setComponentEnabledSetting(aliasComponent(name),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
      for (String n : ICON_NAMES) {
        if (n.equals(name)) continue;
        try {
          pm.setComponentEnabledSetting(aliasComponent(n),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        } catch (Exception e) {
          if (firstError == null) firstError = e.getMessage();
        }
      }
      if (firstError != null) {
        promise.reject("SET_ICON_FAILED", firstError);
      } else {
        promise.resolve(true);
      }
    } catch (Exception e) {
      promise.reject("SET_ICON_FAILED", e.getMessage() != null ? e.getMessage() : e.toString());
    }
  }

  /**
   * 用自定义图片创建一个自适应图标的桌面快捷方式
   * （Android 不允许应用动态修改自身图标，快捷方式是带自定义图标启动应用的标准方案）
   */
  @ReactMethod
  public void createDesktopShortcut(String filePath, Promise promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.reject("SHORTCUT_UNSUPPORTED", "requires Android 8.0+");
      return;
    }
    try {
      Bitmap bitmap = decodeBitmap(filePath);
      if (bitmap == null) {
        promise.reject("DECODE_FAILED", "Cannot decode image");
        return;
      }
      Icon icon = Icon.createWithAdaptiveBitmap(buildAdaptiveBitmap(bitmap));

      Intent intent = new Intent(Intent.ACTION_MAIN);
      intent.addCategory(Intent.CATEGORY_LAUNCHER);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      intent.setComponent(mainActivityComponent());

      ShortcutInfo info = new ShortcutInfo.Builder(ctx, "lx_music_custom_icon")
        .setShortLabel("LX Music")
        .setLongLabel("LX Music")
        .setIcon(icon)
        .setIntent(intent)
        .build();

      ShortcutManager sm = ctx.getSystemService(ShortcutManager.class);
      if (sm == null) {
        promise.reject("SHORTCUT_UNSUPPORTED", "ShortcutManager unavailable");
        return;
      }
      if (!sm.isRequestPinShortcutSupported()) {
        promise.reject("SHORTCUT_UNSUPPORTED", "Launcher does not support pinned shortcuts");
        return;
      }
      boolean ok = sm.requestPinShortcut(info, null);
      if (ok) {
        promise.resolve(true);
      } else {
        promise.reject("SHORTCUT_FAILED", "requestPinShortcut returned false");
      }
    } catch (OutOfMemoryError e) {
      promise.reject("SHORTCUT_FAILED", "Image too large");
    } catch (Exception e) {
      promise.reject("SHORTCUT_FAILED", e.getMessage() != null ? e.getMessage() : e.toString());
    }
  }

  private ComponentName mainActivityComponent() {
    // MainActivity 与 alias 同属一个包，从已发现的 alias 类名推导其类名前缀
    ComponentName alias = aliasMap.get("default");
    if (alias != null) {
      String cls = alias.getClassName();
      int idx = cls.lastIndexOf(".IconAlias");
      if (idx > 0) {
        return new ComponentName(alias.getPackageName(), cls.substring(0, idx) + ".MainActivity");
      }
    }
    // 兜底：按 manifest 命名规则
    String pkg = ctx.getPackageName();
    try {
      Class<?> main = Class.forName("cn.toside.music.mobile.MainActivity");
      // Android 中类加载不受 manifest package 影响，直接用真实类
      return new ComponentName(pkg, main.getName());
    } catch (ClassNotFoundException e) {
      return new ComponentName(pkg, pkg + ".MainActivity");
    }
  }

  private Bitmap decodeBitmap(String filePath) throws Exception {
    // 先读尺寸，按需降采样，避免大图 OOM
    BitmapFactory.Options opts = new BitmapFactory.Options();
    opts.inJustDecodeBounds = true;
    Uri uri = filePath.startsWith("content:")
      ? Uri.parse(filePath) : Uri.fromFile(new java.io.File(filePath));
    try (InputStream in = openInputStream(uri)) {
      BitmapFactory.decodeStream(in, null, opts);
    }
    if (opts.outWidth <= 0 || opts.outHeight <= 0) return null;

    final int TARGET = 864; // 2x of 432 canvas
    opts.inSampleSize = 1;
    while (opts.outWidth / (opts.inSampleSize * 2) >= TARGET
      && opts.outHeight / (opts.inSampleSize * 2) >= TARGET) {
      opts.inSampleSize *= 2;
    }
    opts.inJustDecodeBounds = false;
    try (InputStream in = openInputStream(uri)) {
      return BitmapFactory.decodeStream(in, null, opts);
    }
  }

  private InputStream openInputStream(Uri uri) throws Exception {
    if ("content".equals(uri.getScheme())) {
      return ctx.getContentResolver().openInputStream(uri);
    }
    return new java.io.FileInputStream(new java.io.File(uri.getPath() == null ? uri.toString() : uri.getPath()));
  }

  /**
   * 把图片绘制到 432x432 画布中央的安全区内，
   * 背景取图片边缘色，保证经启动器圆形/圆角裁切后观感正常
   */
  private Bitmap buildAdaptiveBitmap(Bitmap src) {
    final int SIZE = 432;
    Bitmap out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(out);
    canvas.drawColor(edgeBackgroundColor(src));

    // 安全区约为 72/108，图片等比缩放至约 66% 居中绘制
    float box = SIZE * 0.66f;
    float scale = Math.min(box / src.getWidth(), box / src.getHeight());
    float w = src.getWidth() * scale;
    float h = src.getHeight() * scale;
    float left = (SIZE - w) / 2f;
    float top = (SIZE - h) / 2f;

    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    canvas.drawBitmap(src, null, new RectF(left, top, left + w, top + h), paint);
    return out;
  }

  private int edgeBackgroundColor(Bitmap src) {
    try {
      int w = src.getWidth(), h = src.getHeight();
      int[] corners = {
        src.getPixel(0, 0), src.getPixel(w - 1, 0),
        src.getPixel(0, h - 1), src.getPixel(w - 1, h - 1),
      };
      int r = 0, g = 0, b = 0, count = 0;
      for (int c : corners) {
        if (Color.alpha(c) < 200) continue;
        r += Color.red(c);
        g += Color.green(c);
        b += Color.blue(c);
        count++;
      }
      if (count == 0) return Color.WHITE;
      return Color.rgb(r / count, g / count, b / count);
    } catch (Exception e) {
      return Color.WHITE;
    }
  }
}
