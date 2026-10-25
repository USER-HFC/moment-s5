package android.database;

public interface Cursor extends AutoCloseable {
    boolean moveToFirst();
    int getColumnIndex(String column);
    String getString(int column);
    @Override void close();
}
