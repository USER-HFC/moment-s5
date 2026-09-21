package cn.moment.s5;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** A bounded 3D .cube reader and trilinear transform for received JPEGs. */
public final class LutEngine {
    private static final long MAX_FILE = 16L * 1024 * 1024;
    private static final long MAX_PIXELS = 36L * 1024 * 1024;
    private final int size;
    private final float[] values;
    private final float[] domainMin;
    private final float[] domainMax;
    public final String title;

    private LutEngine(int size, float[] values, float[] min, float[] max, String title) {
        this.size = size; this.values = values; this.domainMin = min; this.domainMax = max; this.title = title;
    }

    public static LutEngine load(File file) throws IOException {
        if (file == null || !file.isFile()) throw new IOException("LUT 文件不存在");
        if (file.length() > MAX_FILE) throw new IOException("LUT 文件超过 16 MB");
        int size = 0; String title = file.getName();
        float[] min = {0f, 0f, 0f}, max = {1f, 1f, 1f};
        ArrayList<float[]> rows = new ArrayList<>();
        boolean sawSize = false, sawMin = false, sawMax = false;
        try (BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String raw; int lineNo = 0;
            while ((raw = in.readLine()) != null) {
                lineNo++; String line = raw.trim();
                if (lineNo == 1 && line.startsWith("\uFEFF")) line = line.substring(1).trim();
                int comment = line.indexOf('#'); if (comment >= 0) line = line.substring(0, comment).trim();
                if (line.isEmpty()) continue;
                String[] p = line.split("\\s+"); String key = p[0].toUpperCase(Locale.ROOT);
                try {
                    if ("TITLE".equals(key)) {
                        if (p.length < 2) throw new IOException("TITLE 为空");
                        title = line.substring(5).trim().replaceAll("^[\\\"']|[\\\"']$", "");
                    } else if ("LUT_3D_SIZE".equals(key)) {
                        if (sawSize || p.length != 2) throw new IOException("LUT_3D_SIZE 重复或格式错误");
                        size = Integer.parseInt(p[1]); if (size < 2 || size > 64) throw new IOException("LUT_3D_SIZE 必须在 2–64 之间");
                        sawSize = true;
                    } else if ("LUT_1D_SIZE".equals(key)) {
                        throw new IOException("仅支持 3D .cube LUT，不支持 1D LUT");
                    } else if ("DOMAIN_MIN".equals(key) || "DOMAIN_MAX".equals(key)) {
                        if (p.length != 4) throw new IOException("DOMAIN 需要 3 个数");
                        float[] dest = "DOMAIN_MIN".equals(key) ? min : max;
                        if ("DOMAIN_MIN".equals(key) ? sawMin : sawMax) throw new IOException("DOMAIN 重复");
                        for (int i = 0; i < 3; i++) { dest[i] = Float.parseFloat(p[i + 1]); if (!Float.isFinite(dest[i])) throw new IOException("DOMAIN 不是有限数"); }
                        if ("DOMAIN_MIN".equals(key)) sawMin = true; else sawMax = true;
                    } else if (p.length == 3) {
                        if (!sawSize) throw new IOException("LUT 数据出现在 LUT_3D_SIZE 之前");
                        float[] row = new float[3];
                        for (int i = 0; i < 3; i++) { row[i] = Float.parseFloat(p[i]); if (!Float.isFinite(row[i])) throw new IOException("LUT 数据不是有限数"); }
                        rows.add(row);
                        if (rows.size() > size * size * size) throw new IOException("LUT 数据行数过多");
                    } else {
                        throw new IOException("第 " + lineNo + " 行无法识别");
                    }
                } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
                    throw new IOException("LUT 第 " + lineNo + " 行格式错误", e);
                }
            }
        }
        if (!sawSize) throw new IOException("缺少 LUT_3D_SIZE");
        if (rows.size() != size * size * size) throw new IOException("LUT 数据行数不匹配：需要 " + (size * size * size) + "，实际 " + rows.size());
        for (int i = 0; i < 3; i++) if (!(max[i] > min[i])) throw new IOException("DOMAIN_MAX 必须大于 DOMAIN_MIN");
        float[] data = new float[rows.size() * 3];
        for (int i = 0; i < rows.size(); i++) { data[i * 3] = rows.get(i)[0]; data[i * 3 + 1] = rows.get(i)[1]; data[i * 3 + 2] = rows.get(i)[2]; }
        return new LutEngine(size, data, min, max, title.isEmpty() ? file.getName() : title);
    }

    public byte[] applyJpeg(byte[] jpeg) throws IOException {
        if (jpeg == null || jpeg.length == 0) throw new IOException("LUT 输入为空");
        Bitmap source = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
        if (source == null) throw new IOException("LUT 输入 JPEG 无法解码");
        long pixels = (long) source.getWidth() * source.getHeight();
        if (pixels > MAX_PIXELS) { source.recycle(); throw new IOException("照片分辨率超过 LUT 处理上限"); }
        Bitmap bitmap = source.getConfig() == Bitmap.Config.ARGB_8888 ? source : source.copy(Bitmap.Config.ARGB_8888, true);
        if (bitmap == null) { source.recycle(); throw new IOException("无法建立 LUT 图像缓冲"); }
        if (bitmap != source) source.recycle();
        int w = bitmap.getWidth(), h = bitmap.getHeight(); int[] px = new int[w * h]; bitmap.getPixels(px, 0, w, 0, 0, w, h);
        for (int i = 0; i < px.length; i++) {
            int c = px[i]; float[] out = sample((c >>> 16 & 255) / 255f, (c >>> 8 & 255) / 255f, (c & 255) / 255f);
            px[i] = (c & 0xff000000) | (toByte(out[0]) << 16) | (toByte(out[1]) << 8) | toByte(out[2]);
        }
        bitmap.setPixels(px, 0, w, 0, 0, w, h); ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(jpeg.length, 1024));
        try { if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)) throw new IOException("LUT JPEG 编码失败"); return out.toByteArray(); }
        finally { bitmap.recycle(); }
    }

    private int toByte(float v) { return Math.round(Math.max(0f, Math.min(1f, v)) * 255f); }
    private float[] sample(float r, float g, float b) {
        float x = norm(r, 0) * (size - 1), y = norm(g, 1) * (size - 1), z = norm(b, 2) * (size - 1);
        int x0 = (int) Math.floor(x), y0 = (int) Math.floor(y), z0 = (int) Math.floor(z);
        int x1 = Math.min(x0 + 1, size - 1), y1 = Math.min(y0 + 1, size - 1), z1 = Math.min(z0 + 1, size - 1);
        float tx = x - x0, ty = y - y0, tz = z - z0; float[] out = new float[3];
        for (int c = 0; c < 3; c++) {
            float a = lerp(v(x0,y0,z0,c), v(x1,y0,z0,c), tx), b0 = lerp(v(x0,y1,z0,c), v(x1,y1,z0,c), tx);
            float c0 = lerp(v(x0,y0,z1,c), v(x1,y0,z1,c), tx), d = lerp(v(x0,y1,z1,c), v(x1,y1,z1,c), tx);
            out[c] = lerp(lerp(a, b0, ty), lerp(c0, d, ty), tz);
        }
        return out;
    }
    private static float lerp(float a, float b, float t) { return a + (b - a) * t; }
    private float norm(float value, int c) { return Math.max(0f, Math.min(1f, (value - domainMin[c]) / (domainMax[c] - domainMin[c]))); }
    // .cube rows enumerate red fastest, then green, then blue (the Lab export order).
    private float v(int r, int g, int b, int c) { return values[((b * size + g) * size + r) * 3 + c]; }
}
