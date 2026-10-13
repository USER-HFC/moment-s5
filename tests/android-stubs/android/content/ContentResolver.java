package android.content;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
public class ContentResolver {
    public int updated=1,deleted;
    public boolean failDelete;
    public final ByteArrayOutputStream output=new ByteArrayOutputStream();
    public Uri insert(Uri uri,ContentValues values){return Uri.parse("content://test/photo/1");}
    public OutputStream openOutputStream(Uri uri){return output;}
    public int update(Uri uri,ContentValues values,String selection,String[] args){return updated;}
    public int delete(Uri uri,String selection,String[] args){deleted++;if(failDelete)throw new IllegalStateException("delete failed");return 1;}
}
