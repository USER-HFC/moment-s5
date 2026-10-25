package cn.moment.lumix;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;

/** Rebuilds a moment's LUT derivative from the untouched original.jpg. */
public final class MomentRender {
    private MomentRender() {}

    public static void apply(File dir, LutEngine filter, String lutId) throws IOException {
        File original = new File(dir, "original.jpg");
        if (!original.isFile() || original.length() == 0) throw new IOException("没有原片，无法重新套用 LUT");
        byte[] originalBytes = Files.readAllBytes(original.toPath());
        JSONObject meta;
        try { meta = MomentStore.metadata(dir); }
        catch (Exception e) { throw new IOException("无法读取照片记录", e); }
        boolean motion = !"photo".equals(meta.optString("captureMode"));
        File video = new File(dir, "motion.mp4");
        boolean packMotion = motion && video.isFile() && video.length() >= 12;
        File rendered = new File(dir, "rendered.jpg");
        File renderedPart = new File(dir, "rendered.jpg.part");
        File packedNext = new File(dir, "MOMENT_MP.next.jpg");
        Files.deleteIfExists(renderedPart.toPath());
        Files.deleteIfExists(packedNext.toPath());
        boolean applied = false;
        try {
            if (filter != null) {
                Files.write(renderedPart.toPath(), filter.applyJpeg(originalBytes));
                applied = true;
            }
            if (!Arrays.equals(originalBytes, Files.readAllBytes(original.toPath()))) throw new IOException("原片被修改");
            // Export reads MOMENT_MP.jpg for a motion photo, so the new still has to be packed with the same video.
            if (packMotion) {
                long stillUs = meta.has("stillUs") ? meta.optLong("stillUs") : 0L;
                MotionPhoto.write(applied ? renderedPart : original, video, packedNext, stillUs);
            }
            if (applied) Files.move(renderedPart.toPath(), rendered.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            else if (rendered.isFile()) Files.delete(rendered.toPath());
            if (packMotion) Files.move(packedNext.toPath(), new File(dir, "MOMENT_MP.jpg").toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            meta.put("lut", applied ? filter.title : JSONObject.NULL);
            meta.put("lutApplied", applied);
            meta.put("lutId", applied && lutId != null && !lutId.isEmpty() ? lutId : JSONObject.NULL);
            meta.put("lutRequested", applied ? filter.title : JSONObject.NULL);
            if ("photo".equals(meta.optString("captureMode")) && meta.optString("error", "").contains("LUT")) {
                meta.put("complete", true);
                meta.remove("error");
            }
            MomentStore.metadata(dir, meta);
        } catch (org.json.JSONException e) {
            throw new IOException("无法更新照片记录", e);
        } finally {
            Files.deleteIfExists(renderedPart.toPath());
            Files.deleteIfExists(packedNext.toPath());
        }
    }

    public static byte[] preview(File original, LutEngine filter, int maxEdge) throws IOException {
        if (filter == null) throw new IOException("原色无需预览");
        if (!original.isFile() || original.length() == 0) throw new IOException("没有原片，无法预览 LUT");
        return filter.applyJpeg(Files.readAllBytes(original.toPath()), maxEdge);
    }

    public static File shareFile(File dir, JSONObject meta, String kind) throws IOException {
        String which = kind == null || kind.isEmpty() ? "display" : kind;
        switch (which) {
            case "original": return new File(dir, "original.jpg");
            case "video": return new File(dir, "motion.mp4");
            case "motion": return new File(dir, "MOMENT_MP.jpg");
            case "display":
                File rendered = new File(dir, "rendered.jpg");
                if (meta.optBoolean("lutApplied", false) && rendered.isFile()) return rendered;
                return new File(dir, "original.jpg");
            default: throw new IOException("未知分享类型");
        }
    }
}
