package cn.moment.lumix;

import android.graphics.BitmapFactory;
import android.media.ExifInterface;

import java.io.File;
import java.io.IOException;

/** EXIF labels for one original.jpg. Missing tags stay null; a bad header does not fail the panel. */
public final class MomentExif {
    public static final class Raw {
        public String camera, lens, iso, shutter, aperture, focal;
        public int width, height;
    }

    private MomentExif() {}

    public static Raw read(File file) {
        Raw raw = new Raw();
        try { raw.lens = JpegExif.lens(file); }
        catch (IOException ignored) { raw.lens = null; }
        try {
            ExifInterface exif = new ExifInterface(file);
            raw.camera = MomentFacts.cameraName(exif.getAttribute(ExifInterface.TAG_MAKE), exif.getAttribute(ExifInterface.TAG_MODEL));
            raw.iso = MomentFacts.iso(exif.getAttributeInt(ExifInterface.TAG_ISO_SPEED_RATINGS, -1));
            raw.shutter = MomentFacts.shutter(exif.getAttributeDouble(ExifInterface.TAG_EXPOSURE_TIME, -1));
            raw.aperture = MomentFacts.aperture(exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, -1));
            raw.focal = MomentFacts.focal(exif.getAttributeDouble(ExifInterface.TAG_FOCAL_LENGTH, -1));
            int width = exif.getAttributeInt(ExifInterface.TAG_PIXEL_X_DIMENSION, 0);
            int height = exif.getAttributeInt(ExifInterface.TAG_PIXEL_Y_DIMENSION, 0);
            if (width <= 0 || height <= 0) {
                width = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0);
                height = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0);
            }
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90 || orientation == ExifInterface.ORIENTATION_ROTATE_270
                    || orientation == ExifInterface.ORIENTATION_TRANSPOSE || orientation == ExifInterface.ORIENTATION_TRANSVERSE) {
                int swap = width; width = height; height = swap;
            }
            raw.width = width;
            raw.height = height;
        } catch (IOException ignored) { /* Demo frames and damaged headers still show the rest of the record. */ }
        if (raw.width <= 0 || raw.height <= 0) {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), options);
            if (options.outWidth > 0 && options.outHeight > 0) {
                raw.width = options.outWidth;
                raw.height = options.outHeight;
            }
        }
        return raw;
    }
}
