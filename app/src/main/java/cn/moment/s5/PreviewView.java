package cn.moment.s5;

import android.content.Context;
import android.graphics.*;
import android.view.View;

public final class PreviewView extends View {
    private Bitmap bitmap;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private final RectF bounds=new RectF();
    private boolean grid=true;
    public PreviewView(Context c) {super(c);setContentDescription("S5 实时取景画面");setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);}
    public void image(Bitmap next) {Bitmap old=bitmap;bitmap=next;invalidate();if(old!=null && old!=next) old.recycle();}
    public void grid(boolean on) {grid=on;invalidate();}
    @Override protected void onMeasure(int w,int h) {
        int width=MeasureSpec.getSize(w);
        setMeasuredDimension(width,resolveSize(Math.round(width*2f/3),h));
    }
    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);int w=getWidth(),h=getHeight();c.drawColor(0xff181d18);
        if(bitmap!=null && !bitmap.isRecycled()) {
            float s=Math.min(w/(float)bitmap.getWidth(),h/(float)bitmap.getHeight());float bw=bitmap.getWidth()*s,bh=bitmap.getHeight()*s;
            bounds.set((w-bw)/2,(h-bh)/2,(w+bw)/2,(h+bh)/2);paint.setAlpha(255);c.drawBitmap(bitmap,null,bounds,paint);
        } else {
            paint.setColor(0xff5d685b);paint.setStrokeWidth(2*getResources().getDisplayMetrics().density);paint.setStyle(Paint.Style.STROKE);
            c.drawCircle(w*.5f,h*.5f,h*.18f,paint);c.drawCircle(w*.5f,h*.5f,h*.1f,paint);
            paint.setStyle(Paint.Style.FILL);paint.setColor(0xffd6f58b);c.drawCircle(w*.5f,h*.5f,h*.018f,paint);
        }
        if(grid && bitmap!=null) {
            paint.setColor(0x55ffffff);paint.setStrokeWidth(1);
            for(int i=1;i<3;i++){c.drawLine(w*i/3f,0,w*i/3f,h,paint);c.drawLine(0,h*i/3f,w,h*i/3f,paint);}
        }
        paint.setColor(0xffd6f58b);paint.setStrokeWidth(2);float m=16*getResources().getDisplayMetrics().density,l=12*getResources().getDisplayMetrics().density;
        c.drawLine(m,m,m+l,m,paint);c.drawLine(m,m,m,m+l,paint);
        c.drawLine(w-m,h-m,w-m-l,h-m,paint);c.drawLine(w-m,h-m,w-m,h-m-l,paint);
    }
}
