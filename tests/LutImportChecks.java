package cn.moment.lumix;

import java.io.*;
import java.nio.file.*;
import java.util.Comparator;
import java.util.zip.*;

/** Pure JVM bounds and ZIP checks, without Android or a camera. */
public final class LutImportChecks {
    private static int checks;
    private static void check(boolean ok,String message){checks++;if(!ok)throw new AssertionError(message);}
    private static byte[] archive(String name,int ignoredBytes,int directories)throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(ZipOutputStream zip=new ZipOutputStream(bytes)) {
            for(int i=0;i<directories;i++){zip.putNextEntry(new ZipEntry("folder"+i+"/"));zip.closeEntry();}
            if(ignoredBytes>0){zip.putNextEntry(new ZipEntry("ignored.bin"));byte[] block=new byte[8192];for(int left=ignoredBytes;left>0;left-=8192)zip.write(block,0,Math.min(left,8192));zip.closeEntry();}
            zip.putNextEntry(new ZipEntry(name));zip.write("LUT_3D_SIZE 2\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));zip.closeEntry();
        }
        return bytes.toByteArray();
    }
    public static void main(String[] args)throws Exception {
        Path root=Files.createTempDirectory("lut-import-");File target=root.resolve("import.part").toFile();
        try {
            String name=LutImport.extract(new ByteArrayInputStream(archive("nested/warm..tone.CUBE",12,0)),target);
            check("warm..tone.CUBE".equals(name),"nested filename and consecutive dots are safe");
            check(Files.readString(target.toPath()).equals("LUT_3D_SIZE 2\n"),"selected cube bytes preserved");
            for(String path:new String[]{"../bad.cube","nested/../bad.cube","C:\\bad.cube","/bad.cube","nested\\..\\bad.cube"}) {
                try{LutImport.extract(new ByteArrayInputStream(archive(path,0,0)),target);throw new AssertionError("invalid path accepted");}
                catch(IOException expected){check(!target.exists(),"unsafe ZIP removes partial output");}
            }
            try{LutImport.extract(new ByteArrayInputStream(archive("good.cube",33*1024*1024,0)),target);throw new AssertionError("skipped ZIP bomb accepted");}
            catch(IOException expected){check(!target.exists(),"skipped ZIP entries are bounded before reaching the cube");}
            try{LutImport.extract(new ByteArrayInputStream(archive("good.cube",0,513)),target);throw new AssertionError("unbounded entries accepted");}
            catch(IOException expected){check(!target.exists(),"ZIP entry count bounded");}
            try{LutImport.copy(new ByteArrayInputStream(new byte[17*1024*1024]),target);throw new AssertionError("large LUT accepted");}
            catch(IOException expected){check(!target.exists(),"oversized LUT leaves no partial file");}
            Files.writeString(target.toPath(),"partial");
            try{LutImport.extract(new ByteArrayInputStream(archive("readme.txt",0,0)),target);throw new AssertionError("missing cube accepted");}
            catch(IOException expected){check(!target.exists(),"missing cube removes temporary output");}
        }finally{try(var paths=Files.walk(root)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}}
        System.out.println("PASS "+checks+" LUT import checks");
    }
}
