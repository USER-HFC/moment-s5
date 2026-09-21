package cn.moment.s5;

import android.app.PendingIntent;
import android.content.*;
import android.hardware.usb.*;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Shared JS contract; Android owns USB/PTP and LUT pixels, iOS can implement the same methods later. */
public final class MomentS5Module extends ReactContextBaseJavaModule {
    private static final String USB_PERMISSION="cn.moment.s5.RN_USB_PERMISSION";
    private final ReactApplicationContext context;private final UsbManager usb;private final File lutDir;private CaptureEngine engine;private BroadcastReceiver receiver;
    public MomentS5Module(ReactApplicationContext context){super(context);this.context=context;usb=(UsbManager)context.getSystemService(Context.USB_SERVICE);lutDir=new File(context.getFilesDir(),"luts");if(!lutDir.isDirectory())lutDir.mkdirs();
        engine=new CaptureEngine(context,new CaptureEngine.Listener(){
            @Override public void status(String s,boolean ready){WritableMap m=Arguments.createMap();m.putString("message",s);m.putBoolean("ready",ready);emit("cameraStatus",m);}
            @Override public void frame(byte[] b,long duration,boolean demo){WritableMap m=Arguments.createMap();m.putString("jpegBase64",Base64.encodeToString(b,Base64.NO_WRAP));m.putDouble("bufferedUs",duration);m.putBoolean("demo",demo);emit("cameraFrame",m);}
            @Override public void saved(File d){WritableMap m=Arguments.createMap();m.putString("directory",d.getAbsolutePath());emit("cameraSaved",m);}
            @Override public void log(String s){WritableMap m=Arguments.createMap();m.putString("message",s);emit("cameraLog",m);}
            @Override public void exposure(String s){WritableMap m=Arguments.createMap();m.putString("value",s);emit("cameraExposure",m);}
        });
        receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent intent){if(USB_PERMISSION.equals(intent.getAction())){UsbDevice d=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);if(d!=null&&intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED,false))connectDevice(d);else status("USB 访问未授权");}}};
        IntentFilter filter=new IntentFilter(USB_PERMISSION);if(Build.VERSION.SDK_INT>=33)context.registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);else context.registerReceiver(receiver,filter);
    }
    @Override public String getName(){return "MomentS5";}
    @ReactMethod public void connect(Promise promise){List<UsbDevice> devices=new ArrayList<>();for(UsbDevice d:usb.getDeviceList().values())if(UsbS5.candidate(d))devices.add(d);if(devices.isEmpty()){promise.reject("NO_S5","未发现 Panasonic S5，请确认 OTG、数据线和 PC(Tether)");return;}if(devices.size()>1){promise.reject("MULTIPLE_S5","检测到多台 Panasonic 相机");return;}UsbDevice d=devices.get(0);if(usb.hasPermission(d))connectDevice(d);else{PendingIntent p=PendingIntent.getBroadcast(context,0,new Intent(USB_PERMISSION).setPackage(context.getPackageName()),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE);usb.requestPermission(d,p);}promise.resolve(null);}
    private void connectDevice(UsbDevice d){engine.connect(usb,d);}
    @ReactMethod public void demo(){engine.demo();}
    @ReactMethod public void disconnect(){engine.disconnect();}
    @ReactMethod public void capture(){engine.capture();}
    @ReactMethod public void remoteShutter(){engine.remoteShutter();}
    @ReactMethod public void focus(int direction){engine.focus(direction);}
    @ReactMethod public void setAudio(boolean enabled){engine.audio(enabled);}
    @ReactMethod public void setLut(String id,Promise promise){try{if(engine.busy())throw new IOException("拍摄处理中，请稍后再切换 LUT");if(id==null||id.isEmpty()||"off".equals(id)){engine.setLut(null);promise.resolve(null);return;}File file=safeFile(id);if(!file.isFile())throw new IOException("LUT 不存在");engine.setLut(LutEngine.load(file));promise.resolve(engine.lutTitle());}catch(Exception e){promise.reject("LUT_INVALID",e.getMessage(),e);}}
    @ReactMethod public void listLuts(Promise promise){try{WritableArray out=Arguments.createArray();File[] files=lutDir.listFiles(f->f.isFile()&&f.getName().toLowerCase(Locale.ROOT).endsWith(".cube"));if(files!=null){Arrays.sort(files,Comparator.comparing(File::getName,String.CASE_INSENSITIVE_ORDER));for(File f:files){WritableMap m=Arguments.createMap();m.putString("id",f.getName());try{m.putString("name",LutEngine.load(f).title);}catch(IOException bad){m.putString("name",f.getName());}m.putDouble("size",f.length());out.pushMap(m);}}promise.resolve(out);}catch(Exception e){promise.reject("LUT_LIST",e);}}
    @ReactMethod public void listMoments(Promise promise){try{WritableArray out=Arguments.createArray();for(File dir:new MomentStore(context).list()){try{org.json.JSONObject meta=MomentStore.metadata(dir);WritableMap m=Arguments.createMap();m.putString("id",dir.getName());m.putString("source",meta.optString("source","动态照片"));m.putDouble("createdAt",meta.optLong("createdAt",dir.lastModified()));m.putBoolean("complete",meta.optBoolean("complete",false));m.putString("lut",meta.optString("lut",null));File image=new File(dir,"rendered.jpg");if(!image.isFile()) image=new File(dir,"original.jpg");if(image.isFile())m.putString("imageUri",ShareProvider.uri(context,image).toString());File video=new File(dir,"motion.mp4");if(video.isFile())m.putString("videoUri",ShareProvider.uri(context,video).toString());out.pushMap(m);}catch(Exception ignored){}}promise.resolve(out);}catch(Exception e){promise.reject("MOMENT_LIST",e);}}
    @ReactMethod public void importLut(String uri,String displayName,Promise promise){
        File temp=null;
        try {
            String requested=cleanName(displayName); boolean zip=requested.toLowerCase(Locale.ROOT).endsWith(".zip");
            temp=File.createTempFile("lut-import-", ".cube", lutDir);
            try(InputStream raw=context.getContentResolver().openInputStream(Uri.parse(uri))){
                if(raw==null) throw new IOException("无法读取 LUT 文件");
                if(zip) extractFirstCube(raw,temp); else copyBounded(raw,temp);
            }
            LutEngine lut=LutEngine.load(temp);
            String name=cleanName(lut.title); if(!name.toLowerCase(Locale.ROOT).endsWith(".cube")){name=cleanName(requested).replaceFirst("(?i)\\.zip$","");}
            if(!name.toLowerCase(Locale.ROOT).endsWith(".cube")) name+=".cube";
            File target=uniqueFile(name); if(!temp.renameTo(target)){copyBounded(new FileInputStream(temp),target);}
            WritableMap m=Arguments.createMap();m.putString("id",target.getName());m.putString("name",lut.title);promise.resolve(m);
        }catch(Exception e){promise.reject("LUT_IMPORT",e.getMessage(),e);}
        finally {if(temp!=null) temp.delete();}
    }
    @ReactMethod public void activeLut(Promise promise){promise.resolve(engine.lutTitle());}
    @ReactMethod public void diagnostics(Promise promise){promise.resolve(engine.diagnostics());}
    @ReactMethod public void getState(Promise promise){WritableMap m=Arguments.createMap();m.putBoolean("active",engine.active());m.putBoolean("busy",engine.busy());m.putBoolean("ready",engine.ready());m.putBoolean("demo",engine.demoMode());m.putString("lut",engine.lutTitle());promise.resolve(m);}
    @ReactMethod public void addListener(String name) {}
    @ReactMethod public void removeListeners(double count) {}
    @Override public void invalidate(){if(receiver!=null){try{context.unregisterReceiver(receiver);}catch(Exception ignored){}}if(engine!=null)engine.shutdown();super.invalidate();}
    private File safeFile(String id)throws IOException{String name=cleanName(id);File f=new File(lutDir,name);if(!f.getCanonicalFile().getParentFile().equals(lutDir.getCanonicalFile()))throw new IOException("非法 LUT 路径");return f;}
    private File uniqueFile(String name)throws IOException {File f=safeFile(name);if(!f.exists())return f;String stem=name.replaceFirst("(?i)\\.cube$","");for(int i=2;i<10000;i++){f=safeFile(stem+"-"+i+".cube");if(!f.exists())return f;}throw new IOException("LUT 仓库已存在太多同名文件");}
    private static void copyBounded(InputStream in,File target)throws IOException {try(InputStream input=in;OutputStream out=new FileOutputStream(target)){byte[] b=new byte[8192];int n,total=0;while((n=input.read(b))!=-1){total+=n;if(total>16*1024*1024)throw new IOException("LUT 文件超过 16 MB");out.write(b,0,n);}}}
    private static void extractFirstCube(InputStream source,File target)throws IOException {try(ZipInputStream zip=new ZipInputStream(source,StandardCharsets.UTF_8)){ZipEntry e;while((e=zip.getNextEntry())!=null){String n=e.getName();if(e.isDirectory()||!n.toLowerCase(Locale.ROOT).endsWith(".cube"))continue;if(n.contains("..")||new File(n).isAbsolute())throw new IOException("ZIP 包含非法路径");copyBounded(zip,target);return;}}throw new IOException("ZIP 中没有 .cube LUT");}
    private static String cleanName(String raw){String name=raw==null?"imported.cube":new File(raw).getName().trim();name=name.replaceAll("[^A-Za-z0-9._-]","_");return name.isEmpty()?"imported.cube":name;}
    private void status(String message){WritableMap m=Arguments.createMap();m.putString("message",message);m.putBoolean("ready",false);emit("cameraStatus",m);}
    private void emit(String name,WritableMap map){if(context.hasActiveCatalystInstance())context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(name,map);}
}
