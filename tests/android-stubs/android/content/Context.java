package android.content;
import java.io.File;
public class Context {
    private final File files;
    public ContentResolver resolver;
    public Context(File files){this.files=files;}
    public File getFilesDir(){return files;}
    public ContentResolver getContentResolver(){return resolver;}
}
