package cn.moment.lumix;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Reads EXIF LensModel. android.media.ExifInterface on API 35 has no public lens tag,
 * so the album asks the same JPEG for tag 0xA434 directly.
 */
public final class JpegExif {
    private static final int HEAD = 2 * 1024 * 1024;
    private static final int LENS_MODEL = 0xA434;
    private static final int LENS_MAKE = 0xA433;
    private static final int EXIF_IFD = 0x8769;
    private JpegExif() {}

    public static String lens(File file) throws IOException {
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            return lens(in.readNBytes(HEAD));
        }
    }

    static String lens(byte[] jpeg) {
        if (jpeg == null || jpeg.length < 8 || u8(jpeg, 0) != 0xFF || u8(jpeg, 1) != 0xD8) return null;
        int i = 2;
        while (i + 4 <= jpeg.length) {
            if (u8(jpeg, i) != 0xFF) return null;
            int marker = u8(jpeg, i + 1);
            i += 2;
            if (marker == 0xD8 || marker == 0xD9 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
            if (i + 2 > jpeg.length) return null;
            int length = (u8(jpeg, i) << 8) | u8(jpeg, i + 1);
            if (length < 2 || i + length > jpeg.length) return null;
            if (marker == 0xE1) {
                String found = lensInApp1(jpeg, i + 2, length - 2);
                if (found != null) return found;
            }
            if (marker == 0xDA) return null;
            i += length;
        }
        return null;
    }

    private static String lensInApp1(byte[] data, int offset, int length) {
        if (length < 14 || offset < 0 || offset + length > data.length) return null;
        if (data[offset] != 'E' || data[offset + 1] != 'x' || data[offset + 2] != 'i' || data[offset + 3] != 'f' || data[offset + 4] != 0 || data[offset + 5] != 0) return null;
        int tiff = offset + 6;
        int tiffLength = length - 6;
        if (tiffLength < 8) return null;
        boolean little = data[tiff] == 'I' && data[tiff + 1] == 'I';
        boolean big = data[tiff] == 'M' && data[tiff + 1] == 'M';
        if ((!little && !big) || u16(data, tiff + 2, little) != 42) return null;
        String[] found = new String[2];
        int ifd = u32(data, tiff + 4, little);
        int pointer = walk(data, tiff, tiffLength, ifd, little, found);
        if (found[0] == null && pointer >= 0) walk(data, tiff, tiffLength, pointer, little, found);
        return found[0] != null ? found[0] : found[1];
    }

    /** Returns the Exif IFD offset when this directory points at one. Model wins over make. */
    private static int walk(byte[] data, int tiff, int tiffLength, int ifd, boolean little, String[] found) {
        if (ifd < 0 || ifd + 2 > tiffLength) return -1;
        int count = u16(data, tiff + ifd, little);
        if (count < 0 || count > 512 || ifd + 2L + count * 12L > tiffLength) return -1;
        int pointer = -1;
        for (int n = 0; n < count; n++) {
            int entry = tiff + ifd + 2 + n * 12;
            int tag = u16(data, entry, little);
            int type = u16(data, entry + 2, little);
            int values = u32(data, entry + 4, little);
            if (tag == EXIF_IFD && type == 4 && values == 1) pointer = u32(data, entry + 8, little);
            if ((tag == LENS_MODEL || tag == LENS_MAKE) && type == 2) {
                String text = ascii(data, tiff, tiffLength, entry, values, little);
                if (tag == LENS_MODEL && text != null) found[0] = text;
                else if (found[1] == null) found[1] = text;
            }
        }
        return pointer;
    }

    private static String ascii(byte[] data, int tiff, int tiffLength, int entry, int count, boolean little) {
        if (count <= 1 || count > 512) return null;
        int position;
        if (count <= 4) position = entry + 8;
        else {
            int offset = u32(data, entry + 8, little);
            if (offset < 0 || offset + count > tiffLength) return null;
            position = tiff + offset;
        }
        if (position < 0 || position + count > data.length) return null;
        int end = position;
        while (end < position + count && data[end] != 0) end++;
        if (end == position) return null;
        String text = new String(data, position, end - position, StandardCharsets.UTF_8).trim();
        return text.isEmpty() ? null : text;
    }

    private static int u8(byte[] data, int index) { return data[index] & 255; }
    private static int u16(byte[] data, int index, boolean little) {
        if (index < 0 || index + 1 >= data.length) return -1;
        int a = data[index] & 255, b = data[index + 1] & 255;
        return little ? a | (b << 8) : (a << 8) | b;
    }
    private static int u32(byte[] data, int index, boolean little) {
        if (index < 0 || index + 3 >= data.length) return -1;
        int a = data[index] & 255, b = data[index + 1] & 255, c = data[index + 2] & 255, d = data[index + 3] & 255;
        int value = little ? a | (b << 8) | (c << 16) | (d << 24) : (a << 24) | (b << 16) | (c << 8) | d;
        return value < 0 ? -1 : value;
    }
}
