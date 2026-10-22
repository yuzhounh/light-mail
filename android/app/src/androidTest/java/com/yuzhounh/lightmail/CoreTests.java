package com.yuzhounh.lightmail;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.FixMethodOrder;
import org.junit.runners.MethodSorters;
import org.json.*;
import javax.mail.*;
import javax.mail.internet.*;
import java.io.*;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class) @FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class CoreTests {
    final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    JSONObject account(String id,int imap,int smtp) throws Exception{return new JSONObject().put("id",id).put("email",id+"@gmail.com").put("alias","Test mailbox").put("imap",new JSONObject().put("host","127.0.0.1").put("port",imap).put("secure",true)).put("smtp",new JSONObject().put("host","127.0.0.1").put("port",smtp).put("secure",true));}
    @Test public void aSecureAccountsAndImport() throws Exception {
        AccountStore store=new AccountStore(context);String id="fixture-"+UUID.randomUUID();
        try{JSONObject a=account(id,993,465);store.save(a,"fake-code-123");JSONObject saved=store.account(id);assertEquals("fake-code-123",store.password(saved));assertFalse(store.prefs().getString("accounts","").contains("fake-code-123"));
            a.put("alias","Changed").put("pass","must-not-import");store.importConfiguration(new JSONArray().put(a));assertEquals("fake-code-123",store.password(store.account(id)));assertFalse(store.account(id).has("pass"));assertEquals("Changed",store.account(id).getString("alias"));
        }finally{store.remove(id);}
    }
    @Test public void bMimeAndDraftPersistence() throws Exception {
        String raw="From: sender@example.test\r\nTo: receiver@example.test\r\nSubject: Test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello</p><script>alert(1)</script><img src='https://example.test/x' onerror='bad()'>\r\n--b\r\nContent-Type: text/plain; name=test.txt\r\nContent-Disposition: attachment; filename=test.txt\r\n\r\nattachment body\r\n--b--\r\n";
        MailClient.Decoded decoded=MailClient.decode(new MimeMessage(Session.getInstance(new Properties()),new ByteArrayInputStream(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8))));assertTrue(decoded.text.contains("Hello"));assertFalse(decoded.html.contains("<script"));assertFalse(decoded.html.contains("onerror"));assertEquals(1,decoded.attachments.size());assertEquals("test.txt",decoded.attachments.get(0).name);
        MailClient mail=MailClient.get(context);JSONObject item=new JSONObject().put("acc","mime-fixture").put("folder","INBOX").put("validity","7").put("uid",1);File source=mail.cache.body(item),attachment=new File(context.getCacheDir(),"fixture-attachment.txt");
        try{try(OutputStream out=new FileOutputStream(source)){out.write(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));}mail.saveAttachment(item,decoded.attachments.get(0).key,android.net.Uri.fromFile(attachment));try(InputStream in=new FileInputStream(attachment)){assertTrue(new String(MailClient.readLimited(in,1024),java.nio.charset.StandardCharsets.UTF_8).contains("attachment body"));}}finally{source.delete();attachment.delete();}
        String id="draft-"+UUID.randomUUID();MailCache first=new MailCache(context);first.saveDraft(new JSONObject().put("id",id).put("acc","fixture").put("subject","Persisted").put("body","saved text").put("attachments",new JSONArray()));first.close();MailCache second=new MailCache(context);try{assertEquals("saved text",second.draft(id).getString("body"));second.deleteDraft(id);assertNull(second.draft(id));}finally{second.close();}
    }
    @Test public void cRealTlsImapSmtpLifecycle() throws Exception {
        String id="protocol-"+UUID.randomUUID();MailClient mail=MailClient.get(context);String draftId="send-"+UUID.randomUUID();
        try(TestMailbox server=new TestMailbox(InstrumentationRegistry.getInstrumentation().getContext())){
            MailClient.localTestSockets=server.clientFactory;JSONObject a=account(id,server.imap.getLocalPort(),server.smtp.getLocalPort());a.getJSONObject("imap").put("host","localhost");a.getJSONObject("smtp").put("host","localhost");mail.accounts.save(a,"test-credential");
            mail.test(mail.accounts.account(id));mail.folders(mail.accounts.account(id));mail.sync(id,"INBOX",false);
            List<JSONObject> messages=mail.cache.list(id,"INBOX","",false,60);assertEquals(1,messages.size());assertTrue(mail.cache.body(messages.get(0)).isFile());assertEquals(0,server.stores);assertFalse(server.seen);assertTrue(mail.read(messages.get(0)).text.contains("Background cached body"));
            server.uid=2;mail.sync(id,"INBOX",true);messages=mail.cache.list(id,"INBOX","",false,60);assertEquals(1,messages.size());assertEquals(2,messages.get(0).getLong("uid"));assertTrue("New arrival body must already be cached",mail.cache.body(messages.get(0)).isFile());assertEquals(2,mail.accounts.prefs().getLong("highest."+id+"|INBOX",0));assertFalse(server.seen);
            android.app.NotificationManager notifications=context.getSystemService(android.app.NotificationManager.class);int notificationId=(id+":2").hashCode();boolean posted=false;
            for(int attempt=0;attempt<40&&!posted;attempt++){for(android.service.notification.StatusBarNotification n:notifications.getActiveNotifications())if(n.getId()==notificationId)posted=true;if(!posted)Thread.sleep(50);}
            assertTrue("Grant POST_NOTIFICATIONS to the debug app before this test",posted);notifications.cancel(notificationId);
            mail.apply(messages,"read",null);assertTrue(server.seen);mail.apply(messages,"star",null);assertTrue(server.star);
            JSONObject draft=new JSONObject().put("id",draftId).put("acc",id).put("to","receiver@example.test").put("subject","Local TLS send").put("body","Synthetic test only").put("attachments",new JSONArray());mail.cache.saveDraft(draft);
            assertTrue(mail.send(draft));assertTrue(server.received.contains("Synthetic test only"));assertNull(mail.cache.draft(draftId));
            server.failAuth=true;
            try{mail.test(mail.accounts.account(id));fail("Invalid IMAP auth accepted");}catch(AuthenticationFailedException expected){}server.failAuth=false;
            mail.apply(messages,"move","Trash");assertEquals(1,server.moves);assertTrue(mail.cache.list(id,"INBOX","",false,60).isEmpty());
        }finally{MailClient.localTestSockets=null;mail.cache.deleteDraft(draftId);mail.accounts.remove(id);}
    }
    @Test public void eSearchAndUnreadIncludeOlderCachedMail() throws Exception {
        MailCache cache=new MailCache(context);String id="search-"+UUID.randomUUID();
        try{for(int i=0;i<350;i++)cache.put(new JSONObject().put("acc",id).put("folder","INBOX").put("uid",i+1).put("validity","7").put("date",1000000-i).put("subject",i==349?"Older Needle":"Recent mail").put("seen",i!=349));
            assertEquals(1,cache.list(id,"INBOX","needle",false,20).size());assertEquals(1,cache.list(id,"INBOX","",true,20).size());assertEquals(20,cache.list(id,"INBOX","",false,20).size());
        }finally{cache.getWritableDatabase().delete("messages","acc=?",new String[]{id});cache.close();}
    }
    @Test public void fBulkFlagsAcrossMailboxes() throws Exception {
        MailClient mail=MailClient.get(context);String leftId="bulk-left-"+UUID.randomUUID(),rightId="bulk-right-"+UUID.randomUUID();
        try(TestMailbox left=new TestMailbox(InstrumentationRegistry.getInstrumentation().getContext());TestMailbox right=new TestMailbox(InstrumentationRegistry.getInstrumentation().getContext())){
            MailClient.localTestSockets=left.clientFactory;List<JSONObject> messages=new ArrayList<>();
            for(int i=0;i<2;i++){TestMailbox server=i==0?left:right;String id=i==0?leftId:rightId;JSONObject a=account(id,server.imap.getLocalPort(),server.smtp.getLocalPort());a.getJSONObject("imap").put("host","localhost");a.getJSONObject("smtp").put("host","localhost");mail.accounts.save(a,"fixture");mail.sync(id,"INBOX",false);messages.addAll(mail.cache.list(id,"INBOX","",false,60));}
            assertEquals(2,messages.size());mail.apply(messages,"read",null);assertTrue(left.seen);assertTrue(right.seen);mail.apply(messages,"unread",null);assertFalse(left.seen);assertFalse(right.seen);mail.apply(messages,"star",null);assertTrue(left.star);assertTrue(right.star);
        }finally{MailClient.localTestSockets=null;mail.accounts.remove(leftId);mail.accounts.remove(rightId);}
    }
    @Test public void gReplyAllIncludesCcWithoutSelfOrDuplicates() throws Exception {
        String raw="From: sender@example.test\r\nReply-To: replies@example.test\r\nTo: me@example.test, colleague@example.test\r\nCc: COLLEAGUE@example.test, reviewer@example.test\r\nContent-Type: text/plain\r\n\r\nTest";
        MailClient.Decoded decoded=MailClient.decode(new MimeMessage(Session.getInstance(new Properties()),new ByteArrayInputStream(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8))));JSONObject item=new JSONObject().put("fromAddress","sender@example.test").put("to","me@example.test, colleague@example.test");
        assertEquals(new LinkedHashSet<>(List.of("replies@example.test","colleague@example.test","reviewer@example.test")),MailClient.replyRecipients(decoded,item,"me@example.test",true,false));assertEquals(Set.of("replies@example.test"),MailClient.replyRecipients(decoded,item,"me@example.test",false,false));assertTrue(MailClient.replyRecipients(decoded,item,"me@example.test",true,true).isEmpty());
    }
    @Test public void hMalformedBase64BodyIsRecovered() throws Exception {
        String raw="From: sender@example.test\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nSGVsbG8";
        MailClient.Decoded body=MailClient.decode(new MimeMessage(Session.getInstance(new Properties()),new ByteArrayInputStream(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8))));assertTrue(body.text.startsWith("Hello"));assertFalse(body.warning.isEmpty());
        assertFalse(MailClient.error(new IOException("BASE64Decoder: raw mail fragment")).contains("raw mail fragment"));
    }
    @Test public void iEmptyInboxEstablishesNotificationBaseline() throws Exception {
        MailClient mail=MailClient.get(context);String id="empty-"+UUID.randomUUID();
        try(TestMailbox server=new TestMailbox(InstrumentationRegistry.getInstrumentation().getContext())){
            MailClient.localTestSockets=server.clientFactory;JSONObject a=account(id,server.imap.getLocalPort(),server.smtp.getLocalPort());a.getJSONObject("imap").put("host","localhost");a.getJSONObject("smtp").put("host","localhost");mail.accounts.save(a,"fixture");server.exists=0;mail.sync(id,"INBOX",false);assertEquals("7",mail.accounts.prefs().getString("generation."+id+"|INBOX",""));
            com.sun.mail.imap.IMAPStore store=mail.connect(mail.accounts.account(id));try{assertFalse(SyncService.supportsIdle(store));}finally{store.close();}
            server.exists=1;mail.sync(id,"INBOX",true);assertEquals(1,mail.cache.list(id,"INBOX","",false,60).size());assertTrue(mail.cache.body(mail.cache.list(id,"INBOX","",false,60).get(0)).isFile());
            context.getSystemService(android.app.NotificationManager.class).cancel((id+":1").hashCode());
        }finally{MailClient.localTestSockets=null;mail.accounts.remove(id);}
    }
    @Test public void dSendFailurePreservesDraft() throws Exception {
        MailClient mail=MailClient.get(context);String id="failure-"+UUID.randomUUID(),draftId="failure-draft";try{mail.accounts.save(account(id,1,1),"fixture");JSONObject draft=new JSONObject().put("id",draftId).put("acc",id).put("to","receiver@example.test").put("subject","No send").put("body","Keep draft").put("attachments",new JSONArray());mail.cache.saveDraft(draft);try{mail.send(draft);fail("Closed local port unexpectedly accepted mail");}catch(javax.mail.MessagingException expected){}assertNotNull(mail.cache.draft(draftId));}finally{mail.accounts.remove(id);mail.cache.deleteDraft(draftId);}
    }
}
