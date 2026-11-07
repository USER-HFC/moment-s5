package cn.moment.lumix;

import android.content.*;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;

public final class MomentStore {
    public final File root;
    public MomentStore(Context context) {root=new File(context.getFilesDir(),"moments");if(!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("无法创建照片目录");}
    public File create() throws IOException {
        File dir=new File(root,"M"+System.currentTimeMillis()+"_"+UUID.randomUUID().toString().substring(0,8));
        if(!dir.mkdir()) throw new IOException("无法创建拍摄目录");return dir;
    }
    public List<File> list() {
        File[] files=root.listFiles(f->f.isDirectory() && new File(f,"moment.json").isFile());
        ArrayList<File> list=new ArrayList<>(Arrays.asList(files==null?new File[0]:files));list.sort((a,b)->b.getName().compareTo(a.getName()));return list;
    }
    public void delete(String id) throws IOException {MomentDeletion.delete(root,id);}
    public static final class Usage {
        public final int count; public final long bytes;
        public Usage(int count,long bytes){this.count=count;this.bytes=bytes;}
    }
    /** Moment directories only. Symlinks are skipped so a link cannot count files outside the app. */
    public Usage usage() {
        int count=0;long bytes=0;
        for(File dir:list()){count++;bytes+=bytesUnder(dir.toPath());}
        return new Usage(count,bytes);
    }
    /**
     * Deletes app copies that MediaStore still lists as exported.
     * A missing or unreadable export is kept: uncertainty must not look like permission to delete.
     */
    public int deleteExported(Context context) throws IOException {
        int removed=0;
        for(File dir:new ArrayList<>(list())){
            if(!confirmedExport(context,dir)) continue;
            delete(dir.getName());
            removed++;
        }
        return removed;
    }
    private static boolean confirmedExport(Context context,File dir) {
        try{MomentDetails details=MomentDetails.read(context,dir);return details.exportKnown && details.exported;}
        catch(Exception e){return false;}
    }
    private static long bytesUnder(Path dir) {
        long[] total={0};
        try{Files.walkFileTree(dir,new SimpleFileVisitor<>(){
            @Override public FileVisitResult preVisitDirectory(Path directory,BasicFileAttributes attrs){return attrs.isSymbolicLink()?FileVisitResult.SKIP_SUBTREE:FileVisitResult.CONTINUE;}
            @Override public FileVisitResult visitFile(Path file,BasicFileAttributes attrs){if(!attrs.isSymbolicLink() && attrs.isRegularFile()) total[0]+=attrs.size();return FileVisitResult.CONTINUE;}
        });}catch(IOException ignored){}
        return total[0];
    }
    public static JSONObject metadata(File dir) throws Exception {return new JSONObject(new String(Files.readAllBytes(new File(dir,"moment.json").toPath()),java.nio.charset.StandardCharsets.UTF_8));}
    public static void metadata(File dir,JSONObject json) throws IOException {
        try {
            File part=new File(dir,"moment.json.part"),target=new File(dir,"moment.json");
            Files.write(part.toPath(),json.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Files.move(part.toPath(),target.toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE,java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        catch(org.json.JSONException e) {throw new IOException(e);}
    }
    public static Uri export(Context context,File dir) throws Exception {
        JSONObject meta=metadata(dir);
        boolean photo="photo".equals(meta.optString("captureMode"));
        File media=new File(dir,photo?(meta.optBoolean("lutApplied",false)?"rendered.jpg":"original.jpg"):"MOMENT_MP.jpg");
        if(!media.isFile() || media.length()==0) throw new IOException("没有可导出的照片");
        ContentValues v=new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME,dir.getName()+(photo?".jpg":"_MP.jpg"));v.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
        v.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_DCIM+"/MomentS5");v.put(MediaStore.Images.Media.IS_PENDING,1);
        ContentResolver r=context.getContentResolver();Uri uri=r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,v);
        if(uri==null) throw new IOException("系统相册创建失败");
        try {
            try(OutputStream out=r.openOutputStream(uri)) {if(out==null) throw new IOException("无法写入相册");Files.copy(media.toPath(),out);}
            v.clear();v.put(MediaStore.Images.Media.IS_PENDING,0);if(r.update(uri,v,null,null)!=1)throw new IOException("系统相册发布失败");return uri;
        } catch(Exception e) {try{r.delete(uri,null,null);}catch(Exception cleanup){e.addSuppressed(cleanup);}throw e;}
    }
}
