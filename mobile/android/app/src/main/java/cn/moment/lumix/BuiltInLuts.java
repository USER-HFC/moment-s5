package cn.moment.lumix;

import android.content.Context;
import java.io.*;

/** Immutable APK assets, separate from the user-imported LUT directory. */
public final class BuiltInLuts {
    private BuiltInLuts() {}
    /**
     * Parsed engines are immutable, so keep them for this process: switching back and forth in
     * the LUT flyout then skips the asset copy and the ~1 MB parse. Nothing is cached on disk.
     */
    private static final java.util.Map<String, LutEngine> PARSED = new java.util.concurrent.ConcurrentHashMap<>();

    public static LutEngine load(Context context, String id) throws IOException {
        LutEngine cached = PARSED.get(id);
        if (cached != null) return cached;
        LutEngine parsed = parse(context, id);
        PARSED.put(id, parsed);
        return parsed;
    }

    private static LutEngine parse(Context context, String id) throws IOException {
        BuiltInLutCatalog.Entry entry = BuiltInLutCatalog.find(id);
        if (entry == null) throw new IOException("内置 LUT 不存在");
        // LutEngine's existing file parser remains shared with imported LUTs.
        // Always copy from the APK, never trust an old or user-editable cache.
        File temp = File.createTempFile("builtin-lut-", ".cube", context.getCacheDir());
        try {
            try (InputStream in = context.getAssets().open("luts/" + entry.assetName)) {
                LutImport.copy(in, temp);
            }
            if (temp.length() != entry.bytes) throw new IOException("内置 LUT 大小不匹配");
            return LutEngine.load(temp, entry.name);
        } finally {
            temp.delete();
        }
    }
}
