package cn.moment.lumix;

import android.content.Context;
import java.io.*;

/** Immutable APK assets, separate from the user-imported LUT directory. */
public final class BuiltInLuts {
    private BuiltInLuts() {}

    public static LutEngine load(Context context, String id) throws IOException {
        BuiltInLutCatalog.Entry entry = BuiltInLutCatalog.find(id);
        if (entry == null) throw new IOException("内置 LUT 不存在");
        // LutEngine's existing file parser remains shared with imported LUTs.
        // Always copy from the APK, never trust an old or user-editable cache.
        File temp = File.createTempFile("builtin-lut-", ".cube", context.getCacheDir());
        try {
            try (InputStream in = context.getAssets().open("luts/" + entry.assetName);
                 OutputStream out = new FileOutputStream(temp)) {
                byte[] buffer = new byte[8192]; int count; long total = 0;
                while ((count = in.read(buffer)) != -1) {
                    total += count;
                    if (total > entry.bytes) throw new IOException("内置 LUT 大小不匹配");
                    out.write(buffer, 0, count);
                }
                if (total != entry.bytes) throw new IOException("内置 LUT 大小不匹配");
            }
            return LutEngine.load(temp);
        } finally {
            temp.delete();
        }
    }
}
