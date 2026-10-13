package cn.moment.lumix;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.awt.image.BufferedImage;
import java.io.*;
import java.lang.reflect.Method;
import java.util.Arrays;
import javax.imageio.ImageIO;

/** Host JPEG harness, with immutable decode semantics; not an Android codec test. */
public final class LutBitmapChecks {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    public static void main(String[] args) throws Exception {
        File assets = new File(args[0]);
        BufferedImage image = new BufferedImage(32, 32, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) image.setRGB(x, y, 0x80afc0);
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        check(ImageIO.write(image, "jpg", encoded), "host JPEG encoder available");
        byte[] original = encoded.toByteArray(), untouched = original.clone();
        Bitmap decoded = BitmapFactory.decodeByteArray(original, 0, original.length);
        check(decoded.getConfig() == Bitmap.Config.ARGB_8888 && !decoded.isMutable(), "default decoded bitmap is immutable ARGB_8888");
        decoded.recycle();
        int input = ImageIO.read(new ByteArrayInputStream(original)).getRGB(16, 16);
        Method sampler = LutEngine.class.getDeclaredMethod("sample", float.class, float.class, float.class);
        sampler.setAccessible(true);
        for (BuiltInLutCatalog.Entry entry : BuiltInLutCatalog.ENTRIES) {
            LutEngine lut = LutEngine.load(new File(assets, entry.assetName));
            byte[] rendered = lut.applyJpeg(original);
            check(Arrays.equals(original, untouched), "input JPEG bytes remain untouched: " + entry.name);
            BufferedImage output = ImageIO.read(new ByteArrayInputStream(rendered));
            check(output != null && output.getWidth() == 32 && output.getHeight() == 32, "rendered JPEG keeps full dimensions");
            float[] expected = (float[]) sampler.invoke(lut, (input >>> 16 & 255) / 255f, (input >>> 8 & 255) / 255f, (input & 255) / 255f);
            int pixel = output.getRGB(16, 16);
            for (int channel = 0; channel < 3; channel++) {
                int actual = pixel >>> (16 - channel * 8) & 255;
                check(Math.abs(actual - Math.round(expected[channel] * 255)) <= 4, "pixel loop applies LUT before host JPEG encoding");
            }
        }
        System.out.println(checks + " immutable-bitmap / host JPEG checks passed (Android codecs not exercised).");
    }
}
