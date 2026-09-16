package cn.moment.s5;

import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.xml.parsers.DocumentBuilderFactory;

/** Run with tools/check-core.ps1; no device or third-party test framework. */
public final class CoreChecks {
    private static int checks;
    private static void check(boolean value,String message) {checks++;if(!value)throw new AssertionError(message);}
    public static void main(String[] args) throws Exception {
        Ptp.requireSuccess(0x1002,0x2001);checks++;
        Ptp.requireSuccess(0x1002,0x201e);checks++; // Regression: reconnect must reach Panasonic session setup.
        Ptp.requireSuccess(0x9404,0x2001);checks++;
        for(int op:new int[]{0x9404,0x9102,0x9412}) {
            try {Ptp.requireSuccess(op,0x201e);throw new AssertionError("201E accepted outside standard OpenSession");}
            catch(IOException expected) {
                check(expected.getMessage().contains(String.format("0x%04X",op)) && expected.getMessage().contains("0x201E"),"error identifies failed operation");
            }
        }
        try {Ptp.requireSuccess(0x1002,0x2019);throw new AssertionError("busy session accepted");}
        catch(IOException expected) {check(expected.getMessage().contains("机身忙"),"other session errors are preserved");}
        byte[] command=Ptp.command(0x9404,17,0x03000011);
        check(Arrays.equals(command,new byte[]{16,0,0,0,1,0,4,(byte)0x94,17,0,0,0,17,0,0,3}),"capture packet");
        try {new Ptp.Reader(new byte[]{(byte)255,(byte)255,(byte)255,127}).array(4);throw new AssertionError("array accepted");} catch(IOException expected){checks++;}
        try {new Ptp.Reader(new byte[]{4,65,0}).string();throw new AssertionError("truncated string accepted");} catch(IOException expected){checks++;}
        byte[] live=new byte[190];Ptp.le(live).putInt(0,0x17000001).putInt(4,8).putInt(12,180);live[180]=(byte)255;live[181]=(byte)216;live[182]=(byte)255;
        check(Ptp.liveJpeg(live).length==10,"header JPEG offset");
        Ptp.le(live).putInt(12,Integer.MAX_VALUE);check(Ptp.liveJpeg(live).length==10,"bounded offset fallback");
        byte[] oi=new byte[70];Ptp.le(oi).putShort(4,(short)0x3801).putInt(8,123456).putInt(26,6000).putInt(30,4000);oi[52]=8;
        byte[] filename="P01.JPG".getBytes(StandardCharsets.UTF_16LE);System.arraycopy(filename,0,oi,53,filename.length);
        Ptp.ObjectInfo object=new Ptp.ObjectInfo(oi);check(object.jpeg() && object.width==6000 && object.height==4000 && object.size==123456,"object info layout");
        FrameRing ring=new FrameRing(1_500_000,10);
        ring.add(0,new byte[3]);ring.add(500_000,new byte[3]);ring.add(1_000_000,new byte[3]);ring.add(1_500_000,new byte[3]);
        check(ring.slice(0,2_000_000).size()==3,"byte bound evicts");
        ring.add(4_000_000,new byte[3]);check(ring.slice(0,5_000_000).size()==1,"time bound evicts");
        ring.add(3_000_000,new byte[3]);check(ring.lastUs()==4_000_000,"reject backward clock");
        ring.add(5_000_000,new byte[11]);check(ring.lastUs()==4_000_000,"reject giant frame");
        ring.clear();check(ring.durationUs()==0,"clear");
        FrameRing captureRing=new FrameRing(4_500_000,1024);
        for(long t=0;t<=1_500_000;t+=100_000)captureRing.add(t,new byte[1]);
        check(captureRing.preCaptureWindow(1_500_000).isEmpty(),"old 1.5-second buffer no longer enables capture");
        for(long t=1_600_000;t<=3_000_000;t+=100_000)captureRing.add(t,new byte[1]);
        check(!captureRing.preCaptureWindow(3_050_000).isEmpty(),"boundary frame keeps three-second prebuffer ready between preview samples");
        check(captureRing.preCaptureWindow(6_000_000).isEmpty(),"slow file-index read invalidates stale prebuffer");
        captureRing.add(6_000_000,new byte[1]);
        check(captureRing.preCaptureWindow(6_000_000).isEmpty(),"one fresh frame plus old history is not ready");
        captureRing.add(6_100_000,new byte[1]);
        check(captureRing.preCaptureWindow(6_100_000).isEmpty(),"old boundary plus new frames with a preparation gap is not ready");
        for(long t=6_200_000;t<=9_000_000;t+=100_000)captureRing.add(t,new byte[1]);
        List<FrameRing.Frame> renewed=captureRing.preCaptureWindow(9_000_000);
        check(renewed.size()==31 && renewed.get(0).us==6_000_000,"resume preview restores three-second pre-roll");
        captureRing.add(9_100_000,new byte[1]);
        check(captureRing.preCaptureWindow(9_000_000).stream().allMatch(f->f.us<=9_000_000) && renewed.size()==31,"capture snapshot excludes later frames");
        check(captureRing.preCaptureWindow(9_600_000).isEmpty(),"preview that stopped updating is not ready");
        captureRing.clear();check(captureRing.preCaptureWindow(9_600_000).isEmpty(),"empty buffer is not ready");
        List<FrameRing.Frame> fs=List.of(new FrameRing.Frame(0,new byte[1]),new FrameRing.Frame(70_000,new byte[1]),new FrameRing.Frame(600_000,new byte[1]));
        check(FrameRing.maxGap(fs)==530_000,"measure blackout, not synthetic FPS");
        Path tmp=Files.createTempDirectory("moment-core-");
        try {
            File jpg=tmp.resolve("still.jpg").toFile(),mp4=tmp.resolve("clip.mp4").toFile(),out=tmp.resolve("M_MP.jpg").toFile();
            byte[] image={(byte)255,(byte)216,(byte)255,(byte)225,0,8,69,120,105,102,0,0,(byte)255,(byte)217};
            byte[] video={0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0};
            Files.write(jpg.toPath(),image);Files.write(mp4.toPath(),video);MotionPhoto.write(jpg,mp4,out,1_500_000);
            byte[] result=Files.readAllBytes(out.toPath());
            check(Arrays.equals(video,Arrays.copyOfRange(result,result.length-video.length,result.length)),"video suffix exact");
            check(Arrays.equals(image,Files.readAllBytes(jpg.toPath())),"original preserved");
            int len=((result[4]&255)<<8)|(result[5]&255);
            byte[] recovered=new byte[result.length-(len+2)-video.length];recovered[0]=(byte)255;recovered[1]=(byte)216;
            System.arraycopy(result,4+len,recovered,2,recovered.length-2);check(Arrays.equals(recovered,image),"EXIF and JPEG preserved");
            String xmp=new String(result,6,len-2,StandardCharsets.UTF_8);String xml=xmp.substring(xmp.indexOf('<'));
            var parser=DocumentBuilderFactory.newInstance();parser.setNamespaceAware(true);
            var doc=parser.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            var items=doc.getElementsByTagNameNS("http://ns.google.com/photos/1.0/container/","Item");check(items.getLength()==2,"two media items");
            var videoItem=(org.w3c.dom.Element)items.item(1);
            check(videoItem.getAttributeNS("http://ns.google.com/photos/1.0/container/item/","Length").equals("16"),"MP4 offset metadata");
            check(xmp.contains("MotionPhotoPresentationTimestampUs=\"1500000\""),"keyframe timestamp");
            try {MotionPhoto.write(jpg,mp4,jpg,0);throw new AssertionError("overwrite accepted");} catch(IOException expected){checks++;}
        } finally {try(var walk=Files.walk(tmp)){for(Path p:walk.sorted(Comparator.reverseOrder()).toList())Files.delete(p);}}
        System.out.println("PASS "+checks+" core checks");
    }
}
