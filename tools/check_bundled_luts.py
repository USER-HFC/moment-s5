#!/usr/bin/env python3
"""Run BundledLutChecks with a JDK; an Android SDK is optional.

The parser and trilinear sampler are the production LutEngine. Test-only Android
graphics stubs make its class linkable on a host JVM; they throw if pixel/JPEG
rendering is attempted. This check makes no claim about Android JPEG rendering.
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
import java.io.OutputStream;
public class Bitmap {
    public enum Config { ARGB_8888 }
    public enum CompressFormat { JPEG }
    public int getWidth() { throw new UnsupportedOperationException(); }
    public int getHeight() { throw new UnsupportedOperationException(); }
    public Config getConfig() { throw new UnsupportedOperationException(); }
    public Bitmap copy(Config config, boolean mutable) { throw new UnsupportedOperationException(); }
    public void recycle() { throw new UnsupportedOperationException(); }
    public void getPixels(int[] pixels, int offset, int stride, int x, int y, int w, int h) { throw new UnsupportedOperationException(); }
    public void setPixels(int[] pixels, int offset, int stride, int x, int y, int w, int h) { throw new UnsupportedOperationException(); }
    public boolean compress(CompressFormat format, int quality, OutputStream output) { throw new UnsupportedOperationException(); }
}
""",
    "android/graphics/BitmapFactory.java": """package android.graphics;
public class BitmapFactory {
    public static Bitmap decodeByteArray(byte[] bytes, int offset, int length) { throw new UnsupportedOperationException(); }
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
        sources += [str(ROOT / "app/src/main/java/cn/moment/lumix/LutEngine.java"),
                    str(ROOT / "mobile/android/app/src/main/java/cn/moment/lumix/BuiltInLutCatalog.java"),
                    str(ROOT / "tests/BundledLutChecks.java")]
        subprocess.run([javac, "-encoding", "UTF-8", "-d", str(output)] + sources, check=True)
        subprocess.run([java, "-cp", str(output), "cn.moment.lumix.BundledLutChecks",
                        str(ROOT / "mobile/android/app/src/main/assets/luts")], check=True)


if __name__ == "__main__":
    main()
