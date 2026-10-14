package cn.moment.lumix;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.xml.parsers.*;
import org.w3c.dom.*;
import org.xml.sax.*;

/** Independently authored protocol parsing. These structures are NOT S5 hardware verification. */
final class WifiS5Protocol {
    static final String CDS="urn:schemas-upnp-org:service:ContentDirectory:1";
    static final int MAX_XML=2*1024*1024,MAX_JPEG=64*1024*1024;
    record Reply(String result,Map<String,List<String>> values,List<String> fields) {
        void requireOk() throws IOException {if(!"ok".equalsIgnoreCase(result))throw new IOException("相机拒绝 Wi-Fi 指令："+safe(result));}
        String first(String key){List<String> value=values.get(key);return value==null||value.isEmpty()?null:value.get(0);}
        boolean gen2(){return values.containsKey("challenge") || fields.stream().anyMatch(v->v.contains("req_acc_g")||v.contains("req_acc_e")) || result.contains("gen2");}
    }
    static String safe(String value){return value==null?"无应答":value.replaceAll("[^a-zA-Z0-9_ -]","").substring(0,Math.min(value.replaceAll("[^a-zA-Z0-9_ -]","").length(),80));}
    static Document xml(byte[] bytes) throws IOException {
        if(bytes.length>MAX_XML)throw new IOException("相机 XML 超过上限");
        String text=new String(bytes,StandardCharsets.UTF_8);
        if(text.indexOf('\0')>=0 || text.toUpperCase(Locale.ROOT).contains("<!DOCTYPE") || text.toUpperCase(Locale.ROOT).contains("<!ENTITY"))throw new IOException("拒绝相机 XML 外部实体或 DTD");
        try {
            DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();factory.setNamespaceAware(true);factory.setExpandEntityReferences(false);
            for(String feature:List.of("http://xml.org/sax/features/external-general-entities","http://xml.org/sax/features/external-parameter-entities","http://apache.org/xml/features/nonvalidating/load-external-dtd"))try{factory.setFeature(feature,false);}catch(ParserConfigurationException ignored){/* Android parser still uses the strict precheck and rejecting resolver. */}
            DocumentBuilder parser=factory.newDocumentBuilder();parser.setEntityResolver((a,b)->{throw new SAXException("External entity refused");});
            parser.setErrorHandler(new ErrorHandler(){public void warning(SAXParseException e){}public void error(SAXParseException e)throws SAXException{throw e;}public void fatalError(SAXParseException e)throws SAXException{throw e;}});
            return parser.parse(new ByteArrayInputStream(bytes));
        }catch(ParserConfigurationException|SAXException e){throw new IOException("相机 XML 无法解析",e);}
    }
    static String name(Node node){return node.getLocalName()==null?node.getNodeName():node.getLocalName();}
    static List<Element> elements(Node root,String local){List<Element> out=new ArrayList<>();collect(root,local,out);return out;}
    private static void collect(Node root,String local,List<Element> out){if(root instanceof Element && name(root).equals(local))out.add((Element)root);for(Node c=root.getFirstChild();c!=null;c=c.getNextSibling())collect(c,local,out);}
    static String text(Node root,String local){List<Element> all=elements(root,local);return all.isEmpty()?null:all.get(0).getTextContent().trim();}
    static Reply reply(byte[] bytes) throws IOException {
        String raw=new String(bytes,StandardCharsets.UTF_8).trim();if(raw.startsWith("\ufeff"))raw=raw.substring(1).trim();
        if(raw.startsWith("<")) {
            Document doc=xml(bytes);String result=text(doc,"result");if(result==null)throw new IOException("相机应答缺少 result");
            Map<String,List<String>> values=new LinkedHashMap<>();leafValues(doc,values);
            return new Reply(result,values,List.of());
        }
        List<String> fields=csv(raw);if(fields.isEmpty() || fields.get(0).isEmpty())throw new IOException("相机 CSV 应答为空");
        return new Reply(fields.get(0),Map.of(),List.copyOf(fields.subList(1,fields.size())));
    }
    private static void leafValues(Node root,Map<String,List<String>> values){
        if(root instanceof Element){boolean children=false;for(Node c=root.getFirstChild();c!=null;c=c.getNextSibling())if(c instanceof Element)children=true;
            if(!children){values.computeIfAbsent(name(root),k->new ArrayList<>()).add(root.getTextContent().trim());NamedNodeMap attrs=root.getAttributes();for(int i=0;i<attrs.getLength();i++){Node a=attrs.item(i);values.computeIfAbsent(name(a),k->new ArrayList<>()).add(a.getNodeValue());}}}
        for(Node c=root.getFirstChild();c!=null;c=c.getNextSibling())leafValues(c,values);
    }
    static List<String> csv(String raw) throws IOException {
        List<String> fields=new ArrayList<>();StringBuilder current=new StringBuilder();boolean quoted=false,ended=false;
        for(int i=0;i<raw.length();i++){char c=raw.charAt(i);
            if(quoted){if(c=='"'){if(i+1<raw.length() && raw.charAt(i+1)=='"'){current.append('"');i++;}else{quoted=false;ended=true;}}else current.append(c);}
            else if(c==','){fields.add(current.toString().trim());current.setLength(0);ended=false;}
            else if(c=='"' && current.length()==0 && !ended)quoted=true;
            else if(ended && !Character.isWhitespace(c))throw new IOException("相机 CSV 引号无效");else current.append(c);
        }
        if(quoted)throw new IOException("相机 CSV 被截断");fields.add(current.toString().trim());return fields;
    }
    record Gen2Envelope(String phase,Reply reply,String sessionHeader,String reason) {}
    /** Parsing only; no challenge calculation, constants, or req_acc_e dispatch exists. */
    static Gen2Envelope gen2(String phase,byte[] data,String sessionHeader) throws IOException {
        if(!phase.equals("req_acc_g") && !phase.equals("req_acc_e"))throw new IOException("未知认证阶段");
        return new Gen2Envelope(phase,reply(data),sessionHeader,"需要真机抓包确认");
    }
    static URL cameraUrl(String endpoint,boolean debug) throws IOException {
        try {
            URL url=new URL("http://"+endpoint);
            if(!url.getProtocol().equals("http") || url.getUserInfo()!=null || !url.getPath().isEmpty() || url.getQuery()!=null || url.getRef()!=null || url.getHost().isEmpty())throw new IOException("请输入相机 IPv4 地址");
            int port=url.getPort()<0?80:url.getPort();if(port<1||port>65535)throw new IOException("相机端口无效");
            if(!debug){String[] parts=url.getHost().split("\\.",-1);if(parts.length!=4 || url.getPort()!=-1)throw new IOException("请输入相机 IPv4 地址（不含端口）");
                int[] ip=new int[4];for(int i=0;i<4;i++){if(!parts[i].matches("[0-9]{1,3}"))throw new IOException("相机 IPv4 地址无效");ip[i]=Integer.parseInt(parts[i]);if(ip[i]>255)throw new IOException("相机 IPv4 地址无效");}
                if(!(ip[0]==10 || ip[0]==172 && ip[1]>=16 && ip[1]<=31 || ip[0]==192 && ip[1]==168))throw new IOException("Wi-Fi 实验仅接受相机私有局域网 IPv4 地址");}
            return url;
        }catch(MalformedURLException|NumberFormatException e){throw new IOException("相机地址无效",e);}
    }
    static URL resource(URL base,String value) throws IOException {
        URL url=new URL(base,value);
        String path=url.getPath();try{for(int i=0;i<3;i++)path=URLDecoder.decode(path,StandardCharsets.UTF_8);}catch(IllegalArgumentException e){throw new IOException("无效资源 URL",e);}
        if(!url.getProtocol().equals("http") || !url.getHost().equalsIgnoreCase(base.getHost()) || url.getUserInfo()!=null || url.getRef()!=null || url.getPort()==0 || url.getPort()>65535 || path.toLowerCase(Locale.ROOT).contains("cam.cgi") || path.matches("(?s).*[\r\n\\\\].*") || url.toString().matches("(?s).*[\r\n ].*"))throw new IOException("拒绝非相机或控制指令资源 URL");
        return url;
    }
    record Description(String model,URL control) {}
    static Description description(byte[] data,URL location) throws IOException {
        Document doc=xml(data);String model=text(doc,"modelName");
        for(Element service:elements(doc,"service"))if(CDS.equals(text(service,"serviceType"))){String control=text(service,"controlURL");if(control!=null && !control.isEmpty())return new Description(model,resource(location,control));}
        throw new IOException("相机未公布 DLNA ContentDirectory 控制地址");
    }
    record Item(String id,String parent,String title,List<Media> originals,boolean container) {String identity(){return parent+"\u001f"+id;}}
    record Media(String itemKey,URL url,String filename,long size) {String key(){return itemKey+"\u001f"+url+"\u001f"+filename+"\u001f"+size;}}
    record Page(List<Item> items,int returned,int total,String update) {}
    static int integer(Node root,String key) throws IOException {try{int n=Integer.parseInt(text(root,key));if(n<0 || n>10000)throw new NumberFormatException();return n;}catch(NumberFormatException e){throw new IOException("相机目录 "+key+" 无效",e);}}
    static Page browse(byte[] data,URL control) throws IOException {
        Document soap=xml(data);if(!elements(soap,"Fault").isEmpty())throw new IOException("相机 DLNA 目录请求失败");
        String inner=text(soap,"Result");if(inner==null)throw new IOException("相机目录缺少 DIDL Result");Document didl=xml(inner.getBytes(StandardCharsets.UTF_8));
        if(!name(didl.getDocumentElement()).equals("DIDL-Lite"))throw new IOException("相机目录不是 DIDL-Lite");
        List<Item> items=new ArrayList<>();
        for(Node node=didl.getDocumentElement().getFirstChild();node!=null;node=node.getNextSibling()) {
            if(!(node instanceof Element))continue;Element item=(Element)node;boolean container=name(item).equals("container");if(!container && !name(item).equals("item"))continue;
            String id=item.getAttribute("id"),parent=item.getAttribute("parentID"),title=text(item,"title");if(id.isEmpty())throw new IOException("相机目录对象没有 ID");
            String key=parent+"\u001f"+id;List<Media> originals=new ArrayList<>();
            if(!container)for(Element res:elements(item,"res")) {
                String info=res.getAttribute("protocolInfo");if(!info.matches("(?is).*PANASONIC\\.COM_PN=(CAM_ORG|CAM_RAW_JPG)(?:[;: ]|$).*"))continue;
                URL url=resource(control,res.getTextContent().trim());String filename=title;
                java.util.regex.Matcher matcher=java.util.regex.Pattern.compile("(?i)OriginalFileName=['\"]?([^;'\"]+)").matcher(info);if(matcher.find())filename=matcher.group(1);
                if(filename==null || !filename.toLowerCase(Locale.ROOT).matches(".*\\.jpe?g") || !url.getPath().toLowerCase(Locale.ROOT).matches(".*\\.jpe?g"))continue;
                long size=0;String declared=res.getAttribute("size");if(!declared.isEmpty())try{size=Long.parseLong(declared);if(size<0||size>MAX_JPEG)throw new NumberFormatException();}catch(NumberFormatException e){throw new IOException("原 JPEG 大小无效或超过 64 MB",e);}
                originals.add(new Media(key,url,new File(filename).getName(),size));
            }
            items.add(new Item(id,parent,title,List.copyOf(originals),container));
        }
        int returned=integer(soap,"NumberReturned"),total=integer(soap,"TotalMatches");
        if(returned!=items.size() || returned>total)throw new IOException("相机目录分页数量不一致");
        return new Page(List.copyOf(items),returned,total,text(soap,"UpdateID"));
    }
    static Media uniqueNew(Map<String,Item> baseline,Map<String,Item> current) throws IOException {
        Map<String,Media> choices=new LinkedHashMap<>();
        for(Item item:current.values())if(!baseline.containsKey(item.identity()))for(Media media:item.originals)choices.putIfAbsent(media.itemKey+"\u001f"+media.url,media);
        if(choices.size()>1)throw new IOException("出现多个新原 JPEG，无法确认本次照片；未使用旧图，请检查机身 SD 卡");
        return choices.isEmpty()?null:choices.values().iterator().next();
    }
    static byte[] soap(String object,int start) {
        String safeObject=object.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");
        return ("<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body><u:Browse xmlns:u=\""+CDS+"\" xmlns:pana=\"urn:schemas-panasonic-com:pana\"><ObjectID>"+safeObject+"</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>"+start+"</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria/><pana:X_FromCP>LumixLink2.0</pana:X_FromCP></u:Browse></s:Body></s:Envelope>").getBytes(StandardCharsets.UTF_8);
    }
    /** Strict marker/segment/scan envelope check, including SOF, SOS and an exact EOI. */
    static int[] jpeg(InputStream raw,int limit) throws IOException {
        Counting in=new Counting(raw,limit);if(in.read()!=255 || in.read()!=216)throw new IOException("JPEG 缺少 SOI");boolean scan=false,sawScan=false;int width=0,height=0;
        while(true) {
            int marker;
            if(scan){int b;do{b=in.read();if(b<0)throw new IOException("JPEG 扫描被截断");}while(b!=255);do{marker=in.read();}while(marker==255);if(marker==0 || marker>=0xd0 && marker<=0xd7)continue;scan=false;}
            else {if(in.read()!=255)throw new IOException("JPEG 标记边界无效");do{marker=in.read();}while(marker==255);}
            if(marker==0xd9){if(!sawScan || width==0 || height==0 || in.read()!=-1)throw new IOException("JPEG 缺少 SOF/SOS 或 EOI 后有多余数据");return new int[]{width,height};}
            if(marker<0 || marker==0 || marker==0xd8 || marker>=0xd0 && marker<=0xd7)throw new IOException("JPEG 标记无效");if(marker==1)continue;
            int a=in.read(),b=in.read();if(a<0||b<0)throw new IOException("JPEG 段被截断");int length=(a<<8|b)-2;if(length<0)throw new IOException("JPEG 段长度无效");
            boolean sof=Set.of(0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf).contains(marker);
            if(sof){if(length<6)throw new IOException("JPEG SOF 无效");int depth=in.read();height=in.read()<<8|in.read();width=in.read()<<8|in.read();int components=in.read();length-=6;
                if(depth<=0 || width<=0 || height<=0 || width>20000 || height>20000 || (long)width*height>48_000_000 || components<1 || length!=3*components)throw new IOException("JPEG 尺寸或 SOF 无效");}
            if(marker==0xda && length<4)throw new IOException("JPEG SOS 无效");
            while(length-->0)if(in.read()<0)throw new IOException("JPEG 段不完整");
            if(marker==0xda){scan=true;sawScan=true;}
        }
    }
    private static final class Counting extends FilterInputStream {
        final int limit;int count;Counting(InputStream in,int limit){super(in);this.limit=limit;}
        public int read() throws IOException {int b=super.read();if(b>=0 && ++count>limit)throw new IOException("JPEG 超过接收上限");return b;}
    }
    static byte[] datagram(byte[] packet,int length) {
        int start=-1;for(int i=0;i<Math.min(length-1,1024);i++)if((packet[i]&255)==255 && (packet[i+1]&255)==216){start=i;break;}
        if(start<0)return null;byte[] jpeg=Arrays.copyOfRange(packet,start,length);
        try{int[] size=jpeg(new ByteArrayInputStream(jpeg),2*1024*1024);if((long)size[0]*size[1]>3_000_000)return null;return jpeg;}catch(IOException e){return null;}
    }
}
