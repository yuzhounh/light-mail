package com.yuzhounh.lightmail;

import android.app.NotificationManager;
import android.content.*;
import android.os.Bundle;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.util.*;
import com.sun.mail.imap.IMAPStore;

/** Opt-in, same-signature instrumentation. Credentials never leave the app process. */
public class LiveMailboxTests {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Set<String> own=Set.of("wangjing@xynu.edu.cn","yuzhounh@gmail.com","yuzhounh@163.com","yuzhounh@qq.com");
    private void report(JSONObject value){Bundle out=new Bundle();out.putString("stream","LIGHTMAIL_RESULT "+value+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(0,out);}
    @Test(timeout=300000) public void check() throws Exception {
        String phase=InstrumentationRegistry.getArguments().getString("phase","connections"),run=InstrumentationRegistry.getArguments().getString("run","20261020");
        if(!run.matches("[a-zA-Z0-9-]{1,40}"))throw new IllegalArgumentException("Invalid test run");
        MailClient mail=MailClient.get(context);List<JSONObject> accounts=mail.accounts.accounts();
        context.stopService(new Intent(context,SyncService.class));for(int n=0;n<20&&SyncService.running;n++)Thread.sleep(100);
        for(int index=0;index<accounts.size();index++){
            JSONObject a=accounts.get(index);String email=a.getString("email");if(!own.contains(email))continue;String requested=InstrumentationRegistry.getArguments().getString("account","");if(!requested.isEmpty()&&!email.equalsIgnoreCase(requested))continue;if(phase.startsWith("smtp-")&&!email.equals("yuzhounh@163.com"))continue;
            JSONObject result=new JSONObject().put("phase",phase).put("account",AccountStore.alias(a)).put("email",email);
            if(phase.equals("smtp-plain")){
                java.util.Properties p=new java.util.Properties();p.setProperty("mail.smtp.ssl.enable","true");p.setProperty("mail.smtp.ssl.checkserveridentity","true");p.setProperty("mail.smtp.auth","true");p.setProperty("mail.smtp.auth.mechanisms","PLAIN");p.setProperty("mail.smtp.connectiontimeout","15000");p.setProperty("mail.smtp.timeout","15000");javax.mail.Transport t=javax.mail.Session.getInstance(p).getTransport("smtp");
                try{t.connect(a.getJSONObject("smtp").getString("host"),465,a.optString("user",email),mail.accounts.password(a));result.put("smtp",true);}catch(Exception e){String reply=Objects.toString(e.getMessage(),"");String secret=mail.accounts.password(a);if(!secret.isEmpty())reply=reply.replace(secret,"[redacted]");result.put("smtp",false).put("reply",reply.substring(0,Math.min(200,reply.length())));}finally{try{t.close();}catch(Exception ignored){}}
            }else if(phase.equals("smtp-info")){
                result.put("user",a.optString("user")).put("server",a.getJSONObject("smtp"));
                try{mail.testSmtp(a);result.put("smtp",true);}catch(Exception e){String reply=Objects.toString(e.getMessage(),"");String secret=mail.accounts.password(a);if(!secret.isEmpty())reply=reply.replace(secret,"[redacted]");reply=reply.replaceAll("[A-Za-z0-9+/=_-]{16,}","[redacted]");result.put("smtp",false).put("reply",reply.substring(0,Math.min(240,reply.length())));}
            }else if(phase.equals("connections")){
                try{IMAPStore store=mail.connect(a);try{result.put("imap",true).put("idle",SyncService.supportsIdle(store));}finally{store.close();}}catch(Exception e){result.put("imap",false).put("imapError",MailClient.error(e));}
                try{mail.testSmtp(a);result.put("smtp",true);}catch(Exception e){result.put("smtp",false).put("smtpError",MailClient.error(e));}
                if(result.optBoolean("imap"))try{mail.sync(a.getString("id"),"INBOX",false);mail.folders(a);result.put("sync",true).put("cachedMessages",mail.cache.list(a.getString("id"),"INBOX","",false,100000).size());}catch(Exception e){result.put("sync",false).put("syncError",MailClient.error(e));}
            }else if(phase.equals("send")){
                JSONObject receiver=accounts.get((index+1)%accounts.size());String to=receiver.optString("email");if(!own.contains(to))throw new IllegalStateException("Test recipient must be an owned mailbox");
                String subject="Light Mail Test "+run+" "+index;JSONObject draft=new JSONObject().put("id","live-"+run+"-"+index).put("acc",a.getString("id")).put("to",to).put("subject",subject).put("body","Light Mail mobile send/receive, automatic body cache and notification test.\nTest marker: "+run+"\nThis message was sent only between your own mailboxes.").put("attachments",new JSONArray());
                mail.cache.saveDraft(draft);try{boolean sentCopy=mail.send(draft);result.put("sent",true).put("sentCopy",sentCopy).put("recipient",to).put("subject",subject);}catch(Exception e){result.put("sent",false).put("sendError",MailClient.error(e));mail.cache.deleteDraft(draft.getString("id"));}
            }else if(phase.equals("incoming")){
                JSONArray found=new JSONArray();for(JSONObject message:mail.cache.list(a.getString("id"),"INBOX",run,false,200)){
                    if(!message.optString("subject").startsWith("Light Mail Test "+run+" "))continue;
                    JSONObject receipt=new JSONObject().put("subject",message.optString("subject")).put("cachedBody",mail.cache.body(message).isFile()).put("unread",!message.optBoolean("seen"));
                    if(mail.cache.body(message).isFile())try{receipt.put("bodyVerified",MailClient.decode(mail.cache.body(message)).text.contains("Test marker: "+run));}catch(Exception e){receipt.put("bodyVerified",false);}
                    boolean notified=false;int id=(a.optString("id")+":"+message.optLong("uid")).hashCode();for(android.service.notification.StatusBarNotification n:context.getSystemService(NotificationManager.class).getActiveNotifications())if(n.getId()==id)notified=true;receipt.put("notification",notified);found.put(receipt);
                }result.put("messages",found);
            }else throw new IllegalArgumentException("Unknown live test phase");
            report(result);
        }
        if(mail.accounts.prefs().getBoolean("background",true))SyncService.start(context);
    }
}
