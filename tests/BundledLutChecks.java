package cn.moment.lumix;

import android.content.Context;
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Loads the actual bundled cubes with the production LutEngine; no camera. */
public final class BundledLutChecks {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    private static Object field(LutEngine lut, String name) throws Exception {
        Field field = LutEngine.class.getDeclaredField(name); field.setAccessible(true); return field.get(lut);
    }
    private static float[] sample(LutEngine lut, float r, float g, float b) throws Exception {
        Method method = LutEngine.class.getDeclaredMethod("sample", float.class, float.class, float.class);
        method.setAccessible(true); return (float[]) method.invoke(lut, r, g, b);
    }
    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder out = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) out.append(String.format("%02x", value & 255));
        return out.toString();
    }
    private static void invalidAsset(File assets, File cache, String id, String expected) throws Exception {
        try { BuiltInLuts.load(new Context(assets, cache), id); throw new AssertionError("invalid built-in accepted"); }
        catch (IOException error) { check(error.getMessage().contains(expected), "invalid asset rejected: " + expected); }
        check(Objects.requireNonNull(cache.list()).length == 0, "failed asset load removes its temporary copy");
    }
    private static void removeFixture(File directory) throws IOException {
        try (java.util.stream.Stream<Path> paths = Files.walk(directory.toPath())) {
            for (Path path : (Iterable<Path>) paths.sorted(Comparator.reverseOrder())::iterator) Files.deleteIfExists(path);
        }
    }
    public static void main(String[] args) throws Exception {
        File assets = new File(args.length > 0 ? args[0] : "mobile/android/app/src/main/assets/luts");
        File cache = Files.createTempDirectory("moment-builtin-cache-").toFile();
        try {
        Context context = new Context(assets.getParentFile(), cache);
        check(BuiltInLutCatalog.ENTRIES.size() == 8, "eight built-in presets");
        check(!BuiltInLutCatalog.isBuiltIn("fuji-style-velvia.cube"), "imported filename cannot address built-in namespace");
        check(BuiltInLutCatalog.find("builtin:../velvia") == null, "only exact catalog IDs are accepted");
        Set<String> ids = new HashSet<>(), filenames = new HashSet<>(), transforms = new HashSet<>(); long total = 0;
        for (BuiltInLutCatalog.Entry entry : BuiltInLutCatalog.ENTRIES) {
            File file = new File(assets, entry.assetName); byte[] bytes = Files.readAllBytes(file.toPath()); total += bytes.length;
            check(ids.add(entry.id) && filenames.add(entry.assetName), "unique preset ID and filename");
            check(BuiltInLutCatalog.isBuiltIn(entry.id), "built-in ID namespace");
            check(file.length() == entry.bytes && sha256(bytes).equals(entry.sha256), "asset/catalog bytes and checksum: " + entry.name);
            LutEngine lut = LutEngine.load(file);
            LutEngine builtIn = BuiltInLuts.load(context, entry.id);
            check(builtIn.title.equals(entry.name), "asset loader shares the hardened parser");
            check(Arrays.equals(sample(builtIn, .25f, .5f, .75f), sample(lut, .25f, .5f, .75f)), "built-in/file paths produce the same transform");
            check(Objects.requireNonNull(cache.list()).length == 0, "successful asset load removes its temporary copy");
            check(lut.title.equals(entry.name) && entry.name.startsWith("Fuji 风格 · "), "honest preset title");
            check((Integer) field(lut, "size") == 33, "33-grid parsed by LutEngine");
            float[] values = (float[]) field(lut, "values");
            check(values.length == 33 * 33 * 33 * 3, "all 35,937 RGB nodes loaded");
            check(Arrays.equals((float[]) field(lut, "domainMin"), new float[]{0, 0, 0}) &&
                  Arrays.equals((float[]) field(lut, "domainMax"), new float[]{1, 1, 1}), "full-range SDR input domain");
            for (float value : values) if (!Float.isFinite(value) || value < 0 || value > 1) throw new AssertionError("out-of-range LUT node: " + entry.name);
            checks++;
            check(transforms.add(sha256(Arrays.toString(values).getBytes(StandardCharsets.UTF_8))), "each look has a distinct transform");
            // Samples between nodes catch axis/order mistakes and interpolation errors.
            Random random = new Random(709);
            for (int i = 0; i < 64; i++) {
                float[] rgb = sample(lut, random.nextFloat(), random.nextFloat(), random.nextFloat());
                check(rgb.length == 3 && Arrays.stream(new double[]{rgb[0], rgb[1], rgb[2]}).allMatch(v -> Double.isFinite(v) && v >= 0 && v <= 1), "bounded interpolated RGB");
                if (entry.id.equals("builtin:acros")) check(rgb[0] == rgb[1] && rgb[1] == rgb[2], "Acros remains monochrome between nodes");
            }
            for (int axis = 0; axis < 3; axis++) {
                float[] input = new float[3]; input[axis] = 1;
                float[] rgb = sample(lut, input[0], input[1], input[2]);
                int index = (axis == 0 ? 32 : axis == 1 ? 32 * 33 : 32 * 33 * 33) * 3;
                check(rgb[0] == values[index] && rgb[1] == values[index + 1] && rgb[2] == values[index + 2], "red-fastest cube ordering");
                if (!entry.id.equals("builtin:acros")) check(rgb[axis] > rgb[(axis + 1) % 3] && rgb[axis] > rgb[(axis + 2) % 3], "primary colors retain the intended axis");
            }
            float lastBrightness = -1;
            for (int i = 0; i <= 64; i++) {
                float gray = i / 64f; float[] rgb = sample(lut, gray, gray, gray);
                float brightness = rgb[0] * .2126f + rgb[1] * .7152f + rgb[2] * .0722f;
                check(brightness >= lastBrightness, "neutral ramp does not invert brightness"); lastBrightness = brightness;
            }
            check(!Arrays.equals(sample(lut, .25f, .5f, .75f), new float[]{.25f, .5f, .75f}), "look is not identity");
            System.out.println("PASS " + entry.name + " — 33³, " + entry.bytes + " bytes, MIT");
        }
        File[] cubes = assets.listFiles(f -> f.getName().endsWith(".cube"));
        check(cubes != null && cubes.length == filenames.size(), "every bundled cube appears in the catalog");
        check(total < 10_000_000, "bundled cubes below 10 MB");
        check(new File(assets, "LICENSE.txt").isFile(), "license travels with APK assets");
        invalidAsset(assets.getParentFile(), cache, "builtin:../velvia", "内置 LUT 不存在");
        File invalidAssets = Files.createTempDirectory("moment-invalid-assets-").toFile();
        try {
            File luts = new File(invalidAssets, "luts"); check(luts.mkdir(), "invalid asset fixture directory");
            BuiltInLutCatalog.Entry first = BuiltInLutCatalog.ENTRIES.get(0);
            File invalid = new File(luts, first.assetName);
            Files.write(invalid.toPath(), new byte[]{0});
            invalidAsset(invalidAssets, cache, first.id, "内置 LUT 大小不匹配");
            try (RandomAccessFile file = new RandomAccessFile(invalid, "rw")) { file.setLength(first.bytes); }
            invalidAsset(invalidAssets, cache, first.id, "缺少 LUT_3D_SIZE");
            Files.delete(invalid.toPath()); Files.delete(luts.toPath());
        } finally { removeFixture(invalidAssets); }
        System.out.println(checks + " bundled LUT checks passed; " + total + " cube bytes.");
        } finally { Files.delete(cache.toPath()); }
    }
}
