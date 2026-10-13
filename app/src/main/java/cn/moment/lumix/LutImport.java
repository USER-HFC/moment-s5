package cn.moment.lumix;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Bounds both the selected LUT and skipped, decompressed ZIP entries. */
public final class LutImport {
    private static final int MAX_FILE=16*1024*1024;
    private LutImport() {}

    public static void copy(InputStream in,File target) throws IOException {
        try(OutputStream out=new FileOutputStream(target)) {
            transfer(in,out,MAX_FILE);
        } catch(IOException e) {removePartial(target,e);throw e;}
    }
    public static String extract(InputStream source,File target) throws IOException {
        try(ZipInputStream zip=new ZipInputStream(source,StandardCharsets.UTF_8)) {
            ZipEntry entry;long remaining=2L*MAX_FILE;int entries=0;
            while((entry=zip.getNextEntry())!=null) {
                if(++entries>512)throw new IOException("ZIP 文件条目过多");
                String name=entry.getName();
                if(!entry.isDirectory() && name.toLowerCase(Locale.ROOT).endsWith(".cube")) {
                    String path=name.replace('\\','/');
                    if(path.startsWith("/") || path.matches("^[A-Za-z]:.*"))throw new IOException("ZIP 包含非法路径");
                    for(String segment:path.split("/"))if("..".equals(segment))throw new IOException("ZIP 包含非法路径");
                    try(OutputStream out=new FileOutputStream(target)) {transfer(zip,out,Math.min(MAX_FILE,remaining));}
                    return path.substring(path.lastIndexOf('/')+1);
                }
                remaining-=transfer(zip,OutputStream.nullOutputStream(),remaining);
            }
            throw new IOException("ZIP 中没有 .cube LUT");
        } catch(IOException e) {removePartial(target,e);throw e;}
    }
    private static long transfer(InputStream in,OutputStream out,long limit) throws IOException {
        byte[] bytes=new byte[8192];long total=0;int n;
        while((n=in.read(bytes))!=-1) {
            total+=n;if(total>limit)throw new IOException("LUT 文件或 ZIP 解压数据超过大小上限");
            out.write(bytes,0,n);
        }
        return total;
    }
    private static void removePartial(File target,IOException error) {
        try {Files.deleteIfExists(target.toPath());}catch(IOException cleanup){error.addSuppressed(cleanup);}
    }
}
