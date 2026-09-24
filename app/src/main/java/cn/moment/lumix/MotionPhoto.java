package cn.moment.lumix;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** JPEG + XMP Container directory + original MP4; leaves EXIF/ICC/JPEG scan untouched. */
public final class MotionPhoto {
    private MotionPhoto() {}
    public static void write(File jpeg,File mp4,File output,long stillUs) throws IOException {
        if(jpeg.getCanonicalFile().equals(output.getCanonicalFile()) || mp4.getCanonicalFile().equals(output.getCanonicalFile()))
            throw new IOException("不能覆盖原始素材");
        long length=mp4.length(); if(length<12) throw new IOException("视频为空");
        String xmp="http://ns.adobe.com/xap/1.0/\u0000"+
            "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"+
            "<rdf:Description xmlns:Camera=\"http://ns.google.com/photos/1.0/camera/\" xmlns:Container=\"http://ns.google.com/photos/1.0/container/\" xmlns:Item=\"http://ns.google.com/photos/1.0/container/item/\" Camera:MotionPhoto=\"1\" Camera:MotionPhotoVersion=\"1\" Camera:MotionPhotoPresentationTimestampUs=\""+stillUs+"\">"+
            "<Container:Directory><rdf:Seq><rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"image/jpeg\" Item:Semantic=\"Primary\" Item:Padding=\"0\"/></rdf:li>"+
            "<rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"video/mp4\" Item:Semantic=\"MotionPhoto\" Item:Length=\""+length+"\"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>";
        byte[] packet=xmp.getBytes(StandardCharsets.UTF_8);
        File temporary=new File(output.getPath()+".part");
        try(InputStream in=new BufferedInputStream(new FileInputStream(jpeg)); OutputStream out=new BufferedOutputStream(new FileOutputStream(temporary))) {
            if(in.read()!=255 || in.read()!=216) throw new IOException("静态照片不是 JPEG；请在 S5 设置 JPEG 或 RAW+JPEG");
            out.write(255);out.write(216);out.write(255);out.write(225);
            out.write((packet.length+2)>>>8);out.write((packet.length+2)&255);out.write(packet);
            in.transferTo(out); try(InputStream video=new BufferedInputStream(new FileInputStream(mp4))) { video.transferTo(out); }
        } catch(IOException ex) { Files.deleteIfExists(temporary.toPath()); throw ex; }
        Files.move(temporary.toPath(),output.toPath());
    }
}
