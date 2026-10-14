package cn.moment.lumix;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.*;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.LifecycleEventListener;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.function.Consumer;

/** Owns a foreground-only camera network lease. Never binds the app's default network. */
final class WifiConnectionManager implements LifecycleEventListener {
    interface Connected {void accept(WifiCameraHttp.Route route);}
    private final Context context;
    private final ConnectivityManager connectivity;
    private final Consumer<String> error;
    private final Handler main=new Handler(Looper.getMainLooper());
    private ConnectivityManager.NetworkCallback callback;
    private Network pending,connected;
    private Connected ready;
    private boolean foreground=true,started;
    private long generation;
    WifiConnectionManager(Context context,Consumer<String> error){this.context=context;this.error=error;connectivity=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);}
    void connect(boolean manual,String ssid,String password,String endpoint,boolean debug,Connected ready) throws IOException {
        if(!foreground)throw new IOException("请返回 App 前台后再连接相机 Wi-Fi");
        URL target=WifiS5Protocol.cameraUrl(endpoint,debug);close();long epoch=generation;this.ready=ready;
        if(debug){started=true;ready.accept(new WifiCameraHttp.Route(){
            volatile boolean stopped;
            public Socket connect(String host,int port)throws IOException {if(stopped)throw new IOException("调试网络已取消");Socket socket=new Socket();try{socket.connect(new InetSocketAddress(host,port),5000);if(stopped)throw new IOException("调试网络已取消");return socket;}catch(IOException e){socket.close();throw e;}}
            public void bind(DatagramSocket socket){}
            public void close(){stopped=true;}
        });return;}
        if(connectivity==null)throw new IOException("Android 网络服务不可用");
        if(!manual && context.checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)!=PackageManager.PERMISSION_GRANTED)throw new IOException("附近 Wi-Fi 设备权限未授权；也可在系统设置手动连接相机 Wi-Fi");
        callback=new ConnectivityManager.NetworkCallback(){
            @Override public void onAvailable(Network network){main.post(()->{if(epoch!=generation || started)return;pending=network;deliver(epoch);});}
            @Override public void onUnavailable(){main.post(()->{if(epoch==generation){close();error.accept("相机 Wi-Fi 连接被取消或不可用；请检查 SSID / 密码，或手动连接");}});}
            @Override public void onLost(Network network){main.post(()->{if(epoch==generation && (network.equals(connected)||network.equals(pending))){close();error.accept("相机 Wi-Fi 网络已丢失 · 请重新连接");}});}
        };
        NetworkRequest.Builder request=new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        try {
            if(manual){
                InetAddress address=InetAddress.getByName(target.getHost());List<Network> matches=new ArrayList<>();
                for(Network network:connectivity.getAllNetworks()) {
                    NetworkCapabilities cap=connectivity.getNetworkCapabilities(network);LinkProperties links=connectivity.getLinkProperties(network);
                    if(cap==null || !cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || links==null)continue;
                    if(links.getRoutes().stream().anyMatch(route->route.matches(address)))matches.add(network);
                }
                if(matches.isEmpty())throw new IOException("尚未连接可到达相机 IP 的 Wi-Fi；请先在系统设置加入相机网络");
                if(matches.size()>1)throw new IOException("有多个 Wi-Fi 网络可到达相机 IP，请关闭多余相机连接后重试");
                connected=matches.get(0);pending=connected;connectivity.registerNetworkCallback(request.build(),callback);deliver(epoch);
            }else{
                if(ssid==null || ssid.trim().isEmpty())throw new IOException("请输入相机 Wi-Fi SSID");
                WifiNetworkSpecifier.Builder specifier=new WifiNetworkSpecifier.Builder().setSsid(ssid);
                if(password!=null && !password.isEmpty())specifier.setWpa2Passphrase(password);
                connectivity.requestNetwork(request.setNetworkSpecifier(specifier.build()).build(),callback,30_000);
            }
        }catch(RuntimeException|IOException e){close();if(e instanceof IOException)throw (IOException)e;throw new IOException("无法请求相机 Wi-Fi：请检查 SSID、密码和附近设备权限",e);}
    }
    private void deliver(long epoch){
        if(epoch!=generation || !foreground || pending==null || started)return;
        Network network=pending;pending=null;connected=network;started=true;
        ready.accept(new WifiCameraHttp.Route(){
            private volatile boolean stopped;
            public Socket connect(String host,int port) throws IOException {
                if(stopped)throw new IOException("相机网络已取消");
                Socket socket=network.getSocketFactory().createSocket();
                try{socket.connect(new InetSocketAddress(host,port),5000);if(stopped)throw new IOException("相机网络已取消");return socket;}
                catch(IOException e){socket.close();throw e;}
            }
            public void bind(DatagramSocket socket) throws IOException {if(stopped)throw new IOException("相机网络已取消");network.bindSocket(socket);}
            public void close(){stopped=true;main.post(()->{if(epoch==generation)WifiConnectionManager.this.close();});}
        });
    }
    void close(){generation++;pending=null;connected=null;ready=null;started=false;ConnectivityManager.NetworkCallback previous=callback;callback=null;if(previous!=null && connectivity!=null)try{connectivity.unregisterNetworkCallback(previous);}catch(IllegalArgumentException ignored){}}
    public void onHostResume(){foreground=true;deliver(generation);}
    public void onHostPause(){foreground=false;if(started)close();/* An OS consent dialog can finish before resume; no camera I/O starts while paused. */}
    public void onHostDestroy(){foreground=false;close();}
}
