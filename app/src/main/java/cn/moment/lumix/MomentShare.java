package cn.moment.lumix;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** Files handed to the system share sheet. Motion photos use the packed motion-photo file. */
public final class MomentShare {
    private MomentShare() {}

    public static File fileFor(File dir) throws IOException {
        JSONObject meta;
        try { meta = MomentStore.metadata(dir); }
        catch (Exception e) { throw new IOException("照片记录无法读取", e); }
        if (!"photo".equals(meta.optString("captureMode")) && meta.optBoolean("complete", false)) {
            File packed = new File(dir, "MOMENT_MP.jpg");
            if (packed.isFile() && packed.length() > 0) return packed;
        }
        File display = MomentRender.shareFile(dir, meta, "display");
        if (display.isFile() && display.length() > 0) return display;
        throw new IOException("文件尚未生成");
    }

    /** One intent for every selected photo. Callers wrap it in a chooser. */
    public static Intent sendMultiple(Context context, List<File> files) throws IOException {
        if (files == null || files.isEmpty()) throw new IOException("没有可分享的照片");
        ArrayList<Uri> uris = new ArrayList<>();
        ClipData clip = null;
        for (File file : files) {
            if (file == null || !file.isFile() || file.length() == 0) throw new IOException("文件尚未生成");
            Uri uri = ShareProvider.uri(context, file);
            uris.add(uri);
            if (clip == null) clip = ClipData.newRawUri(file.getName(), uri);
            else clip.addItem(new ClipData.Item(uri));
        }
        Intent intent = new Intent(Intent.ACTION_SEND_MULTIPLE);
        intent.setType("image/jpeg");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        intent.setClipData(clip);
        return intent;
    }
}
