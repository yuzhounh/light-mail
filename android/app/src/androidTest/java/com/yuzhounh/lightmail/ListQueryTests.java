package com.yuzhounh.lightmail;

import android.app.Activity;
import android.content.Intent;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ListQueryTests {
    private static Field field(String name) throws Exception {Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f;}
    @Test public void blockedCacheDoesNotBlockUiAndLatestSearchWins() throws Exception {
        if(!BuildConfig.DEBUG)throw new IllegalStateException("Synthetic list checks require the isolated debug app");
        var instrumentation=InstrumentationRegistry.getInstrumentation();
        var context=instrumentation.getTargetContext();MailClient mail=MailClient.get(context);
        String id="list-check-"+UUID.randomUUID();Activity activity=null;
        try{
            mail.accounts.save(new JSONObject().put("id",id).put("email",id+"@example.test").put("imap",new JSONObject()).put("smtp",new JSONObject()),"");
            for(int i=0;i<150;i++)mail.cache.put(new JSONObject().put("acc",id).put("folder","INBOX").put("validity","7").put("uid",i+1).put("date",i).put("seen",false).put("subject",i==0?"needle":"ordinary"));
            activity=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            final Activity screen=activity;Method render=MainActivity.class.getDeclaredMethod("render");render.setAccessible(true);
            CountDownLatch uiReturned=new CountDownLatch(1);
            synchronized(mail.cache){
                instrumentation.runOnMainSync(()->{try{field("accountId").set(screen,id);field("query").set(screen,"ordinary");render.invoke(screen);field("query").set(screen,"needle");render.invoke(screen);uiReturned.countDown();}catch(Exception e){throw new RuntimeException(e);}});
                assertTrue("UI must return while the cache is locked",uiReturned.await(2,TimeUnit.SECONDS));
            }
            long deadline=System.currentTimeMillis()+10000;boolean[] found={false};
            while(!found[0]&&System.currentTimeMillis()<deadline){instrumentation.runOnMainSync(()->{try{List<?> rows=(List<?>)field("rows").get(screen);found[0]=rows.size()==1&&((JSONObject)rows.get(0)).optString("subject").equals("needle");}catch(Exception e){throw new RuntimeException(e);}});if(!found[0])Thread.sleep(50);}
            assertTrue("Latest query must find an older cached match beyond the initial page",found[0]);
        }finally{
            if(activity!=null){Activity screen=activity;instrumentation.runOnMainSync(screen::finish);}
            mail.cache.generation(id,"INBOX","removed");mail.accounts.remove(id);SyncJob.cancel(context);
        }
    }
}
