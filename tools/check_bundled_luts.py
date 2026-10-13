#!/usr/bin/env python3
"""Run BundledLutChecks with a JDK; an Android SDK is optional.

The parser, sampler and pixel loop are the production LutEngine. Test-only
Android graphics substitutes use host ImageIO for JPEGs and enforce immutable
decoded bitmaps. This checks pixel flow, not Android codec/device behavior.
"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
STUBS = {
    "android/graphics/Bitmap.java": """package android.graphics;
import java.awt.image.BufferedImage;
import java.io.OutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
public class Bitmap {
    public enum Config { ARGB_8888 }
    public enum CompressFormat { JPEG }
    private final int width, height;
    private final int[] pixels;
    private final boolean mutable;
    private boolean recycled;
    Bitmap(int width, int height, int[] pixels, boolean mutable) {
        this.width = width; this.height = height; this.pixels = pixels; this.mutable = mutable;
    }
    private void requireAlive() { if (recycled) throw new IllegalStateException("recycled bitmap"); }
    public int getWidth() { requireAlive(); return width; }
    public int getHeight() { requireAlive(); return height; }
    public Config getConfig() { requireAlive(); return Config.ARGB_8888; }
    public boolean isMutable() { return mutable; }
    public Bitmap copy(Config config, boolean mutable) { requireAlive(); return new Bitmap(width, height, pixels.clone(), mutable); }
    public void recycle() { recycled = true; }
    public void getPixels(int[] dest, int offset, int stride, int x, int y, int w, int h) {
        requireAlive();
        for (int row = 0; row < h; row++) System.arraycopy(pixels, (y + row) * width + x, dest, offset + row * stride, w);
    }
    public void setPixels(int[] source, int offset, int stride, int x, int y, int w, int h) {
        requireAlive();
        if (!mutable) throw new IllegalStateException("immutable bitmap");
        for (int row = 0; row < h; row++) System.arraycopy(source, offset + row * stride, pixels, (y + row) * width + x, w);
    }
    public boolean compress(CompressFormat format, int quality, OutputStream output) {
        requireAlive();
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, width, height, pixels, 0, width);
        try { return ImageIO.write(image, "jpg", output); } catch (IOException e) { return false; }
    }
}
""",
    "android/graphics/BitmapFactory.java": """package android.graphics;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
public class BitmapFactory {
    public static final class Options {
        public boolean inJustDecodeBounds, inMutable, inScaled = true;
        public int outWidth, outHeight, inSampleSize = 1;
        public Bitmap.Config inPreferredConfig;
    }
    public static Bitmap decodeByteArray(byte[] bytes, int offset, int length) {
        return decodeByteArray(bytes, offset, length, null);
    }
    public static Bitmap decodeByteArray(byte[] bytes, int offset, int length, Options options) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes, offset, length));
            if (image == null) return null;
            int width = image.getWidth(), height = image.getHeight();
            if (options != null) {
                options.outWidth = width; options.outHeight = height;
                if (options.inJustDecodeBounds) return null;
            }
            int sample = options == null ? 1 : Math.max(1, options.inSampleSize);
            int scaledWidth = (width + sample - 1) / sample, scaledHeight = (height + sample - 1) / sample;
            int[] pixels = new int[scaledWidth * scaledHeight];
            for (int y = 0; y < scaledHeight; y++) for (int x = 0; x < scaledWidth; x++)
                pixels[y * scaledWidth + x] = image.getRGB(x * sample, y * sample);
            return new Bitmap(scaledWidth, scaledHeight, pixels, options != null && options.inMutable);
        } catch (IOException e) { return null; }
    }
}
""",
    "android/content/Context.java": """package android.content;
import android.content.res.AssetManager;
import java.io.File;
public class Context {
    private final AssetManager assets;
    private final File cache;
    public Context(File assets, File cache) { this.assets = new AssetManager(assets); this.cache = cache; }
    public AssetManager getAssets() { return assets; }
    public File getCacheDir() { return cache; }
}
""",
    "android/content/res/AssetManager.java": """package android.content.res;
import java.io.*;
public class AssetManager {
    private final File directory;
    public AssetManager(File directory) { this.directory = directory; }
    public InputStream open(String path) throws IOException { return new FileInputStream(new File(directory, path)); }
}
""",
    "android/os/Process.java": """package android.os;
public class Process {
    public static final int THREAD_PRIORITY_BACKGROUND = 10;
    public static void setThreadPriority(int priority) {}
}
""",
    "android/os/SystemClock.java": """package android.os;
public class SystemClock {
    public static long elapsedRealtimeNanos() { return System.nanoTime(); }
}
""",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java-home", type=Path, help="JDK directory (otherwise JAVA_HOME or PATH)")
    args = parser.parse_args()
    java_home = args.java_home or (Path(os.environ["JAVA_HOME"]) if os.environ.get("JAVA_HOME") else None)
    suffix = ".exe" if os.name == "nt" else ""
    javac = str(java_home / "bin" / ("javac" + suffix)) if java_home else shutil.which("javac")
    java = str(java_home / "bin" / ("java" + suffix)) if java_home else shutil.which("java")
    if not javac or not java:
        parser.exit(1, "A JDK is required; set JAVA_HOME or pass --java-home.\n")
    with tempfile.TemporaryDirectory(prefix="moment-lut-checks-") as temp:
        output = Path(temp)
        sources = []
        for relative, code in STUBS.items():
            path = output / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(code, encoding="utf-8")
            sources.append(str(path))
        sources += [str(ROOT / "app/src/main/java/cn/moment/lumix" / name)
                    for name in ("LutEngine.java", "LutImport.java", "ScopeAnalyzer.java", "ScopeCadence.java", "ScopeStream.java")]
        sources += [str(ROOT / "mobile/android/app/src/main/java/cn/moment/lumix/BuiltInLuts.java"),
                    str(ROOT / "mobile/android/app/src/main/java/cn/moment/lumix/BuiltInLutCatalog.java"),
                    str(ROOT / "tests/BundledLutChecks.java"), str(ROOT / "tests/LutBitmapChecks.java")]
        subprocess.run([javac, "-encoding", "UTF-8", "-d", str(output)] + sources, check=True)
        subprocess.run([java, "-cp", str(output), "cn.moment.lumix.BundledLutChecks",
                        str(ROOT / "mobile/android/app/src/main/assets/luts")], check=True)
        subprocess.run([java, "-Djava.awt.headless=true", "-cp", str(output), "cn.moment.lumix.LutBitmapChecks",
                        str(ROOT / "mobile/android/app/src/main/assets/luts")], check=True)


if __name__ == "__main__":
    main()
