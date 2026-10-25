package android.media;

import java.io.File;

/** Host double. Tag names match the platform constants, which production code inlines. */
public class ExifInterface {
    public static final String TAG_MAKE = "Make";
    public static final String TAG_MODEL = "Model";
    public static final String TAG_ISO_SPEED_RATINGS = "ISOSpeedRatings";
    public static final String TAG_EXPOSURE_TIME = "ExposureTime";
    public static final String TAG_F_NUMBER = "FNumber";
    public static final String TAG_FOCAL_LENGTH = "FocalLength";
    public static final String TAG_IMAGE_WIDTH = "ImageWidth";
    public static final String TAG_IMAGE_LENGTH = "ImageLength";
    public static final String TAG_PIXEL_X_DIMENSION = "PixelXDimension";
    public static final String TAG_PIXEL_Y_DIMENSION = "PixelYDimension";
    public static final String TAG_ORIENTATION = "Orientation";
    public static final int ORIENTATION_NORMAL = 1;
    public static final int ORIENTATION_TRANSPOSE = 5;
    public static final int ORIENTATION_ROTATE_90 = 6;
    public static final int ORIENTATION_TRANSVERSE = 7;
    public static final int ORIENTATION_ROTATE_270 = 8;
    public static String make = "Panasonic";
    public static String model = "DC-S5";
    public static int iso = 400;
    public static double exposure = 0.008;
    public static double aperture = 1.8;
    public static double focal = 50;
    public static int pixelWidth = 6000, pixelHeight = 4000;
    public static int orientation = ORIENTATION_NORMAL;
    public static boolean fail;
    public ExifInterface(File file) throws java.io.IOException { if (fail) throw new java.io.IOException("bad exif"); }
    public ExifInterface(String path) throws java.io.IOException { if (fail) throw new java.io.IOException("bad exif"); }
    public String getAttribute(String tag) {
        if (TAG_MAKE.equals(tag)) return make;
        if (TAG_MODEL.equals(tag)) return model;
        return null;
    }
    public int getAttributeInt(String tag, int fallback) {
        if (TAG_ISO_SPEED_RATINGS.equals(tag)) return iso < 0 ? fallback : iso;
        if (TAG_PIXEL_X_DIMENSION.equals(tag)) return pixelWidth <= 0 ? fallback : pixelWidth;
        if (TAG_PIXEL_Y_DIMENSION.equals(tag)) return pixelHeight <= 0 ? fallback : pixelHeight;
        if (TAG_IMAGE_WIDTH.equals(tag)) return pixelWidth <= 0 ? fallback : pixelWidth;
        if (TAG_IMAGE_LENGTH.equals(tag)) return pixelHeight <= 0 ? fallback : pixelHeight;
        if (TAG_ORIENTATION.equals(tag)) return orientation;
        return fallback;
    }
    public double getAttributeDouble(String tag, double fallback) {
        if (TAG_EXPOSURE_TIME.equals(tag)) return exposure < 0 ? fallback : exposure;
        if (TAG_F_NUMBER.equals(tag)) return aperture < 0 ? fallback : aperture;
        if (TAG_FOCAL_LENGTH.equals(tag)) return focal < 0 ? fallback : focal;
        return fallback;
    }
}
