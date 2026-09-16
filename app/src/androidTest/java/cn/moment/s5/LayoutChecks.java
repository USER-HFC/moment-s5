package cn.moment.s5;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import java.lang.reflect.Field;
import java.util.function.BooleanSupplier;

/** Native activity checks using synthetic camera frames; never controls physical hardware. */
public class LayoutChecks extends Instrumentation {
    private MainActivity activity;
    @Override public void onStart(){
        Bundle result=new Bundle();
        try {
            Intent launch=new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity=(MainActivity)startActivitySync(launch);waitForIdleSync();
            require(activity.getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE,"landscape launch");
            for(String label:new String[]{"监看","定时遥控","动态照片","相册"})require(find(activity.getWindow().getDecorView(),label)!=null,"home entry: "+label);
            tap("监看");waitForIdleSync();
            View preview=(View)field("preview");require(preview.getWidth()>preview.getHeight() && preview.getHeight()>100,"large landscape preview");
            require(field("shutter")==null && field("timerButton")==null,"monitor has no capture action");
            tap("首页");tap("定时遥控");waitForIdleSync();
            require(!((Button)field("timerButton")).isEnabled(),"disconnected timer disabled");
            CaptureEngine engine=(CaptureEngine)field("engine");engine.demo();await(engine::active,5000);Thread.sleep(500);waitForIdleSync();
            require(((Button)field("timerButton")).isEnabled(),"connected timer enabled");beginTimer();
            await(()->count(engine)==1,5000);Thread.sleep(2300);require(count(engine)==1,"countdown fires exactly once");
            beginTimer();runOnMainSync(()->((Button)fieldUnchecked("timerButton")).performClick());Thread.sleep(2300);
            require(count(engine)==1 && (long)field("timerDeadline")==0,"manual cancel prevents shutter");
            beginTimer();tap("首页");Thread.sleep(2300);require(count(engine)==1,"navigation cancels countdown");
            tap("定时遥控");beginTimer();runOnMainSync(()->activity.moveTaskToBack(true));Thread.sleep(2300);
            require(count(engine)==1 && (long)field("timerDeadline")==0 && !engine.active(),"background cancels countdown and disconnects");
            result.putString("stream","PASS landscape home (4 entries), large monitor, disconnected timer guard, single countdown shot, manual/navigation/background cancellation; synthetic demo only\n");finish(-1,result);
        }catch(Throwable e){java.io.StringWriter trace=new java.io.StringWriter();e.printStackTrace(new java.io.PrintWriter(trace));result.putString("stream","FAIL\n"+trace);finish(1,result);}
        finally{if(activity!=null)runOnMainSync(()->activity.finish());}
    }
    private void beginTimer(){runOnMainSync(()->{setDelay(2);((Button)fieldUnchecked("timerButton")).performClick();});}
    private void setDelay(int seconds){try{Field f=MainActivity.class.getDeclaredField("delaySeconds");f.setAccessible(true);f.setInt(activity,seconds);}catch(Exception e){throw new AssertionError(e);}}
    private Object field(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);}
    private Object fieldUnchecked(String name){try{return field(name);}catch(Exception e){throw new AssertionError(e);}}
    private static int count(CaptureEngine engine){return engine.diagnostics().split("演示：遥控快门已触发",-1).length-1;}
    private void tap(String label){runOnMainSync(()->{View v=find(activity.getWindow().getDecorView(),label);require(v!=null,"button: "+label);require(v.performClick(),"click: "+label);});waitForIdleSync();}
    private static View find(View view,String label){
        if(label.contentEquals(view.getContentDescription()==null?"":view.getContentDescription()) || (view instanceof Button && label.contentEquals(((Button)view).getText())))return view;
        if(view instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++){View found=find(group.getChildAt(i),label);if(found!=null)return found;}
        return null;
    }
    private static void await(BooleanSupplier condition,long timeout)throws Exception{long end=android.os.SystemClock.elapsedRealtime()+timeout;while(!condition.getAsBoolean() && android.os.SystemClock.elapsedRealtime()<end)Thread.sleep(50);require(condition.getAsBoolean(),"condition timed out");}
    private static void require(boolean ok,String message){if(!ok)throw new AssertionError(message);}
}
