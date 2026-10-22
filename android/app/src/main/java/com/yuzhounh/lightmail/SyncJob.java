package com.yuzhounh.lightmail;

import android.app.job.*;
import android.content.ComponentName;
import android.content.Context;
import org.json.JSONObject;

public class SyncJob extends JobService {
    private volatile boolean cancelled;
    static void schedule(Context c){JobInfo job=new JobInfo.Builder(1505,new ComponentName(c,SyncJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build();c.getSystemService(JobScheduler.class).schedule(job);}
    static void cancel(Context c){c.getSystemService(JobScheduler.class).cancel(1505);}
    @Override public boolean onStartJob(JobParameters params){cancelled=false;MailClient.IO.execute(()->{boolean failed=false;try{MailClient mail=MailClient.get(this);for(JSONObject a:mail.accounts.accounts()){if(cancelled)break;if(!a.optString("secret").isEmpty())try{mail.syncInboxIfNeeded(a.optString("id"));}catch(Exception e){failed=true;}}}catch(Exception e){failed=true;}jobFinished(params,failed);});return true;}
    @Override public boolean onStopJob(JobParameters p){cancelled=true;return true;}
}
