package com.yuzhounh.lightmail;

import android.content.Context;
import android.net.Uri;
import com.sun.mail.imap.IMAPFolder;
import com.sun.mail.imap.IMAPMessage;
import com.sun.mail.imap.IMAPStore;
import org.json.JSONArray;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import javax.mail.*;
import javax.mail.internet.*;
import javax.activation.DataHandler;
import javax.activation.FileDataSource;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

final class MailClient {
    static final ExecutorService IO=Executors.newFixedThreadPool(2);
    /** User-initiated work (opening mail, actions) never waits behind background syncs. */
    static final ExecutorService USER=Executors.newFixedThreadPool(2);
    static final String CHANGED="com.yuzhounh.lightmail.CHANGED";
    /** Background sync never downloads bodies larger than this; they load when opened. */
    static final int PREFETCH_LIMIT=2*1024*1024;
    private static MailClient instance;
    // Test-only trust anchor injection: release builds always use platform trust.
    static volatile javax.net.ssl.SSLSocketFactory localTestSockets;
    final Context context;
    final AccountStore accounts;
    final MailCache cache;
    private final Set<String> syncing=ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String,Long> lastSuccessfulSync=new ConcurrentHashMap<>();
    /** Cached mail older than the sync window is checked against the server at most this often per folder. */
    private static final long FULL_RECONCILE_INTERVAL=6*60*60*1000L;
    private final ConcurrentHashMap<String,Long> lastFullReconcile=new ConcurrentHashMap<>();
    static synchronized MailClient get(Context c){if(instance==null)instance=new MailClient(c.getApplicationContext());return instance;}
    MailClient(Context c){context=c;accounts=new AccountStore(c,id->IO.execute(()->accountChanged(id)));cache=new MailCache(c);}
    void changed(){context.sendBroadcast(new android.content.Intent(CHANGED).setPackage(context.getPackageName()));}
    static String error(Throwable e){
        for(Throwable cause=e;cause!=null;cause=cause.getCause()){
            if(cause instanceof SendAuthenticationException)return "发信验证未通过，请检查 SMTP 服务与授权码";
            if(cause instanceof AuthenticationFailedException)return "验证未通过，请检查授权码和 IMAP 服务";
            if(cause instanceof java.net.SocketTimeoutException)return "连接超时，请检查网络与分流设置";
            if(cause instanceof java.net.UnknownHostException)return "无法解析服务器地址，请检查网络";
            if(cause instanceof javax.net.ssl.SSLException)return "安全连接失败，请检查服务器设置";
        }
        String message=Objects.toString(e.getMessage(),"");String lower=message.toLowerCase(Locale.ROOT);
        if(lower.contains("base64")||lower.contains("encoded stream"))return "部分邮件内容编码异常，原文已保留";
        if(lower.contains("idle not supported"))return "服务器使用定时收信";
        if(lower.contains("timeout")||lower.contains("couldn't connect")||lower.contains("connection"))return "连接暂时中断，稍后自动重试";
        if(message.matches("[\\p{IsHan}\\s\\p{Punct}0-9A-Za-z /·，。；：（）…]{1,90}")&&message.matches(".*\\p{IsHan}.*"))return message;
        return "操作暂未完成，请稍后重试";
    }
    static String accountStatus(AccountStore store,String id){String status=store.prefs().getString("status."+id,"等待同步");if(status.equals("已同步")){if(store.prefs().getString("smtpStatus."+id,"").equals("auth"))return "收信正常 · 发信验证未通过";return status+(store.prefs().getString("mode."+id,"").equals("poll")?" · 每分钟检查":"");}if(status.startsWith("BASE64Decoder"))return "部分旧邮件编码异常，正在重试";if(status.equals("IDLE not supported"))return "服务器使用定时收信";if(status.contains("Couldn't connect"))return "连接暂不可用，请检查网络与分流设置";return status.length()>60?"同步暂未完成，请稍后重试":status;}
    static final class SendAuthenticationException extends AuthenticationFailedException {SendAuthenticationException(String reply){super(reply);}}
    private Session session(JSONObject a) throws Exception {
        Properties p=new Properties();
        for(String type:new String[]{"imap","smtp"}){
            JSONObject server=a.getJSONObject(type);p.setProperty("mail."+type+".ssl.enable",String.valueOf(server.optBoolean("secure",true)));
            p.setProperty("mail."+type+".ssl.checkserveridentity","true");
            if(BuildConfig.DEBUG&&"localhost".equals(server.optString("host"))&&localTestSockets!=null){p.put("mail."+type+".ssl.socketFactory",localTestSockets);p.setProperty("mail."+type+".socketFactory.fallback","false");}
            p.setProperty("mail."+type+".connectiontimeout","15000");p.setProperty("mail."+type+".timeout","30000");p.setProperty("mail."+type+".writetimeout","30000");
            if(!server.optBoolean("secure",true)){p.setProperty("mail."+type+".starttls.enable","true");p.setProperty("mail."+type+".starttls.required","true");}
        }
        p.setProperty("mail.imap.peek","true");p.setProperty("mail.imap.partialfetch","true");p.setProperty("mail.smtp.auth","true");p.setProperty("mail.mime.address.strict","true");
        return Session.getInstance(p);
    }
    IMAPStore connect(JSONObject a) throws Exception {
        String pass=accounts.password(a);if(pass.isEmpty())throw new Exception("请先填写此邮箱的授权码");
        JSONObject server=a.getJSONObject("imap");IMAPStore store=(IMAPStore)session(a).getStore("imap");
        store.connect(server.getString("host"),server.getInt("port"),a.optString("user",a.getString("email")),pass);
        try{store.id(Map.of("name","Light Mail","version",BuildConfig.VERSION_NAME));}catch(MessagingException ignored){}
        return store;
    }
    /** Reuse JavaMail's per-account Store/connection pool; IDLE retains its dedicated connection. */
    private static final class Shared {final IMAPStore store;final String fingerprint;int users;boolean retired,closed;Shared(IMAPStore s,String f){store=s;fingerprint=f;}}
    private final ConcurrentHashMap<String,Shared> shared=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String,Object> sharedLocks=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<IMAPStore,Shared> borrowed=new ConcurrentHashMap<>();
    private static String connectionSettings(JSONObject a) throws Exception {
        JSONObject server=a.getJSONObject("imap");
        return new JSONArray().put(server.optString("host")).put(server.optInt("port")).put(server.optBoolean("secure",true))
            .put(a.optString("user",a.getString("email"))).put(a.optString("secret")).toString();
    }
    private static void closeStore(IMAPStore store){try{store.close();}catch(MessagingException ignored){}}
    private void retire(Shared current){
        if(current==null)return;boolean close;
        synchronized(current){current.retired=true;close=current.users==0&&!current.closed;if(close)current.closed=true;}
        if(close){borrowed.remove(current.store,current);IO.execute(()->closeStore(current.store));}
    }
    private void accountChanged(String id){
        synchronized(sharedLocks.computeIfAbsent(id,k->new Object())){
            Shared current=shared.get(id);if(current==null)return;
            try{if(current.fingerprint.equals(connectionSettings(accounts.account(id))))return;}catch(Exception ignored){}
            shared.remove(id,current);retire(current);
        }
    }
    IMAPStore shared(JSONObject a) throws Exception {
        String id=a.getString("id");
        synchronized(sharedLocks.computeIfAbsent(id,k->new Object())){
            // Read current configuration, never a queued task's stale account snapshot.
            JSONObject account=accounts.account(id);String fingerprint=connectionSettings(account);
            Shared current=shared.get(id);
            if(current==null||!current.fingerprint.equals(fingerprint)||!current.store.isConnected()){
                if(current!=null){shared.remove(id,current);retire(current);}
                IMAPStore store=connect(account);
                try{if(!fingerprint.equals(connectionSettings(accounts.account(id))))throw new Exception("邮箱配置已更新，请重试");}
                catch(Exception changed){closeStore(store);throw changed;}
                current=new Shared(store,fingerprint);shared.put(id,current);borrowed.put(store,current);
            }
            synchronized(current){current.users++;}return current.store;
        }
    }
    /** Retired pools close after the last in-flight operation, without interrupting its folder. */
    void release(IMAPStore store){
        Shared current=borrowed.get(store);if(current==null){closeStore(store);return;}boolean close;
        synchronized(current){if(current.users>0)current.users--;close=current.retired&&current.users==0&&!current.closed;if(close)current.closed=true;}
        if(close){borrowed.remove(store,current);closeStore(store);}
    }
    void test(JSONObject a) throws Exception {
        IMAPStore store=connect(a);store.close();testSmtp(a);
    }
    void testSmtp(JSONObject a) throws Exception {
        JSONObject s=a.getJSONObject("smtp");Transport transport=session(a).getTransport("smtp");
        try{transport.connect(s.getString("host"),s.getInt("port"),a.optString("user",a.getString("email")),accounts.password(a));accounts.prefs().edit().remove("smtpStatus."+a.getString("id")).apply();}
        catch(AuthenticationFailedException denied){accounts.prefs().edit().putString("smtpStatus."+a.getString("id"),"auth").apply();throw new SendAuthenticationException(denied.getMessage());}
        finally{try{if(transport.isConnected())transport.close();}catch(MessagingException ignored){}}
    }
    JSONArray folders(JSONObject a) throws Exception {
        IMAPStore store=shared(a);
        try{
            JSONArray out=new JSONArray();for(Folder folder:store.getDefaultFolder().list("*")){
                if((folder.getType()&Folder.HOLDS_MESSAGES)==0)continue;
                String special=folder.getFullName().equalsIgnoreCase("INBOX")?"\\Inbox":"";
                if(folder instanceof IMAPFolder)for(String attr:((IMAPFolder)folder).getAttributes())if(Set.of("\\Sent","\\Drafts","\\Trash","\\Junk","\\All","\\Archive").contains(attr))special=attr;
                String label=switch(special){case "\\Inbox"->"收件箱";case "\\Sent"->"已发送";case "\\Drafts"->"草稿";case "\\Trash"->"废纸篓";case "\\Junk"->"垃圾邮件";case "\\All"->"所有邮件";case "\\Archive"->"归档";default->folder.getName();};
                int count=0;try{count=folder.getUnreadMessageCount();}catch(MessagingException ignored){}
                out.put(new JSONObject().put("path",folder.getFullName()).put("label",label).put("special",special).put("unread",Math.max(0,count)));
            }
            cache.saveFolders(a.getString("id"),out);return out;
        }finally{release(store);}
    }
    /** 部分发件人名经 RFC 2047 解码后仍带一层引号（如 "Qoder"），显示时去掉。 */
    static String clean(String name){String s=name==null?"":name.trim();while(s.length()>=2&&((s.startsWith("\"")&&s.endsWith("\""))||(s.startsWith("'")&&s.endsWith("'"))))s=s.substring(1,s.length()-1).trim();return s;}
    static String display(Address[] addresses){if(addresses==null||addresses.length==0)return "";Address a=addresses[0];if(!(a instanceof InternetAddress))return a.toString();InternetAddress ia=(InternetAddress)a;String name=clean(ia.getPersonal());return name.isEmpty()?ia.getAddress():name;}
    static String addresses(Address[] values){if(values==null)return "";List<String> out=new ArrayList<>();for(Address a:values)out.add(a instanceof InternetAddress?((InternetAddress)a).getAddress():a.toString());return String.join(", ",out);}
    private JSONObject summary(JSONObject account,String folder,String validity,Message m,long uid) throws Exception {
        return new JSONObject().put("acc",account.getString("id")).put("folder",folder).put("validity",validity).put("uid",uid)
            .put("subject",m.getSubject()==null?"（无主题）":m.getSubject()).put("from",display(m.getFrom())).put("fromAddress",addresses(m.getFrom()))
            .put("to",addresses(m.getRecipients(Message.RecipientType.TO))).put("date",m.getSentDate()==null?0:m.getSentDate().getTime())
            .put("seen",m.isSet(Flags.Flag.SEEN)).put("starred",m.isSet(Flags.Flag.FLAGGED)).put("preview","");
    }
    void sync(String id,String folder,boolean notify) throws Exception {
        sync(id,folder,notify,60);
    }
    void syncInboxIfNeeded(String id) throws Exception {
        Long last=lastSuccessfulSync.get(id+"|INBOX");
        if(SyncService.running&&last!=null&&android.os.SystemClock.elapsedRealtime()-last<60000)return;
        sync(id,"INBOX",true);
    }
    void sync(String id,String folder,boolean notify,int limit) throws Exception {
        String key=id+"|"+folder;if(!syncing.add(key))return;
        try{
            JSONObject account=accounts.account(id);IMAPStore store=shared(account);
            try{
                IMAPFolder box=(IMAPFolder)store.getFolder(folder);box.open(Folder.READ_ONLY);
                try{
                    String validity=String.valueOf(box.getUIDValidity());cache.generation(id,folder,validity);
                    String generationKey="generation."+key,highKey="highest."+key;
                    boolean initial=!accounts.prefs().getString(generationKey,"").equals(validity);
                    long high=initial?0:accounts.prefs().getLong(highKey,0),newHigh=high;
                    int count=box.getMessageCount();if(count==0){cache.reconcile(id,folder,Collections.emptySet());cache.folderUnread(id,folder,0);accounts.prefs().edit().putLong(highKey,0).putString(generationKey,validity).putString("status."+id,"已同步").commit();lastSuccessfulSync.put(key,android.os.SystemClock.elapsedRealtime());changed();return;}
                    // Only verify UIDs we have cached instead of downloading every UID in the folder. The full check
                    // covers mail older than the window and runs at most every few hours; see the window check below.
                    long[] known=cache.uids(id,folder);long now=android.os.SystemClock.elapsedRealtime();Long lastFull=lastFullReconcile.get(key);
                    boolean fullCheck=known.length>0&&(lastFull==null||now-lastFull>=FULL_RECONCILE_INTERVAL);
                    if(fullCheck){Set<Long> present=new HashSet<>();for(Message m:box.getMessagesByUID(known))if(m!=null&&!m.isExpunged())present.add(box.getUID(m));cache.reconcile(id,folder,present);lastFullReconcile.put(key,now);}
                    Message[] messages=box.getMessages(Math.max(1,count-Math.max(1,limit)+1),count);
                    FetchProfile profile=new FetchProfile();profile.add(FetchProfile.Item.ENVELOPE);profile.add(FetchProfile.Item.FLAGS);profile.add(UIDFolder.FetchProfileItem.UID);profile.add(IMAPFolder.FetchProfileItem.SIZE);box.fetch(messages,profile);
                    if(!fullCheck&&known.length>0){
                        // UIDs grow with sequence numbers, so the window holds every message whose UID is at least its oldest
                        // UID: a cached UID in that range missing from the window was removed on the server.
                        Set<Long> present=new HashSet<>();long oldest=Long.MAX_VALUE;
                        for(Message m:messages)if(!m.isExpunged()){long uid=box.getUID(m);present.add(uid);oldest=Math.min(oldest,uid);}
                        for(long uid:known)if(uid<oldest)present.add(uid);cache.reconcile(id,folder,present);
                    }
                    List<JSONObject> notices=new ArrayList<>(),changedItems=new ArrayList<>();
                    for(int i=0;i<messages.length;i++){
                        Message m=messages[i];if(m.isExpunged()||m.isSet(Flags.Flag.DELETED))continue;long uid=box.getUID(m);
                        JSONObject item=summary(account,folder,validity,m,uid);File file=cache.body(item);
                        boolean newMail=!initial&&uid>high;JSONObject previous=cache.get(id,folder,uid);
                        if(previous!=null&&validity.equals(previous.optString("validity"))&&!previous.optString("preview").isEmpty()&&file.exists()){item.put("preview",previous.optString("preview"));if(previous.has("bodyWarning"))item.put("bodyWarning",previous.get("bodyWarning"));}
                        else if(file.exists()||((newMail||i>=messages.length-10)&&m.getSize()<=PREFETCH_LIMIT)){
                            if(!file.exists())downloadSource(m,file);
                            try{Decoded body=decode(file);String preview=body.text.replaceAll("\\s+"," ").trim();item.put("preview",preview.substring(0,Math.min(140,preview.length())));if(!body.warning.isEmpty())item.put("bodyWarning",body.warning);}catch(Exception malformed){item.put("preview","此邮件部分内容暂无法解析，原文已保留").put("bodyWarning",true);}
                        }
                        // Unchanged rows are not rewritten; the rest are stored together after the loop.
                        if(previous==null||!previous.toString().equals(item.toString()))changedItems.add(item);newHigh=Math.max(newHigh,uid);
                        if(notify&&newMail&&!item.getBoolean("seen"))notices.add(item);
                    }
                    cache.putAll(changedItems);
                    try{cache.folderUnread(id,folder,Math.max(0,box.getUnreadMessageCount()));}catch(MessagingException ignored){}
                    accounts.prefs().edit().putLong(highKey,newHigh).putString(generationKey,validity).commit();
                    accounts.prefs().edit().putString("status."+id,"已同步").apply();changed();
                    for(JSONObject item:notices)SyncService.notifyMail(context,account,item);
                    lastSuccessfulSync.put(key,android.os.SystemClock.elapsedRealtime());
                }finally{box.close(false);}
            }finally{release(store);}
        }catch(Exception e){accounts.prefs().edit().putString("status."+id,error(e)).apply();changed();throw e;}
        finally{syncing.remove(key);}
    }
    private void downloadSource(Message m,File file) throws Exception {
        if(m instanceof IMAPMessage)((IMAPMessage)m).setPeek(true);
        File temporary=File.createTempFile(file.getName(),".tmp",file.getParentFile());
        try{try(OutputStream out=new BufferedOutputStream(new FileOutputStream(temporary))){m.writeTo(out);}
            if(!temporary.renameTo(file))throw new IOException("邮件缓存保存失败");
        }finally{if(temporary.exists())temporary.delete();}
    }
    Decoded read(JSONObject item) throws Exception {
        File file=cache.body(item);if(file.exists())return decode(file);
        JSONObject a=accounts.account(item.getString("acc"));IMAPStore store=shared(a);
        try{IMAPFolder folder=(IMAPFolder)store.getFolder(item.getString("folder"));folder.open(Folder.READ_ONLY);
            try{if(!String.valueOf(folder.getUIDValidity()).equals(item.getString("validity")))throw new Exception("文件夹已更新，请刷新列表");Message m=folder.getMessageByUID(item.getLong("uid"));if(m==null)throw new Exception("邮件已移动或删除");downloadSource(m,file);return decode(file);}finally{folder.close(false);}
        }finally{release(store);}
    }
    static final class Attachment {String name,type,key;int size;Attachment(String n,String t,String k,int s){name=n;type=t;key=k;size=s;}}
    static final class Decoded {String html="",text="",messageId="",replyTo="",cc="",references="",warning="",baseUrl="";List<Attachment> attachments=new ArrayList<>();Map<String,String> inline=new HashMap<>();}
    static LinkedHashSet<String> replyRecipients(Decoded decoded,JSONObject item,String own,boolean all,boolean forward){
        LinkedHashMap<String,String> unique=new LinkedHashMap<>();if(!forward){String values=decoded.replyTo.isEmpty()?item.optString("fromAddress"):decoded.replyTo;if(all)values+=","+item.optString("to")+","+decoded.cc;
            for(String value:values.split(",")){String address=value.trim();if(!address.isEmpty()&&!address.equalsIgnoreCase(own))unique.putIfAbsent(address.toLowerCase(Locale.ROOT),address);}
        }return new LinkedHashSet<>(unique.values());
    }
    static Decoded decode(File file) throws Exception {try(InputStream in=new FileInputStream(file)){return decode(new MimeMessage(Session.getInstance(new Properties()),in));}}
    static Decoded decode(MimeMessage message) throws Exception {
        Decoded result=new Decoded();result.messageId=Objects.toString(message.getMessageID(),"");result.replyTo=addresses(message.getReplyTo());result.cc=addresses(message.getRecipients(Message.RecipientType.CC));String[] refs=message.getHeader("References");result.references=refs==null?"":String.join(" ",refs);
        parse(message,"",result);if(result.text.isEmpty())result.text=Jsoup.parse(result.html).text();
        if(result.html.isEmpty())result.html="<div style='white-space:pre-wrap'>"+org.jsoup.nodes.Entities.escape(result.text)+"</div>";
        result.html=MailImages.html(result.html,result.baseUrl,result.inline);return result;
    }
    private static void parse(Part part,String key,Decoded result) throws Exception {
        String filename=part.getFileName();boolean attachment=Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition())||filename!=null;
        String[] ids=part.getHeader("Content-ID"),locations=part.getHeader("Content-Location");String cid=ids==null?"":MailImages.reference(ids[0]),location=locations==null?"":locations[0].trim();
        if(part.isMimeType("image/*")&&(!cid.isEmpty()||!location.isEmpty()||Part.INLINE.equalsIgnoreCase(part.getDisposition()))&&part.getSize()<5*1024*1024){
            try(InputStream input=part.getInputStream()){
                byte[] data=readLimited(input,5*1024*1024);String value="data:"+part.getContentType().split(";")[0]+";base64,"+android.util.Base64.encodeToString(data,android.util.Base64.NO_WRAP);
                if(!cid.isEmpty())result.inline.put(cid,value);if(!location.isEmpty()){result.inline.put(MailImages.reference(location),value);result.inline.put(MailImages.reference(MailImages.secureUrl(location)),value);}if(filename!=null)result.inline.putIfAbsent(MailImages.reference(MimeUtility.decodeText(filename)),value);
            }return;
        }
        if(attachment){result.attachments.add(new Attachment(filename==null?"附件":MimeUtility.decodeText(filename),part.getContentType(),key,part.getSize()));return;}
        if(part.isMimeType("multipart/*")){Multipart multi=(Multipart)part.getContent();for(int i=0;i<multi.getCount();i++)try{parse(multi.getBodyPart(i),key.isEmpty()?String.valueOf(i):key+"."+i,result);}catch(Exception malformed){result.warning="部分内容无法解析，原始邮件已保留";}}
        else if(part.isMimeType("text/html")&&result.html.isEmpty()){
            result.html=textContent(part,result);String[] bases=part.getHeader("Content-Base");String base=bases==null?location:bases[0].trim();
            if(base.regionMatches(true,0,"https://",0,8)||base.regionMatches(true,0,"http://",0,7))result.baseUrl=MailImages.secureUrl(base);
        }
        else if(part.isMimeType("text/plain")&&result.text.isEmpty())result.text=textContent(part,result);
    }
    private static String textContent(Part part,Decoded result) throws Exception {
        try{return String.valueOf(part.getContent());}catch(com.sun.mail.util.DecodingException broken){
            InputStream raw=part instanceof MimeBodyPart?((MimeBodyPart)part).getRawInputStream():((MimeMessage)part).getRawInputStream();
            String charset=new ContentType(part.getContentType()).getParameter("charset");if(charset==null)charset="UTF-8";
            try(InputStream tolerant=new com.sun.mail.util.BASE64DecoderStream(raw,true)){result.warning="邮件编码不规范，已尽可能恢复正文";return new String(readLimited(tolerant,16*1024*1024),charset);}
        }
    }
    static byte[] readLimited(InputStream in,int limit) throws Exception {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IOException("文件超过允许大小");out.write(buffer,0,n);}return out.toByteArray();}
    void saveAttachment(JSONObject item,String key,Uri target) throws Exception {
        read(item);try(InputStream in=new FileInputStream(cache.body(item));OutputStream out=context.getContentResolver().openOutputStream(target)){
            Part part=new MimeMessage(Session.getInstance(new Properties()),in);if(!key.isEmpty())for(String index:key.split("\\."))part=((Multipart)part.getContent()).getBodyPart(Integer.parseInt(index));
            try(InputStream content=part.getInputStream()){byte[] bytes=new byte[16384];int n;while((n=content.read(bytes))!=-1)out.write(bytes,0,n);}
        }
    }
    String special(JSONObject account,String special) throws Exception {
        JSONArray list=cache.folders(account.getString("id"));if(list.length()==0)list=folders(account);
        for(int i=0;i<list.length();i++)if(list.getJSONObject(i).optString("special").equals(special))return list.getJSONObject(i).getString("path");
        String[] fallbacks=special.equals("\\Trash")?new String[]{"Trash","Deleted Messages","已删除"}:special.equals("\\Junk")?new String[]{"Junk","Spam","垃圾邮件"}:special.equals("\\Sent")?new String[]{"Sent","Sent Messages","已发送"}:new String[]{"Archive","Archives","归档"};
        for(int i=0;i<list.length();i++)for(String f:fallbacks)if(list.getJSONObject(i).getString("path").equalsIgnoreCase(f))return list.getJSONObject(i).getString("path");
        throw new Exception("此邮箱没有对应文件夹，请选择移动目标");
    }
    void apply(List<JSONObject> items,String action,String target) throws Exception {
        Map<String,List<JSONObject>> groups=new LinkedHashMap<>();for(JSONObject m:items)groups.computeIfAbsent(m.getString("acc")+"|"+m.getString("folder"),k->new ArrayList<>()).add(m);
        for(List<JSONObject> group:groups.values()){
            JSONObject first=group.get(0),a=accounts.account(first.getString("acc"));IMAPStore store=shared(a);
            try{IMAPFolder folder=(IMAPFolder)store.getFolder(first.getString("folder"));folder.open(Folder.READ_WRITE);
                try{
                    if(!String.valueOf(folder.getUIDValidity()).equals(first.getString("validity")))throw new Exception("文件夹已更新，请刷新后再操作");
                    List<Message> found=new ArrayList<>();for(JSONObject item:group){Message m=folder.getMessageByUID(item.getLong("uid"));if(m!=null)found.add(m);}Message[] messages=found.toArray(new Message[0]);
                    boolean flag=Set.of("read","unread","star","unstar").contains(action);
                    if(flag)folder.setFlags(messages,new Flags(action.equals("read")||action.equals("unread")?Flags.Flag.SEEN:Flags.Flag.FLAGGED),action.equals("read")||action.equals("star"));
                    else if(action.equals("delete")){
                        if(!store.hasCapability("UIDPLUS"))throw new Exception("服务器不支持安全的单封永久删除");folder.setFlags(messages,new Flags(Flags.Flag.DELETED),true);folder.expunge(messages);
                    }else{
                        String destination=action.equals("trash")?special(a,"\\Trash"):action.equals("junk")?special(a,"\\Junk"):action.equals("archive")?special(a,"\\Archive"):target;
                        if(destination.equals(folder.getFullName()))throw new Exception("目标文件夹与当前相同");Folder dest=store.getFolder(destination);if(!dest.exists())throw new Exception("目标文件夹不存在");
                        if(store.hasCapability("MOVE"))folder.moveMessages(messages,dest);
                        else if(store.hasCapability("UIDPLUS")){folder.copyMessages(messages,dest);folder.setFlags(messages,new Flags(Flags.Flag.DELETED),true);folder.expunge(messages);}
                        else throw new Exception("服务器不支持安全移动");
                    }
                    for(JSONObject item:group){if(flag)cache.update(item.getString("acc"),item.getString("folder"),item.getLong("uid"),action.equals("read")||action.equals("unread")?"seen":"starred",action.equals("read")||action.equals("star"));else cache.remove(item.getString("acc"),item.getString("folder"),item.getLong("uid"));}
                }finally{folder.close(false);}
            }finally{release(store);}
        }changed();
    }
    void editFolder(String id,String operation,String folder,String name) throws Exception {
        JSONObject a=accounts.account(id);IMAPStore store=shared(a);
        try{Folder source=store.getFolder(folder);if(!operation.equals("create")){
            if(folder.equalsIgnoreCase("INBOX"))throw new Exception("不能修改收件箱");
            for(int i=0;i<cache.folders(id).length();i++){JSONObject f=cache.folders(id).getJSONObject(i);if(f.optString("path").equals(folder)&&!f.optString("special").isEmpty())throw new Exception("不能重命名或删除系统文件夹");}
        }
        if(operation.equals("create")){Folder dest=store.getFolder(name);if(dest.exists()||!dest.create(Folder.HOLDS_MESSAGES))throw new Exception("文件夹已存在或无法创建");}
        else if(operation.equals("rename")){if(store.getFolder(name).exists()||!source.renameTo(store.getFolder(name)))throw new Exception("重命名失败");}
        else if(operation.equals("remove")){if(source.getMessageCount()>0)throw new Exception("请先移走文件夹内的邮件");if(!source.delete(false))throw new Exception("删除文件夹失败");}
        }finally{release(store);}folders(a);changed();
    }
    boolean send(JSONObject draft) throws Exception {
        JSONObject a=accounts.account(draft.getString("acc")),s=a.getJSONObject("smtp");Session session=session(a);MimeMessage message=new MimeMessage(session);
        if(accounts.password(a).isEmpty())throw new Exception("请先填写发件邮箱的授权码");
        message.setFrom(new InternetAddress(a.getString("email"),a.optString("name",AccountStore.alias(a)),"UTF-8"));
        for(String field:new String[]{"to","cc","bcc"})if(!draft.optString(field).trim().isEmpty()){
            InternetAddress[] recipients=InternetAddress.parse(draft.getString(field),true);for(InternetAddress address:recipients)address.validate();message.setRecipients(field.equals("to")?Message.RecipientType.TO:field.equals("cc")?Message.RecipientType.CC:Message.RecipientType.BCC,recipients);
        }
        if(message.getAllRecipients()==null||message.getAllRecipients().length==0)throw new Exception("请输入有效收件人");
        message.setSubject(draft.optString("subject"),"UTF-8");message.setSentDate(new Date());
        if(!draft.optString("inReplyTo").isEmpty())message.setHeader("In-Reply-To",draft.getString("inReplyTo").replaceAll("[\\r\\n]",""));
        if(!draft.optString("references").isEmpty())message.setHeader("References",draft.getString("references").replaceAll("[\\r\\n]",""));
        MimeMultipart mixed=new MimeMultipart();MimeBodyPart text=new MimeBodyPart();text.setText(draft.optString("body"),"UTF-8");mixed.addBodyPart(text);
        JSONArray attachments=draft.optJSONArray("attachments");if(attachments!=null)for(int i=0;i<attachments.length();i++){JSONObject attachment=attachments.getJSONObject(i);File file=new File(attachment.getString("path"));if(!file.isFile())throw new Exception("附件已丢失，请重新添加");MimeBodyPart part=new MimeBodyPart();part.setDataHandler(new DataHandler(new FileDataSource(file)));part.setFileName(attachment.getString("name"));mixed.addBodyPart(part);}
        message.setContent(mixed);message.saveChanges();Transport transport=session.getTransport("smtp");
        try{transport.connect(s.getString("host"),s.getInt("port"),a.optString("user",a.getString("email")),accounts.password(a));transport.sendMessage(message,message.getAllRecipients());accounts.prefs().edit().remove("smtpStatus."+a.getString("id")).apply();}
        catch(AuthenticationFailedException denied){accounts.prefs().edit().putString("smtpStatus."+a.getString("id"),"auth").apply();changed();throw new SendAuthenticationException(denied.getMessage());}
        finally{try{if(transport.isConnected())transport.close();}catch(MessagingException ignored){}}
        // SMTP success is final: an optional Sent append failure must never cause a duplicate retry.
        boolean sentSaved=true;
        if(!a.getString("email").toLowerCase().endsWith("@gmail.com"))try{String sent=special(a,"\\Sent");IMAPStore store=shared(a);try{store.getFolder(sent).appendMessages(new Message[]{message});}finally{release(store);}}catch(Exception ignored){sentSaved=false;}
        cache.deleteDraft(draft.getString("id"));changed();return sentSaved;
    }
}
