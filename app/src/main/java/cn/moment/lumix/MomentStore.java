package cn.moment.lumix;

import android.content.*;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
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
        File motion=new File(dir,"MOMENT_MP.jpg"); if(!motion.isFile()) throw new IOException("没有可导出的实况照片");
        ContentValues v=new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME,dir.getName()+"_MP.jpg");v.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
        v.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_DCIM+"/MomentS5");v.put(MediaStore.Images.Media.IS_PENDING,1);
        ContentResolver r=context.getContentResolver();Uri uri=r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,v);
        if(uri==null) throw new IOException("系统相册创建失败");
        try {
            try(OutputStream out=r.openOutputStream(uri)) {if(out==null) throw new IOException("无法写入相册");Files.copy(motion.toPath(),out);}
            v.clear();v.put(MediaStore.Images.Media.IS_PENDING,0);r.update(uri,v,null,null);return uri;
        } catch(Exception e) {r.delete(uri,null,null);throw e;}
    }
}
