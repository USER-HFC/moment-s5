package cn.moment.s5;

import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
import java.util.List;

/** Read-only sharing, restricted to this app's known output filenames. */
public final class ShareProvider extends ContentProvider {
    @Override public boolean onCreate() {return true;}
    static Uri uri(Context c,File file) {
        File root=new File(c.getFilesDir(),"moments");String relative=root.toPath().relativize(file.toPath()).toString().replace('\\','/');
        return new Uri.Builder().scheme("content").authority(c.getPackageName()+".files").path(relative).build();
    }
    private File resolve(Uri uri) throws FileNotFoundException {
        try {
            List<String> p=uri.getPathSegments();if(p.size()!=2) throw new IOException("Invalid path");
            String name=p.get(1);
            if(!List.of("original.jpg","rendered.jpg","motion.mp4","MOMENT_MP.jpg","moment.json","diagnostics.txt").contains(name)) throw new IOException("Invalid filename");
            File root=new File(getContext().getFilesDir(),"moments").getCanonicalFile();File f=new File(new File(root,p.get(0)),name).getCanonicalFile();
            if(!f.toPath().startsWith(root.toPath()) || !f.isFile()) throw new IOException("Not found");return f;
        } catch(IOException e) {throw new FileNotFoundException(e.getMessage());}
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if(!mode.equals("r")) throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public String getType(Uri uri) {String p=uri.getLastPathSegment();return p!=null && p.endsWith(".mp4")?"video/mp4":p!=null && p.endsWith(".jpg")?"image/jpeg":"text/plain";}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort) {
        try {
            File f=resolve(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            MatrixCursor cursor=new MatrixCursor(columns);Object[] values=new Object[columns.length];
            for(int i=0;i<columns.length;i++) values[i]=OpenableColumns.DISPLAY_NAME.equals(columns[i])?f.getName():OpenableColumns.SIZE.equals(columns[i])?f.length():null;
            cursor.addRow(values);return cursor;
        } catch(FileNotFoundException e) {return null;}
    }
    @Override public Uri insert(Uri u,ContentValues v) {throw new UnsupportedOperationException("Read only");}
    @Override public int update(Uri u,ContentValues v,String s,String[] a) {throw new UnsupportedOperationException("Read only");}
    @Override public int delete(Uri u,String s,String[] a) {throw new UnsupportedOperationException("Read only");}
}
