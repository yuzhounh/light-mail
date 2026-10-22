package com.yuzhounh.lightmail;

import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Explicitly invoked local UI fixture; synthetic records only, in the debug app. */
public class UiFixture {
    @Test public void preparePreview() throws Exception {
        android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
        if(!BuildConfig.DEBUG)throw new IllegalStateException("UI fixture is debug-only");
        MailClient mail=MailClient.get(c);String id="ui-preview";mail.accounts.prefs().edit().putBoolean("background",false).commit();
        mail.accounts.save(new JSONObject().put("id",id).put("email","preview@example.test").put("alias","示例邮箱").put("imap",new JSONObject().put("host","localhost").put("port",1).put("secure",true)).put("smtp",new JSONObject().put("host","localhost").put("port",1).put("secure",true)),"");
        mail.cache.generation(id,"INBOX","7");JSONArray folders=new JSONArray();for(String[] f:new String[][]{{"INBOX","收件箱","\\Inbox"},{"Projects","项目邮件",""},{"Sent","已发送","\\Sent"},{"Trash","废纸篓","\\Trash"}})folders.put(new JSONObject().put("path",f[0]).put("label",f[1]).put("special",f[2]));mail.cache.saveFolders(id,folders);
        for(int i=0;i<20;i++){
            String subject=i==0?"界面测试 · 固定宽度邮件":"项目进展与下一步安排 "+(i+1);
            JSONObject item=new JSONObject().put("acc",id).put("folder","INBOX").put("validity","7").put("uid",i+1).put("date",System.currentTimeMillis()-i*3600000L).put("from",i%2==0?"Light Mail Team":"Taylor").put("fromAddress","sender@example.test").put("to","preview@example.test").put("subject",subject).put("preview","这是一封本地示例邮件，用于检查阅读和多选操作。").put("seen",i%3==0).put("starred",i==2);
            mail.cache.put(item);String body="<table width='720' style='width:720px;min-width:720px;background:#eff4fc'><tr><td style='padding:28px'><h1>Light Mail</h1><p>本地界面测试 / Local UI preview</p><table width='100%'><tr><td>左侧内容 LEFT</td><td align='right'>右侧内容 RIGHT EDGE</td></tr></table></td></tr></table><p>邮件正文保存在本机，可以离线阅读。</p>";
            String raw="From: sender@example.test\r\nTo: preview@example.test\r\nSubject: Preview\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n"+body;
            try(OutputStream out=new FileOutputStream(mail.cache.body(item))){out.write(raw.getBytes(StandardCharsets.UTF_8));}
        }
    }
}
