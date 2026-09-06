package cn.moment.s5;

import android.content.Context;
import android.view.MotionEvent;
import android.widget.ImageView;

/** Keeps the touch target alive while its still image becomes transparent. */
public final class HoldPhotoView extends ImageView {
    private boolean holding;
    private Runnable release=()->{};
    public HoldPhotoView(Context c) {super(c);setClickable(true);}
    public void hold(Runnable start,Runnable stop) {release=stop;setOnLongClickListener(v->{holding=true;start.run();return true;});}
    @Override public boolean onTouchEvent(MotionEvent e) {
        boolean held=holding;boolean handled=super.onTouchEvent(e);
        if(e.getAction()==MotionEvent.ACTION_UP || e.getAction()==MotionEvent.ACTION_CANCEL) {
            if(held) {holding=false;release.run();}
            else if(e.getAction()==MotionEvent.ACTION_UP) performClick();
        }
        return handled;
    }
    @Override public boolean performClick() {return super.performClick();}
}
