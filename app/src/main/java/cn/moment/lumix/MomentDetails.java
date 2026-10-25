package cn.moment.lumix;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.os.Environment;
import android.provider.MediaStore;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** One album record: provenance, EXIF, app storage and whether DCIM/MomentS5 still has the export. */
public final class MomentDetails {
    public final String origin, transport, cameraFile, camera, lens, iso, shutter, aperture, focalLength, lut, directory, exportPath;
    public final long capturedAt;
    public final int width, height;
    public final boolean lutApplied, exportKnown, exported;
    public final List<FileInfo> files;

    public static final class FileInfo {
        public final String name;
        public final long bytes;
        public FileInfo(String name, long bytes) { this.name = name; this.bytes = bytes; }
    }

    private MomentDetails(String origin, String transport, String cameraFile, String camera, String lens, String iso, String shutter, String aperture, String focalLength, String lut, String directory, String exportPath, long capturedAt, int width, int height, boolean lutApplied, boolean exportKnown, boolean exported, List<FileInfo> files) {
        this.origin = origin; this.transport = transport; this.cameraFile = cameraFile; this.camera = camera; this.lens = lens; this.iso = iso; this.shutter = shutter; this.aperture = aperture; this.focalLength = focalLength; this.lut = lut; this.directory = directory; this.exportPath = exportPath; this.capturedAt = capturedAt; this.width = width; this.height = height; this.lutApplied = lutApplied; this.exportKnown = exportKnown; this.exported = exported; this.files = files;
    }

    public static MomentDetails read(Context context, File dir) throws Exception {
        JSONObject meta = MomentStore.metadata(dir);
        boolean demo = meta.optBoolean("demo", false);
        boolean photo = "photo".equals(meta.optString("captureMode"));
        String source = meta.optString("source", "");
        String cameraFile = demo || source.isEmpty() || "DEMO.jpg".equals(source) ? null : source;
        MomentExif.Raw exif = MomentExif.read(new File(dir, "original.jpg"));
        String lut = meta.isNull("lut") ? null : meta.optString("lut", null);
        if (lut != null && lut.isEmpty()) lut = null;
        List<FileInfo> files = new ArrayList<>();
        for (String name : new String[]{"original.jpg", "rendered.jpg", "motion.mp4", "MOMENT_MP.jpg"}) {
            File file = new File(dir, name);
            if (file.isFile()) files.add(new FileInfo(name, file.length()));
        }
        Export export = findExport(context, dir.getName() + (photo ? ".jpg" : "_MP.jpg"));
        return new MomentDetails(
                MomentFacts.origin(demo, meta.optBoolean("cameraTriggered", false)),
                MomentFacts.transport(meta.optString("transport", demo ? "demo" : "")),
                cameraFile, exif.camera, exif.lens, exif.iso, exif.shutter, exif.aperture, exif.focal,
                lut, dir.getAbsolutePath(), export.path, meta.optLong("createdAt", dir.lastModified()),
                exif.width, exif.height, meta.optBoolean("lutApplied", false), export.known, export.exported, files);
    }

    private static final class Export {
        final boolean known, exported;
        final String path;
        Export(boolean known, boolean exported, String path) { this.known = known; this.exported = exported; this.path = path; }
    }

    private static Export findExport(Context context, String displayName) {
        ContentResolver resolver = context == null ? null : context.getContentResolver();
        if (resolver == null) return new Export(false, false, null);
        String folder = Environment.DIRECTORY_DCIM + "/MomentS5";
        String[] projection = {MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.RELATIVE_PATH};
        String selection = MediaStore.Images.Media.DISPLAY_NAME + "=? AND (" + MediaStore.Images.Media.RELATIVE_PATH + "=? OR " + MediaStore.Images.Media.RELATIVE_PATH + "=?)";
        try (Cursor cursor = resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, selection, new String[]{displayName, folder + "/", folder}, null)) {
            if (cursor == null) return new Export(false, false, null);
            if (!cursor.moveToFirst()) return new Export(true, false, null);
            int nameIndex = cursor.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME);
            int pathIndex = cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH);
            String name = nameIndex >= 0 ? cursor.getString(nameIndex) : displayName;
            String relative = pathIndex >= 0 ? cursor.getString(pathIndex) : folder + "/";
            if (relative == null || relative.isEmpty()) relative = folder + "/";
            if (!relative.endsWith("/")) relative += "/";
            if (!(relative.equals(folder + "/") || relative.startsWith(folder + "/"))) return new Export(true, false, null);
            return new Export(true, true, relative + (name == null || name.isEmpty() ? displayName : name));
        } catch (RuntimeException e) {
            return new Export(false, false, null);
        }
    }
}
