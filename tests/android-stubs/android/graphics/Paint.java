package android.graphics;
public final class Paint {
    public Paint(int flags){}
    public Shader setShader(Shader shader){return shader;}
    public void setColor(int color){}
    public void setTextSize(float size){}
    public void setTextAlign(Align align){}
    public Typeface setTypeface(Typeface typeface){return typeface;}
    public enum Align {LEFT,CENTER,RIGHT}
}
