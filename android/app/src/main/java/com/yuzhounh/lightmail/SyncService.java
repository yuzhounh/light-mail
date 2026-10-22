package com.yuzhounh.lightmail;

import android.app.*;
import android.content.*;
import android.os.IBinder;
import android.os.Build;
import com.sun.mail.imap.IMAPFolder;
import com.sun.mail.imap.IMAPStore;
import javax.mail.Folder;
import javax.mail.event.MessageCountAdapter;
import javax.mail.event.MessageCountEvent;
import org.json.JSONObject;
import java.util.*;
import java.util.concurrent.*;

public class SyncService extends Service {
    static final String STATUS="lightmail-sync",MAIL="lightmail-new";
    static volatile boolean running=false;
    private volatile boolean stopped=false;
    private final List<IMAPStore> stores=new CopyOnWriteArrayList<>();
    private final ExecutorService workers=Executors.newFixedThreadPool(4);
    static void channels(Context c){NotificationManager manager=c.getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel(STATUS,"后台收信",NotificationManager.IMPORTANCE_LOW));manager.createNotificationChannel(new NotificationChannel(MAIL,"新邮件",NotificationManager.IMPORTANCE_DEFAULT));}
    static void start(Context c){try{Intent i=new Intent(c,SyncService.class);if(Build.VERSION.SDK_INT>=26)c.startForegroundService(i);else c.startService(i);}catch(RuntimeException e){SyncJob.schedule(c);}}
    static void notifyMail(Context c,JSONObject account,JSONObject message){
        channels(c);if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
        Intent intent=new Intent(c,MainActivity.class).putExtra("openAcc",account.optString("id")).putExtra("openUid",message.optLong("uid")).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id=(account.optString("id")+":"+message.optLong("uid")).hashCode();PendingIntent pending=PendingIntent.getActivity(c,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        c.getSystemService(NotificationManager.class).notify(id,new Notification.Builder(c,MAIL).setSmallIcon(com.yuzhounh.lightmail.R.drawable.ic_notification).setContentTitle(message.optString("from","新邮件")).setContentText(message.optString("subject")).setSubText(AccountStore.alias(account)).setContentIntent(pending).setAutoCancel(true).build());
    }
    @Override public void onCreate(){super.onCreate();channels(this);running=true;
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(1,new Notification.Builder(this,STATUS).setSmallIcon(R.drawable.ic_notification).setContentTitle("Light Mail").setContentText("正在后台监听新邮件").setContentIntent(open).setOngoing(true).build());
        SyncJob.schedule(this);
        try{for(JSONObject a:MailClient.get(this).accounts.accounts())if(!a.optString("secret").isEmpty())workers.execute(()->watch(a));}catch(Exception ignored){}
    }
    static boolean supportsIdle(IMAPStore store) throws javax.mail.MessagingException {return store.hasCapability("IDLE");}
    private void watch(JSONObject account){MailClient mail=MailClient.get(this);int failures=0;while(!stopped){
        IMAPStore store=null;
        try{
            store=mail.connect(account);stores.add(store);boolean idle=supportsIdle(store);mail.accounts.prefs().edit().putString("mode."+account.optString("id"),idle?"idle":"poll").apply();
            if(!idle){stores.remove(store);store.close();store=null;while(!stopped){mail.sync(account.getString("id"),"INBOX",true);failures=0;Thread.sleep(getSystemService(android.os.PowerManager.class).isInteractive()?60000:300000);}return;}
            IMAPFolder folder=(IMAPFolder)store.getFolder("INBOX");folder.open(Folder.READ_ONLY);
            folder.addMessageCountListener(new MessageCountAdapter(){@Override public void messagesAdded(MessageCountEvent event){MailClient.IO.execute(()->{try{mail.sync(account.optString("id"),"INBOX",true);}catch(Exception ignored){}});}});
            mail.sync(account.getString("id"),"INBOX",true);failures=0;
            while(!stopped&&store.isConnected())folder.idle();
        }catch(Exception e){mail.accounts.prefs().edit().putString("status."+account.optString("id"),MailClient.error(e)).apply();mail.changed();if(e instanceof javax.mail.AuthenticationFailedException)return;failures++;}
        finally{if(store!=null){stores.remove(store);try{store.close();}catch(Exception ignored){}}}
        if(!stopped)try{Thread.sleep(Math.min(300000L,30000L*(1L<<Math.min(failures,3))));}catch(InterruptedException e){return;}
    }}
    @Override public int onStartCommand(Intent intent,int flags,int id){return START_NOT_STICKY;}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onTimeout(int startId,int fgsType){SyncJob.schedule(this);stopSelf();}
    @Override public void onDestroy(){stopped=true;running=false;workers.shutdownNow();for(IMAPStore store:stores)MailClient.IO.execute(()->{try{store.close();}catch(Exception ignored){}});super.onDestroy();}
}
