package com.yuzhounh.lightmail;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.*;

public class MainActivity extends Activity {
    private MailClient mail;
    private String accountId=null,folder="INBOX",folderLabel="所有收件箱",query="";
    private boolean drafts=false,unread=false,reader=false,registered=false;
    private int loading=0,readerToken=0;
    private int messageLimit=60;
    private volatile int listGeneration;
    private List<Object> listScope=Collections.emptyList();
    private int exhaustionCheck=-1;
    private final java.util.concurrent.ExecutorService listQueries=java.util.concurrent.Executors.newSingleThreadExecutor();
    private boolean loadingMore=false,noMore=false;
    private final Handler handler=new Handler(android.os.Looper.getMainLooper());
    private final List<JSONObject> rows=new ArrayList<>();
    private final Set<String> selected=new HashSet<>();
    private TextView title,subtitle,status;
    private ListView list;
    private LinearLayout empty,actions;
    private ScrollView emptyScroll;
    private MailAdapter adapter;
    private ImportServer importer;
    private JSONObject readerItem;
    private MailClient.Decoded decoded;
    private String pendingAttachment;
    private String navigationPage="";
    private int drawerScrollY=0;
    private int folderScrollY=0;
    private String folderAccountId="";
    private int navigationToken=0;
    private LinearLayout listRoot,headerBar,searchWrap;
    private EditText searchField;
    private ImageButton composeAction,menuButton;
    private TextView moreFooter;
    private MailRefreshLayout refresh;
    private android.os.Parcelable savedListPosition;
    private android.animation.ValueAnimator headerAnimator;
    private float headerFraction=0;
    private boolean headerCollapsed=false;
    private final BroadcastReceiver updates=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){if(!reader)render();}};
    private final Runnable periodic=new Runnable(){public void run(){if(!reader&&navigationPage.isEmpty()&&!(SyncService.running&&folder.equalsIgnoreCase("INBOX")))sync();handler.postDelayed(this,60000);}};
    @Override public void onCreate(Bundle state){super.onCreate(state);mail=MailClient.get(this);buildList();if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=getPackageManager().PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},5);}
    @Override protected void onResume(){super.onResume();if(!registered){androidx.core.content.ContextCompat.registerReceiver(this,updates,new IntentFilter(MailClient.CHANGED),androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);registered=true;}if(!reader)render();handler.removeCallbacks(periodic);handler.postDelayed(periodic,60000);startBackground();handleNotification(getIntent());}
    @Override protected void onPause(){handler.removeCallbacks(periodic);if(registered){unregisterReceiver(updates);registered=false;}super.onPause();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleNotification(intent);}
    @Override protected void onDestroy(){listGeneration++;listQueries.shutdownNow();if(headerAnimator!=null)headerAnimator.cancel();if(importer!=null)importer.stop();super.onDestroy();}
    private String key(JSONObject m){return m.optString("acc")+"|"+m.optString("folder")+"|"+m.optLong("uid");}
    interface Task { void run() throws Exception; }
    private void background(Task task,Runnable done){background(MailClient.USER,task,done);}
    private void background(java.util.concurrent.ExecutorService pool,Task task,Runnable done){loading++;statusText();pool.execute(()->{try{task.run();runOnUiThread(()->{loading--;if(done!=null)done.run();if(!reader)render();});}catch(Exception e){runOnUiThread(()->{loading--;if(!reader)statusText();Ui.toast(this,MailClient.error(e));});}});}

    private void buildList(){
        reader=false;readerToken++;navigationPage="";navigationToken++;
        if(headerAnimator!=null)headerAnimator.cancel();headerFraction=0;headerCollapsed=false;
        LinearLayout root=Ui.column(this);root.setFocusableInTouchMode(true);listRoot=root;
        headerBar=Ui.row(this);headerBar.setPadding(Ui.dp(this,16),0,Ui.dp(this,12),0);
        LinearLayout heading=Ui.column(this);title=Ui.title(this,folderLabel);title.setTextSize(18);title.setSingleLine(true);title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        subtitle=Ui.text(this,"",11,Ui.MUTED);status=subtitle;subtitle.setVisibility(View.GONE);heading.addView(title);heading.addView(subtitle);
        headerBar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        menuButton=Ui.icon(this,MailIcon.MENU,"邮箱与设置",this::headerAction);headerBar.addView(menuButton);
        root.addView(headerBar,new LinearLayout.LayoutParams(-1,Ui.dp(this,60)));
        searchWrap=Ui.column(this);searchWrap.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,12));searchWrap.setClipChildren(true);
        searchField=Ui.input(this,"搜索本地邮件",query,false);searchField.setTextSize(14);searchField.setBackground(Ui.touch(this,0xEEFFFFFF,24));
        MailIcon glass=new MailIcon(MailIcon.SEARCH,Ui.MUTED);glass.setBounds(0,0,Ui.dp(this,20),Ui.dp(this,20));searchField.setCompoundDrawables(glass,null,null,null);searchField.setCompoundDrawablePadding(Ui.dp(this,10));
        searchWrap.addView(searchField,new LinearLayout.LayoutParams(-1,Ui.dp(this,46)));root.addView(searchWrap,new LinearLayout.LayoutParams(-1,Ui.dp(this,58)));
        searchField.setOnFocusChangeListener((v,focused)->{if(focused)collapseHeader(false);});
        searchField.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence v,int st,int c,int a){}public void afterTextChanged(Editable e){}public void onTextChanged(CharSequence value,int a,int b,int c){query=value.toString();exhaustionCheck=-1;noMore=false;render();}});

        FrameLayout content=new FrameLayout(this);
        refresh=new MailRefreshLayout(this);refresh.setColorSchemeColors(Ui.BLUE);refresh.setProgressBackgroundColorSchemeColor(Color.WHITE);
        FrameLayout viewport=new FrameLayout(this);list=new ListView(this);list.setDivider(new android.graphics.drawable.ColorDrawable(Ui.BORDER));list.setDividerHeight(Ui.dp(this,1));list.setPadding(Ui.dp(this,8),Ui.dp(this,8),Ui.dp(this,8),Ui.dp(this,88));list.setClipToPadding(false);
        moreFooter=Ui.text(this,"正在加载更早邮件…",13,Ui.MUTED);moreFooter.setGravity(Gravity.CENTER);moreFooter.setPadding(0,Ui.dp(this,12),0,Ui.dp(this,12));moreFooter.setVisibility(View.GONE);LinearLayout footer=Ui.column(this);footer.addView(moreFooter,new LinearLayout.LayoutParams(-1,-2));list.addFooterView(footer,null,false);
        adapter=new MailAdapter();list.setAdapter(adapter);
        list.setOnScrollListener(new AbsListView.OnScrollListener(){public void onScrollStateChanged(AbsListView v,int state){}public void onScroll(AbsListView v,int first,int visible,int total){if(total>0&&first+visible>=total-3&&v.canScrollVertically(-1))loadMore();}});viewport.addView(list,new FrameLayout.LayoutParams(-1,-1));
        empty=Ui.column(this);empty.setPadding(Ui.dp(this,20),Ui.dp(this,22),Ui.dp(this,20),Ui.dp(this,92));emptyScroll=new ScrollView(this);emptyScroll.addView(empty);viewport.addView(emptyScroll,new FrameLayout.LayoutParams(-1,-1));
        refresh.addView(viewport,new android.view.ViewGroup.LayoutParams(-1,-1));
        refresh.setOnChildScrollUpCallback((parent,child)->drafts||!selected.isEmpty()||(emptyScroll.getVisibility()==View.VISIBLE?emptyScroll.canScrollVertically(-1):list.canScrollVertically(-1)));
        refresh.setOnRefreshListener(()->{collapseHeader(false);noMore=false;if(loading==0)sync();else statusText();});
        refresh.setScrollIntent(upward->{
            View scroller=emptyScroll.getVisibility()==View.VISIBLE?emptyScroll:list;
            if(!selected.isEmpty()||(upward&&!scroller.canScrollVertically(1)))return;
            if(searchField.hasFocus()){searchField.clearFocus();((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(searchField.getWindowToken(),0);}
            collapseHeader(upward);
        });
        content.addView(refresh,new FrameLayout.LayoutParams(-1,-1));
        composeAction=Ui.icon(this,MailIcon.WRITE,"写邮件",this::compose);composeAction.setImageDrawable(new MailIcon(MailIcon.WRITE,Color.WHITE));composeAction.setPadding(Ui.dp(this,16),Ui.dp(this,16),Ui.dp(this,16),Ui.dp(this,16));composeAction.setBackground(Ui.touch(this,Ui.BLUE,28));composeAction.setElevation(Ui.dp(this,4));
        FrameLayout.LayoutParams fab=new FrameLayout.LayoutParams(Ui.dp(this,56),Ui.dp(this,56),Gravity.BOTTOM|Gravity.END);fab.setMargins(0,0,Ui.dp(this,20),Ui.dp(this,20));content.addView(composeAction,fab);
        root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        list.setOnItemClickListener((p,v,index,id)->{JSONObject item=rows.get(index);if(drafts)openDraft(item.optString("id"));else if(!selected.isEmpty())toggle(item);else openMessage(item);});
        list.setOnItemLongClickListener((p,v,index,id)->{if(!drafts)toggle(rows.get(index));return true;});
        actions=Ui.row(this);Ui.pad(actions,8);actions.setBackgroundColor(Color.WHITE);root.addView(actions);
        Ui.root(this,root);render();
    }
    private void applyHeaderFraction(float fraction){
        headerFraction=fraction;headerBar.getLayoutParams().height=Ui.dp(this,60-12*fraction);headerBar.requestLayout();
        searchWrap.getLayoutParams().height=Ui.dp(this,58*(1-fraction));searchWrap.setAlpha(1-fraction);searchWrap.requestLayout();
        searchWrap.setImportantForAccessibility(fraction>=.99f?View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS:View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        title.setTextSize(18-2*fraction);subtitle.setVisibility(fraction<.5f&&!status.getText().toString().isEmpty()?View.VISIBLE:View.GONE);
    }
    private void collapseHeader(boolean collapsed){
        if(reader||!navigationPage.isEmpty()||headerBar==null)return;
        if(headerCollapsed==collapsed)return;headerCollapsed=collapsed;if(headerAnimator!=null)headerAnimator.cancel();
        headerAnimator=android.animation.ValueAnimator.ofFloat(headerFraction,collapsed?1:0);headerAnimator.setDuration(180);
        headerAnimator.addUpdateListener(animation->applyHeaderFraction((float)animation.getAnimatedValue()));headerAnimator.start();
    }
    private LinearLayout pageRoot(String name,Runnable back){
        LinearLayout root=Ui.column(this),bar=Ui.row(this);bar.setPadding(Ui.dp(this,18),Ui.dp(this,6),Ui.dp(this,12),Ui.dp(this,6));
        TextView label=Ui.title(this,name);label.setTextSize(18);label.setSingleLine(true);label.setEllipsize(android.text.TextUtils.TruncateAt.END);bar.addView(label,new LinearLayout.LayoutParams(0,-2,1));
        boolean help=navigationPage.equals("help"),dismiss=navigationPage.equals("mailboxes");ImageButton close=Ui.icon(this,help||dismiss?MailIcon.CLOSE:MailIcon.BACK,help?"关闭使用说明":dismiss?"关闭邮箱与设置":"返回",back);bar.addView(close);root.addView(bar);return root;
    }
    private void restoreList(){
        navigationPage="";navigationToken++;reader=false;
        if(listRoot==null){buildList();return;}Ui.root(this,listRoot);render();if(savedListPosition!=null)list.onRestoreInstanceState(savedListPosition);
    }
    private void render(){
        if(reader||!navigationPage.isEmpty()||adapter==null||isDestroyed())return;
        final int generation=++listGeneration,limit=messageLimit;
        final String account=accountId,path=folder,search=query;
        final boolean localDrafts=drafts,onlyUnread=unread;
        List<Object> scope=Arrays.asList(account,path,search,localDrafts,onlyUnread);
        if(!scope.equals(listScope)){listScope=scope;rows.clear();adapter.notifyDataSetChanged();}
        listQueries.execute(()->{
            if(generation!=listGeneration)return;
            try{
                List<JSONObject> accounts=mail.accounts.accounts();Set<String> ids=new HashSet<>();for(JSONObject a:accounts)ids.add(a.getString("id"));
                List<JSONObject> next=localDrafts?mail.cache.drafts(account):mail.cache.list(account,path,search,onlyUnread,limit);
                next.removeIf(m->!ids.contains(m.optString("acc")));
                runOnUiThread(()->{if(generation==listGeneration&&!isFinishing()&&!isDestroyed()&&!reader&&navigationPage.isEmpty())renderRows(accounts,next);});
            }catch(Exception e){runOnUiThread(()->{if(generation==listGeneration&&!isDestroyed())Ui.toast(this,MailClient.error(e));});}
        });
    }
    private void renderRows(List<JSONObject> accounts,List<JSONObject> next){try{
        rows.clear();rows.addAll(next);
        if(exhaustionCheck>=0){noMore=rows.size()<=exhaustionCheck;exhaustionCheck=-1;}
        selected.removeIf(k->rows.stream().noneMatch(m->key(m).equals(k)));title.setText(folderLabel);adapter.notifyDataSetChanged();
        empty.removeAllViews();emptyScroll.setVisibility(rows.isEmpty()?View.VISIBLE:View.GONE);
        if(rows.isEmpty()){
            if(accounts.isEmpty()){empty.addView(Ui.badge(this,MailIcon.MAIL,Ui.BLUE,64));TextView welcome=Ui.title(this,"让邮件，轻一点");welcome.setTextSize(25);welcome.setPadding(0,Ui.dp(this,24),0,Ui.dp(this,12));empty.addView(welcome);TextView description=Ui.text(this,"欢迎使用 Light Mail\n连接你的邮箱，随时阅读与回复。",16,Ui.MUTED);description.setPadding(0,0,0,Ui.dp(this,24));empty.addView(description);empty.addView(Ui.primary(this,"添加邮箱",MailIcon.MAIL,()->editAccount(null)));empty.addView(Ui.button(this,"从电脑导入配置",this::startImport));}
            else {int pending=0;for(JSONObject a:accounts)if(a.optString("secret").isEmpty()&&(accountId==null||a.optString("id").equals(accountId)))pending++;
                empty.addView(Ui.text(this,drafts?"没有本地草稿":pending>0?"邮箱配置已准备好，请填写授权码":loading>0?"正在同步邮件…":"暂无缓存邮件",17,Ui.MUTED));
                for(JSONObject a:accounts)if(!drafts&&a.optString("secret").isEmpty()&&(accountId==null||a.optString("id").equals(accountId))){LinearLayout card=Ui.column(this);Ui.pad(card,16);android.graphics.drawable.GradientDrawable surface=Ui.rounded(Color.WHITE,20,this);surface.setStroke(Ui.dp(this,1),Ui.BORDER);card.setBackground(surface);LinearLayout accountRow=Ui.row(this);accountRow.addView(Ui.accountBadge(this,a,44));LinearLayout details=Ui.column(this);details.setPadding(Ui.dp(this,12),0,0,0);TextView label=Ui.title(this,AccountStore.alias(a));label.setTextSize(16);details.addView(label);TextView address=Ui.text(this,a.optString("email"),13,Ui.MUTED);address.setPadding(0,Ui.dp(this,6),0,0);address.setSingleLine(true);address.setEllipsize(android.text.TextUtils.TruncateAt.END);details.addView(address);accountRow.addView(details,new LinearLayout.LayoutParams(0,-2,1));card.addView(accountRow);Button connect=Ui.button(this,"填写授权码并连接",()->editAccount(a));LinearLayout.LayoutParams connectParams=new LinearLayout.LayoutParams(-1,Ui.dp(this,46));connectParams.topMargin=Ui.dp(this,14);card.addView(connect,connectParams);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=Ui.dp(this,14);empty.addView(card,lp);}
            }
        }
        actions.removeAllViews();actions.setVisibility(selected.isEmpty()?View.GONE:View.VISIBLE);if(!selected.isEmpty()){
            actions.addView(Ui.button(this,"已读",()->applySelected("read",null)),new LinearLayout.LayoutParams(0,Ui.dp(this,52),1));
            actions.addView(Ui.button(this,"移动",this::moveSelection),spacedButtonParams(52));
            actions.addView(Ui.button(this,"删除",()->confirmTrash(chosen())),spacedButtonParams(52));
            actions.addView(Ui.button(this,"取消",()->{selected.clear();render();}),spacedButtonParams(52));
            ImageButton more=Ui.icon(this,MailIcon.MORE,"更多批量操作",this::more);LinearLayout.LayoutParams moreParams=new LinearLayout.LayoutParams(Ui.dp(this,48),Ui.dp(this,48));moreParams.setMarginStart(Ui.dp(this,8));actions.addView(more,moreParams);
        }
        composeAction.setVisibility(selected.isEmpty()?View.VISIBLE:View.GONE);moreFooter.setVisibility(loadingMore?View.VISIBLE:View.GONE);
        boolean picking=!selected.isEmpty(),all=picking&&selected.size()>=rows.size();menuButton.setImageDrawable(new MailIcon(picking?MailIcon.CHECK:MailIcon.MENU,all?Ui.BLUE:Ui.TEXT));menuButton.setContentDescription(!picking?"邮箱与设置":all?"取消全选":"全选当前列表");statusText();
    }catch(Exception e){Ui.toast(this,MailClient.error(e));}}

    private void statusText(){
        if(reader||!navigationPage.isEmpty()||status==null)return;
        String value=loading>0?"正在同步…":selected.isEmpty()?"":"已选择 "+selected.size()+" 封";
        status.setText(value);status.setVisibility(!value.isEmpty()&&headerFraction<.5f?View.VISIBLE:View.GONE);
        if(refresh!=null&&loading==0)refresh.setRefreshing(false);
    }
    private void toggle(JSONObject item){String id=key(item);if(!selected.add(id))selected.remove(id);if(!selected.isEmpty())collapseHeader(false);render();}
    private List<JSONObject> chosen(){List<JSONObject> out=new ArrayList<>();for(JSONObject m:rows)if(selected.contains(key(m)))out.add(m);return out;}
    private void select(String id,String path,String label,boolean localDrafts){select(id,path,label,localDrafts,false);}
    private void select(String id,String path,String label,boolean localDrafts,boolean unreadOnly){accountId=id;folder=path;folderLabel=label;drafts=localDrafts;unread=unreadOnly;selected.clear();query="";messageLimit=60;loadingMore=false;noMore=false;exhaustionCheck=-1;buildList();if(!drafts)sync();}
    private void headerAction(){if(selected.isEmpty()){drawer();return;}if(selected.size()>=rows.size())selected.clear();else for(JSONObject item:rows)selected.add(key(item));render();}
    private void loadMore(){if(drafts||loadingMore||noMore||!selected.isEmpty()||rows.isEmpty()||!navigationPage.isEmpty()||reader)return;
        loadingMore=true;int before=rows.size();messageLimit+=60;render();List<JSONObject> targets=new ArrayList<>();try{for(JSONObject a:mail.accounts.accounts())if((accountId==null||a.optString("id").equals(accountId))&&!a.optString("secret").isEmpty())targets.add(a);}catch(Exception ignored){}
        String path=accountId==null?"INBOX":folder;int limit=messageLimit;String account=accountId,viewFolder=folder,search=query;boolean onlyUnread=unread;
        background(MailClient.IO,()->{for(JSONObject a:targets){try{mail.sync(a.getString("id"),path,false,limit);}catch(Exception ignored){}}},()->{if(Objects.equals(account,accountId)&&viewFolder.equals(folder)&&search.equals(query)&&onlyUnread==unread&&limit==messageLimit){loadingMore=false;exhaustionCheck=before;}});}
    private final Map<String,Long> folderRefreshed=new HashMap<>();
    private void refreshFolderCounts(ScrollView scroll) throws Exception {
        long now=System.currentTimeMillis();int token=navigationToken;
        for(JSONObject a:mail.accounts.accounts()){String id=a.getString("id");if(a.optString("secret").isEmpty()||now-folderRefreshed.getOrDefault(id,0L)<300000)continue;folderRefreshed.put(id,now);
            MailClient.IO.execute(()->{try{mail.folders(a);runOnUiThread(()->{if(token==navigationToken&&navigationPage.equals("mailboxes"))drawer(scroll.getScrollY());});}catch(Exception ignored){}});}
    }
    private int inboxUnread(JSONObject a) throws Exception {JSONArray cached=mail.cache.folders(a.getString("id"));for(int i=0;i<cached.length();i++){JSONObject f=cached.getJSONObject(i);if(f.optString("path").equalsIgnoreCase("INBOX"))return f.optInt("unread");}return 0;}
    private void sync(){if(drafts){statusText();return;}try{for(JSONObject a:mail.accounts.accounts()){if(accountId!=null&&!a.optString("id").equals(accountId))continue;if(a.optString("secret").isEmpty())continue;String path=accountId==null?"INBOX":folder;int limit=messageLimit;background(MailClient.IO,()->{mail.sync(a.getString("id"),path,path.equalsIgnoreCase("INBOX"),limit);if(mail.cache.folders(a.getString("id")).length()==0)mail.folders(a);},null);}}catch(Exception e){Ui.toast(this,MailClient.error(e));}statusText();}
    private void startBackground(){try{boolean any=false;for(JSONObject a:mail.accounts.accounts())any|=!a.optString("secret").isEmpty();if(any&&realtimeEnabled()&&!SyncService.running)SyncService.start(this);SyncJob.schedule(this);}catch(Exception ignored){}}

    private void drawer(){drawer(navigationPage.isEmpty()?0:drawerScrollY);}
    private void drawer(int scrollY){try{
        if(navigationPage.isEmpty()&&!reader&&list!=null){savedListPosition=list.onSaveInstanceState();if(headerAnimator!=null)headerAnimator.cancel();applyHeaderFraction(headerCollapsed?1:0);}
        navigationPage="mailboxes";navigationToken++;reader=false;
        LinearLayout root=pageRoot("邮箱与设置",this::restoreList);ScrollView scroll=new ScrollView(this);drawerScrollY=scrollY;scroll.setOnScrollChangeListener((v,x,y,oldX,oldY)->drawerScrollY=y);LinearLayout content=Ui.column(this);content.setPadding(Ui.dp(this,16),Ui.dp(this,8),Ui.dp(this,16),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        content.addView(navigationRow(MailIcon.INBOXES,"所有收件箱",0,accountId==null&&!drafts&&!unread,()->select(null,"INBOX","所有收件箱",false)));
        int allUnread=0;for(JSONObject a:mail.accounts.accounts())allUnread+=inboxUnread(a);content.addView(navigationRow(MailIcon.MAIL,"未读邮件",allUnread,accountId==null&&!drafts&&unread,()->select(null,"INBOX","未读邮件",false,true)));
        int allDrafts=mail.cache.drafts(null).size();content.addView(navigationRow(MailIcon.DRAFT,"本地草稿",allDrafts,accountId==null&&drafts,()->select(null,"@drafts","本地草稿",true)));
        for(JSONObject a:mail.accounts.accounts()){
            navigationDivider(content);
            LinearLayout row=Ui.row(this);row.setPadding(Ui.dp(this,12),Ui.dp(this,4),0,0);ImageView mark=Ui.accountGlyph(this,a,22);LinearLayout.LayoutParams markParams=new LinearLayout.LayoutParams(Ui.dp(this,22),Ui.dp(this,22));markParams.setMarginEnd(Ui.dp(this,16));row.addView(mark,markParams);TextView label=Ui.title(this,AccountStore.alias(a));label.setTextSize(15);row.addView(label,new LinearLayout.LayoutParams(0,-2,1));row.addView(Ui.icon(this,MailIcon.SETTINGS,"管理 "+AccountStore.alias(a),()->accountMenu(a)));content.addView(row);
            TextView address=Ui.text(this,a.optString("email"),12,Ui.MUTED);address.setPadding(Ui.dp(this,50),0,Ui.dp(this,12),Ui.dp(this,8));content.addView(address);
            String state=a.optString("secret").isEmpty()?"待填写授权码":MailClient.accountStatus(mail.accounts,a.optString("id"));
            if(!state.startsWith("已同步")){TextView hint=Ui.text(this,state,11,Ui.MUTED);hint.setPadding(Ui.dp(this,50),0,Ui.dp(this,12),Ui.dp(this,8));content.addView(hint);}
            JSONArray cached=mail.cache.folders(a.getString("id"));List<JSONObject> records=new ArrayList<>();int inboxUnread=0;
            for(int i=0;i<cached.length();i++){JSONObject f=cached.getJSONObject(i);if(f.optString("path").equalsIgnoreCase("INBOX"))inboxUnread=f.optInt("unread");else records.add(f);}
            boolean current=a.optString("id").equals(accountId);
            content.addView(navigationRow(MailIcon.INBOX,"收件箱",inboxUnread,current&&!drafts&&!unread&&folder.equalsIgnoreCase("INBOX"),()->select(a.optString("id"),"INBOX",AccountStore.alias(a)+" · 收件箱",false)));
            content.addView(navigationRow(MailIcon.MAIL,"未读邮件",0,current&&!drafts&&unread,()->select(a.optString("id"),"INBOX",AccountStore.alias(a)+" · 未读邮件",false,true)));
            content.addView(navigationRow(MailIcon.DRAFT,"草稿",mail.cache.drafts(a.getString("id")).size(),current&&drafts,()->select(a.optString("id"),"@drafts",AccountStore.alias(a)+" · 草稿",true)));
            records.sort(Comparator.comparingInt(this::mailboxFolderOrder));
            Set<String> hidden=hiddenFolders(a);
            for(JSONObject f:records){if(hidden.contains(f.optString("path")))continue;String kind=mailboxFolderType(f);String name=folderTitle(f);int glyph=folderGlyph(f);
                LinearLayout entry=navigationRow(glyph,name,f.optInt("unread"),current&&!drafts&&!unread&&folder.equals(f.optString("path")),()->select(a.optString("id"),f.optString("path"),AccountStore.alias(a)+" · "+name,false));
                if(kind.isEmpty())entry.setOnLongClickListener(v->{Ui.dialog(this).setTitle(name).setItems(new String[]{"重命名 / 移动","删除空文件夹"},(d,index)->folderEdit(a,index==0?"rename":"remove",f)).show();return true;});content.addView(entry);
            }
            if(cached.length()==0){content.addView(navigationRow(MailIcon.SEND,"发件箱",0,false,()->sent(a)));content.addView(navigationRow(MailIcon.FOLDER,"加载其他文件夹",0,false,()->{if(a.optString("secret").isEmpty()){editAccount(a);return;}int token=navigationToken;background(()->mail.folders(a),()->{if(token==navigationToken)drawer(scroll.getScrollY());});}));}
        }
        navigationDivider(content);content.addView(navigationRow(MailIcon.MAIL,"添加邮箱",0,false,()->editAccount(null)));content.addView(navigationRow(MailIcon.REFRESH,"从电脑导入配置",0,false,this::startImport));
        navigationDivider(content);content.addView(realtimeRow());content.addView(navigationRow(MailIcon.MAIL,"使用说明",0,false,this::showHelp));
        refreshFolderCounts(scroll);
        navigationDivider(content);ImageView appLogo=new ImageView(this);appLogo.setImageResource(R.drawable.app_icon);appLogo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);LinearLayout.LayoutParams logoParams=new LinearLayout.LayoutParams(Ui.dp(this,40),Ui.dp(this,40));logoParams.gravity=Gravity.CENTER_HORIZONTAL;logoParams.topMargin=Ui.dp(this,16);content.addView(appLogo,logoParams);TextView version=Ui.text(this,"Light Mail "+appVersion(),12,Ui.MUTED);version.setGravity(Gravity.CENTER_HORIZONTAL);version.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));content.addView(version,new LinearLayout.LayoutParams(-1,-2));Ui.root(this,root);scroll.post(()->scroll.scrollTo(0,scrollY));
    }catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    private LinearLayout navigationRow(int glyph,String name,int count,boolean active,Runnable action){
        LinearLayout row=Ui.row(this);row.setMinimumHeight(Ui.dp(this,48));row.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));row.setBackground(Ui.touch(this,active?Ui.TINT:Color.TRANSPARENT,16));row.setFocusable(true);row.setOnClickListener(v->action.run());
        ImageView icon=new ImageView(this);icon.setImageDrawable(new MailIcon(glyph,active?Ui.BLUE:Ui.MUTED));icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);LinearLayout.LayoutParams iconParams=new LinearLayout.LayoutParams(Ui.dp(this,22),Ui.dp(this,22));iconParams.setMarginEnd(Ui.dp(this,16));row.addView(icon,iconParams);
        TextView text=Ui.text(this,name,15,active?Ui.BLUE:Ui.TEXT);text.setMaxLines(2);text.setEllipsize(android.text.TextUtils.TruncateAt.END);row.addView(text,new LinearLayout.LayoutParams(0,-2,1));if(count>0){TextView number=Ui.text(this,String.valueOf(count),12,Ui.MUTED);number.setPadding(Ui.dp(this,12),0,0,0);row.addView(number);}return row;
    }
    private boolean realtimeEnabled(){return mail.accounts.prefs().getBoolean("realtime",true);}
    private LinearLayout realtimeRow(){
        LinearLayout row=navigationRow(MailIcon.REFRESH,"后台实时收信",0,false,()->{});Switch toggle=new Switch(this);toggle.setChecked(realtimeEnabled());toggle.setContentDescription("后台实时收信");
        toggle.setOnCheckedChangeListener((b,on)->{mail.accounts.prefs().edit().putBoolean("realtime",on).apply();if(on)startBackground();else stopService(new Intent(this,SyncService.class));});
        row.setOnClickListener(v->toggle.toggle());row.addView(toggle);
        return row;
    }
    private void showHelp(){
        navigationPage="help";navigationToken++;reader=false;
        LinearLayout root=pageRoot("使用说明",this::drawer);ScrollView scroll=new ScrollView(this);LinearLayout content=Ui.column(this);content.setPadding(Ui.dp(this,24),Ui.dp(this,8),Ui.dp(this,24),Ui.dp(this,32));scroll.addView(content);
        helpSection(content,"连接邮箱","打开“邮箱与设置 → 添加邮箱”，选择邮箱服务商，填写完整邮箱地址和授权码或应用专用密码，再点“连接”。QQ、163 等邮箱需先在邮箱网页端开启 IMAP/SMTP；Gmail 使用应用专用密码。自定义邮箱可在“服务器设置”中填写 IMAP、SMTP、端口与加密方式。只点“保存配置”会保留配置，尚未填写授权码的邮箱不会开始收信。");
        helpSection(content,"从电脑导入","用 USB 将手机连接电脑，在手机点“从电脑导入配置”，再由电脑端配合传送邮箱配置。此功能需要电脑的 USB 调试连接；手机上的接收入口开放两分钟，确认邮箱列表后才导入。导入不包含密码，已有密码会保留；新邮箱需在手机填写授权码。");
        helpSection(content,"查看与搜索","“所有收件箱”和“未读邮件”可汇总多个邮箱，也可在“邮箱与设置”中选择单个邮箱及其文件夹。下拉邮件列表手动同步，向下滚动加载更早邮件。搜索框搜索本机已缓存的邮件。打开邮件可阅读、回复、转发和保存附件；图片未加载成功时可点图片提示中的“点击重试”。");
        helpSection(content,"写信与草稿","点邮件列表右下角的写信按钮，选择发件邮箱，填写收件人、主题与正文，可添加附件。输入后自动保存到本机，关闭写信页后可从“本地草稿”继续。手机本地草稿与“服务器草稿”分开显示。点“发送”提交邮件；发送失败时草稿会保留。");
        helpSection(content,"批量操作与文件夹","长按一封邮件进入多选，随后点击其他邮件继续选择；顶部勾选按钮可全选当前列表。底部可标为已读、移动、删除，更多菜单提供未读、星标、归档和垃圾邮件等操作。邮箱旁的齿轮可编辑授权码、管理文件夹、重命名、排序或移除本机账户。关闭文件夹显示开关只隐藏入口，服务器邮件保持原状；移除本机账户也不会删除服务器邮件。");
        helpSection(content,"后台收信与通知","开启“后台实时收信”会保持收件箱连接，并显示常驻通知，新邮件到达时提醒；关闭后改为约每 15 分钟由系统安排检查，耗电更少。系统省电限制可能延后检查与通知。需要及时提醒时，请允许 Light Mail 通知及后台运行；也可随时回到列表下拉同步。");
        helpSection(content,"连接异常","先确认网络可用、邮箱已开启 IMAP/SMTP、授权码仍有效，再在邮箱旁的齿轮中编辑配置并重新连接。授权码更新后需在手机重新填写。提示“邮件已发送，已发送文件夹保存失败”时不要重复发送，可到邮箱网页端确认。");
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));Ui.root(this,root);
    }
    private void helpSection(LinearLayout content,String heading,String body){
        TextView title=Ui.title(this,heading);title.setTextSize(17);title.setPadding(0,Ui.dp(this,16),0,Ui.dp(this,10));content.addView(title);
        TextView text=Ui.text(this,body,16,Ui.TEXT);text.setTextIsSelectable(true);text.setLineSpacing(Ui.dp(this,4),1);content.addView(text,new LinearLayout.LayoutParams(-1,-2));
    }
    private void navigationDivider(LinearLayout content){View line=new View(this);line.setBackgroundColor(Ui.BORDER);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Ui.dp(this,1));lp.setMargins(Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,8));content.addView(line,lp);}
    private String folderTitle(JSONObject f){if(f.optString("path").equalsIgnoreCase("INBOX"))return "收件箱";return switch(mailboxFolderType(f)){case "\\Sent"->"发件箱";case "\\Drafts"->"服务器草稿";case "\\Trash"->"废纸篓";case "\\Junk"->"垃圾邮件";case "\\All"->"所有邮件";case "\\Archive"->"归档";default->f.optString("path");};}
    private int folderGlyph(JSONObject f){if(f.optString("path").equalsIgnoreCase("INBOX"))return MailIcon.INBOX;return switch(mailboxFolderType(f)){case "\\Sent"->MailIcon.SEND;case "\\Drafts"->MailIcon.DRAFT;case "\\Trash"->MailIcon.TRASH;case "\\Junk"->MailIcon.JUNK;case "\\All"->MailIcon.MAIL;case "\\Archive"->MailIcon.ARCHIVE;default->MailIcon.FOLDER;};}
    private Set<String> hiddenFolders(JSONObject a){Set<String> out=new HashSet<>();try{JSONArray array=new JSONArray(mail.accounts.prefs().getString("hidden."+a.optString("id"),"[]"));for(int i=0;i<array.length();i++)out.add(array.getString(i));}catch(Exception ignored){}return out;}
    private void setFolderHidden(JSONObject a,String path,boolean hide){Set<String> hidden=hiddenFolders(a);if(hide)hidden.add(path);else hidden.remove(path);mail.accounts.prefs().edit().putString("hidden."+a.optString("id"),new JSONArray(hidden).toString()).apply();}
    private void manageFolders(JSONObject a,JSONArray records) throws Exception {
        int scrollY=navigationPage.equals("folders")&&a.optString("id").equals(folderAccountId)?folderScrollY:0;
        navigationPage="folders";navigationToken++;folderAccountId=a.optString("id");folderScrollY=scrollY;LinearLayout root=pageRoot(AccountStore.alias(a)+" · 文件夹",this::drawer);ScrollView scroll=new ScrollView(this);scroll.setOnScrollChangeListener((v,x,y,oldX,oldY)->folderScrollY=y);LinearLayout box=Ui.column(this);box.setPadding(Ui.dp(this,16),Ui.dp(this,4),Ui.dp(this,16),Ui.dp(this,16));scroll.addView(box);
        List<JSONObject> sorted=new ArrayList<>();for(int i=0;i<records.length();i++)sorted.add(records.getJSONObject(i));sorted.sort(Comparator.comparingInt((JSONObject f)->f.optString("path").equalsIgnoreCase("INBOX")?-1:mailboxFolderOrder(f)));
        Set<String> hidden=hiddenFolders(a);
        for(JSONObject f:sorted){String path=f.optString("path");boolean inbox=path.equalsIgnoreCase("INBOX");LinearLayout row=navigationRow(folderGlyph(f),folderTitle(f),0,false,()->folderActions(a,f));
            if(inbox){TextView fixed=Ui.text(this,"固定显示",12,Ui.MUTED);row.addView(fixed);}
            else{Switch toggle=new Switch(this);toggle.setChecked(!hidden.contains(path));toggle.setContentDescription("在邮箱与设置中显示 "+folderTitle(f));toggle.setOnCheckedChangeListener((b,on)->setFolderHidden(a,path,!on));row.addView(toggle);}
            box.addView(row);}
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));root.addView(Ui.button(this,"新建文件夹",()->folderEdit(a,"create",null)));Ui.root(this,root);scroll.post(()->scroll.scrollTo(0,scrollY));
    }
    private void folderActions(JSONObject a,JSONObject f){Runnable open=()->select(a.optString("id"),f.optString("path"),AccountStore.alias(a)+" · "+folderTitle(f),false);
        if(!mailboxFolderType(f).isEmpty()||f.optString("path").equalsIgnoreCase("INBOX")){open.run();return;}
        Ui.dialog(this).setTitle(folderTitle(f)).setItems(new String[]{"打开","重命名 / 移动","删除空文件夹"},(d,index)->{if(index==0)open.run();else folderEdit(a,index==1?"rename":"remove",f);}).show();}
    private void renameAccount(JSONObject a){EditText name=Ui.input(this,"邮箱名称",AccountStore.alias(a),false);Ui.dialog(this).setTitle("重命名邮箱").setView(name).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->{try{String value=name.getText().toString().trim();JSONObject record=new JSONObject(a.toString());record.put("alias",value.isEmpty()?a.optString("email"):value);mail.accounts.save(record,null);drawer();}catch(Exception e){Ui.toast(this,MailClient.error(e));}}).show();}
    private String mailboxFolderType(JSONObject folder){String special=folder.optString("special");if(!special.isEmpty())return special;return switch(folder.optString("path").toLowerCase(Locale.ROOT)){case "sent","sent messages","sent mail","已发送","已发送邮件"->"\\Sent";case "drafts","草稿"->"\\Drafts";case "trash","deleted messages","已删除","废纸篓"->"\\Trash";case "junk","spam","垃圾邮件"->"\\Junk";case "archive","archives","归档"->"\\Archive";default->"";};}
    private int mailboxFolderOrder(JSONObject folder){return switch(mailboxFolderType(folder)){case "\\Drafts"->0;case "\\Sent"->1;case "\\Junk"->2;case "\\Trash"->3;case "\\All"->4;case "\\Archive"->5;default->6;};}
    private LinearLayout.LayoutParams spacedButtonParams(){return spacedButtonParams(48);}
    private LinearLayout.LayoutParams spacedButtonParams(int height){LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,Ui.dp(this,height),1);lp.setMarginStart(Ui.dp(this,8));return lp;}
    private void sent(JSONObject account){try{
        if(mail.cache.folders(account.getString("id")).length()==0){
            if(account.optString("secret").isEmpty()){editAccount(account);return;}
            int token=++navigationToken;background(()->mail.folders(account),()->{if(token==navigationToken)sent(account);});return;
        }
        select(account.getString("id"),mail.special(account,"\\Sent"),AccountStore.alias(account)+" · 发件箱",false);
    }catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    private void accountMenu(JSONObject a){Ui.dialog(this).setTitle(AccountStore.alias(a)).setItems(new String[]{"编辑配置 / 授权码","管理文件夹","重命名","上移","下移","移除本机账户"},(d,index)->{try{if(index==0)editAccount(a);else if(index==1)folders(a,null);else if(index==2)renameAccount(a);else if(index<5){mail.accounts.move(a.getString("id"),index==3?-1:1);drawer();}else Ui.dialog(this).setTitle("移除此邮箱？").setMessage("只移除本机账户配置，不会删除服务器邮件。").setNegativeButton("取消",null).setPositiveButton("移除",(x,w)->{try{int scrollY=drawerScrollY;mail.accounts.remove(a.getString("id"));select(null,"INBOX","所有收件箱",false);drawer(scrollY);restartBackground();}catch(Exception e){Ui.toast(this,MailClient.error(e));}}).show();}catch(Exception e){Ui.toast(this,MailClient.error(e));}}).show();}

    private String appVersion(){try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception e){return "";}}
    private void restartBackground(){stopService(new Intent(this,SyncService.class));handler.postDelayed(this::startBackground,500);}

    private void more(){
        if(selected.isEmpty())return;
        AlertDialog menu=Ui.dialog(this).setItems(new String[]{"标为已读","标为未读","加星标","取消星标","归档","标为垃圾邮件"},(d,index)->{
            switch(index){case 0:applySelected("read",null);break;case 1:applySelected("unread",null);break;case 2:applySelected("star",null);break;case 3:applySelected("unstar",null);break;case 4:applySelected("archive",null);break;case 5:applySelected("junk",null);break;}
        }).create();showCompactMenu(menu);
    }
    private void applySelected(String action,String target){List<JSONObject> items=chosen();if(items.isEmpty())return;background(()->mail.apply(items,action,target),()->{selected.clear();Ui.toast(this,"操作已完成");});}
    private void confirmTrash(List<JSONObject> items){if(items.isEmpty())return;Ui.dialog(this).setTitle("移动到废纸篓？").setMessage("已选择 "+items.size()+" 封邮件").setNegativeButton("取消",null).setPositiveButton("移动",(d,w)->background(()->mail.apply(items,"trash",null),()->{selected.clear();if(reader)buildList();Ui.toast(this,"已移动到废纸篓");})).show();}
    private void moveSelection(){List<JSONObject> items=chosen();if(items.isEmpty())return;String acc=items.get(0).optString("acc");if(items.stream().anyMatch(m->!m.optString("acc").equals(acc))){Ui.toast(this,"移动时请只选择同一邮箱的邮件");return;}try{folders(mail.accounts.account(acc),path->applySelected("move",path));}catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    interface FolderChosen { void accept(String path); }

    private void folders(JSONObject a,FolderChosen chosen){try{
        JSONArray records=mail.cache.folders(a.getString("id"));
        if(records.length()==0){
            if(a.optString("secret").isEmpty()){editAccount(a);return;}
            if(chosen==null){navigationPage="folders";int token=++navigationToken;LinearLayout pending=pageRoot(AccountStore.alias(a)+" · 文件夹",this::drawer);TextView loadingText=Ui.text(this,"正在加载文件夹…",15,Ui.MUTED);Ui.pad(loadingText,20);pending.addView(loadingText);Ui.root(this,pending);background(()->mail.folders(a),()->{if(token==navigationToken)folders(a,null);});}
            else background(()->mail.folders(a),()->folders(a,chosen));return;
        }
        if(chosen==null){manageFolders(a,records);return;}
        ListView view=new ListView(this);String[] labels=new String[records.length()];for(int i=0;i<records.length();i++)labels[i]=records.getJSONObject(i).optString("label");view.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_list_item_1,labels));
        {
            LinearLayout root=Ui.column(this);root.addView(view,new LinearLayout.LayoutParams(-1,Ui.dp(this,380)));AlertDialog dialog=Ui.dialog(this).setTitle("移动到文件夹").setView(root).setNegativeButton("取消",null).create();view.setOnItemClickListener((p,v,index,id)->{dialog.dismiss();chosen.accept(records.optJSONObject(index).optString("path"));});dialog.show();
        }
        view.setOnItemLongClickListener((p,v,index,id)->{if(chosen!=null)return false;JSONObject f=records.optJSONObject(index);if(!f.optString("special").isEmpty()){Ui.toast(this,"系统文件夹不能修改");return true;}Ui.dialog(this).setTitle(f.optString("label")).setItems(new String[]{"重命名 / 移动","删除空文件夹"},(d,choice)->folderEdit(a,choice==0?"rename":"remove",f)).show();return true;});
    }catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    private void folderEdit(JSONObject a,String operation,JSONObject folder){EditText name=Ui.input(this,"文件夹名称或完整路径",folder==null?"":folder.optString("path"),false);Ui.dialog(this).setTitle(operation.equals("remove")?"删除空文件夹？":operation.equals("create")?"新建文件夹":"重命名 / 移动文件夹").setView(name).setNegativeButton("取消",null).setPositiveButton("确定",(d,w)->{String value=name.getText().toString().trim();if(!operation.equals("remove")&&value.isEmpty()){Ui.toast(this,"请输入名称");return;}int token=navigationToken;background(()->mail.editFolder(a.getString("id"),operation,folder==null?"":folder.getString("path"),value),()->{if(token!=navigationToken)return;if(navigationPage.equals("mailboxes"))drawer();else folders(a,null);});}).show();}
    private void compose(){try{if(mail.accounts.accounts().isEmpty()){editAccount(null);return;}List<JSONObject> saved=mail.cache.drafts(accountId);if(saved.isEmpty()&&accountId!=null)saved=mail.cache.drafts(null);if(!saved.isEmpty()){openDraft(saved.get(0).getString("id"));return;}Intent intent=new Intent(this,ComposeActivity.class);if(accountId!=null)intent.putExtra("acc",accountId);startActivity(intent);}catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    private void openDraft(String id){startActivity(new Intent(this,ComposeActivity.class).putExtra("draftId",id));}
    private void handleNotification(Intent intent){if(intent==null||!intent.hasExtra("openUid"))return;String acc=intent.getStringExtra("openAcc");long uid=intent.getLongExtra("openUid",-1);intent.removeExtra("openUid");select(acc,"INBOX","收件箱",false);for(JSONObject m:rows)if(m.optLong("uid")==uid){openMessage(m);break;}}
    private void openMessage(JSONObject item){reader=true;readerItem=item;decoded=null;int token=++readerToken;
        LinearLayout root=Ui.column(this),bar=Ui.row(this);bar.setPadding(Ui.dp(this,8),Ui.dp(this,8),Ui.dp(this,8),Ui.dp(this,8));bar.addView(Ui.icon(this,android.R.drawable.ic_media_previous,"返回邮件列表",this::buildList));bar.addView(Ui.title(this,"邮件"),new LinearLayout.LayoutParams(0,-2,1));bar.addView(Ui.icon(this,android.R.drawable.ic_menu_delete,"移到废纸篓",()->confirmTrash(List.of(readerItem))));bar.addView(Ui.icon(this,android.R.drawable.ic_menu_more,"邮件操作",this::readerMenu));root.addView(bar);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);LinearLayout content=Ui.column(this);scroll.addView(content,new ScrollView.LayoutParams(-1,-2));root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout head=Ui.column(this);Ui.pad(head,16);TextView subject=Ui.title(this,item.optString("subject"));subject.setTextSize(15);subject.setPadding(0,0,0,Ui.dp(this,8));head.addView(subject);
        TextView sender=Ui.text(this,MailClient.clean(item.optString("from"))+" <"+item.optString("fromAddress")+">",15,Ui.TEXT);sender.setTextIsSelectable(true);sender.setPadding(0,0,0,Ui.dp(this,6));head.addView(sender);
        TextView recipients=Ui.text(this,"收件人："+item.optString("to"),12,Ui.MUTED);recipients.setTextIsSelectable(true);recipients.setPadding(0,0,0,Ui.dp(this,4));head.addView(recipients);
        head.addView(Ui.text(this,new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.getDefault()).format(new Date(item.optLong("date"))),12,Ui.MUTED));content.addView(head);
        LinearLayout commands=Ui.row(this);commands.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,12));commands.addView(readerButton("回复",()->reply(false,false)),new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));commands.addView(readerButton("回复全部",()->reply(true,false)),spacedButtonParams());commands.addView(readerButton("转发",()->reply(false,true)),spacedButtonParams());content.addView(commands);
        LinearLayout attachmentList=Ui.column(this);attachmentList.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,12));attachmentList.setVisibility(View.GONE);content.addView(attachmentList);
        Set<String> imageUrls=new HashSet<>(),failedImages=new HashSet<>();String[] readerHtml={null};int[] autoRetry={0};Button imageRetry=Ui.button(this,"图片未加载，点击重试",()->{});imageRetry.setVisibility(View.GONE);content.addView(imageRetry);
        WebView web=new WebView(this);web.setBackgroundColor(Color.WHITE);web.setMinimumHeight(Ui.dp(this,160));web.setNestedScrollingEnabled(false);web.setVerticalScrollBarEnabled(false);web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setDomStorageEnabled(false);settings.setSupportZoom(true);settings.setBuiltInZoomControls(true);settings.setDisplayZoomControls(false);settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);settings.setSafeBrowsingEnabled(true);settings.setTextZoom(Math.round(100 * getResources().getConfiguration().fontScale));settings.setLoadsImagesAutomatically(true);settings.setBlockNetworkImage(false);
        imageRetry.setOnClickListener(v->{if(readerHtml[0]==null)return;autoRetry[0]=2;failedImages.clear();imageRetry.setVisibility(View.GONE);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);web.loadDataWithBaseURL(MailImages.ORIGIN,readerHtml[0],"text/html","UTF-8",null);});
        web.setWebViewClient(new WebViewClient(){
            // Only failures that a retry can fix count: timeouts, connection problems, 5xx/408/429. Missing (404/403/410)
            // or blocked images, and the placeholder for unresolved cid: images, can never load and must not raise the banner.
            private void imageFailed(WebResourceRequest request,boolean retryable){
                if(!retryable||request.isForMainFrame()||!reader||token!=readerToken)return;
                if("mail.lightmail.invalid".equals(request.getUrl().getHost()))return;String url=request.getUrl().toString();
                if(imageUrls.contains(url)||request.getRequestHeaders().getOrDefault("Accept","").startsWith("image/")){
                    failedImages.add(url);
                    // First failures: retry the page quietly once before bothering the reader.
                    if(autoRetry[0]==0){autoRetry[0]=1;web.postDelayed(()->{
                        if(!reader||token!=readerToken||readerHtml[0]==null)return;
                        autoRetry[0]=2;failedImages.clear();settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
                        web.loadDataWithBaseURL(MailImages.ORIGIN,readerHtml[0],"text/html","UTF-8",null);},3000);return;}
                    if(autoRetry[0]==1)return;
                    imageRetry.setText("有 "+failedImages.size()+" 张图片未加载，点击重试");imageRetry.setVisibility(View.VISIBLE);
                }
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                int code=error.getErrorCode();imageFailed(request,code==ERROR_HOST_LOOKUP||code==ERROR_CONNECT||code==ERROR_TIMEOUT||code==ERROR_IO);}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){
                int status=response.getStatusCode();imageFailed(request,status>=500||status==429||status==408);}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){if("mail.lightmail.invalid".equals(request.getUrl().getHost()))return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0]));return null;}
            @Override public void onPageFinished(WebView view,String url){settings.setCacheMode(WebSettings.LOAD_DEFAULT);view.requestLayout();}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){String scheme=request.getUrl().getScheme();if(Set.of("https","http","mailto").contains(scheme))try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception ignored){}return true;}
        });content.addView(web,new LinearLayout.LayoutParams(-1,-2));web.loadData("<p style='padding:24px;color:#78869a'>正在读取邮件…</p>","text/html","UTF-8");Ui.root(this,root);
        MailClient.USER.execute(()->{
            try{
                MailClient.Decoded body=mail.read(item);
                runOnUiThread(()->{if(!reader||token!=readerToken)return;decoded=body;
                    attachmentList.removeAllViews();
                    if(!body.attachments.isEmpty()){
                        TextView attachmentHeading=Ui.text(this,body.attachments.size()>1?"附件（"+body.attachments.size()+"）":"附件",14,Ui.MUTED);
                        MailIcon attachmentIcon=new MailIcon(MailIcon.ATTACH,Ui.MUTED);attachmentIcon.setBounds(0,0,Ui.dp(this,16),Ui.dp(this,16));
                        attachmentHeading.setCompoundDrawablesRelative(attachmentIcon,null,null,null);attachmentHeading.setCompoundDrawablePadding(Ui.dp(this,6));attachmentList.addView(attachmentHeading);
                        for(MailClient.Attachment file:body.attachments){
                            Button attachment=Ui.button(this,file.name,()->saveAttachment(file));attachment.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);attachment.setSingleLine(false);
                            attachmentList.addView(attachment,new LinearLayout.LayoutParams(-1,-2));
                        }
                        attachmentList.setVisibility(View.VISIBLE);
                    }
                    imageUrls.clear();for(org.jsoup.nodes.Element image:org.jsoup.Jsoup.parse(body.html).select("img[src]"))imageUrls.add(image.attr("src"));
                    String warning=body.warning.isEmpty()?"":"<p style='background:#fff5dd;padding:12px;border-radius:12px'>"+org.jsoup.nodes.Entities.escape(body.warning)+"</p>";
                    readerHtml[0]="<!doctype html><meta name='viewport' content='width=device-width'><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%}body{font-family:sans-serif;font-size:14px;margin:0;padding:16px;color:#253247;line-height:1.6;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>"+warning+body.html;
                    web.loadDataWithBaseURL(MailImages.ORIGIN,readerHtml[0],"text/html","UTF-8",null);
                });
                if(!item.optBoolean("seen"))try{mail.apply(List.of(item),"read",null);}catch(Exception ignored){}
            }catch(Exception e){
                boolean cached;try{cached=mail.cache.body(item).isFile();}catch(Exception ignored){cached=false;}
                String message=cached?"此邮件内容无法解析，原始邮件已保留。":"邮件尚未缓存，联网后重试。";
                runOnUiThread(()->{if(reader&&token==readerToken){web.loadData("<p style='padding:24px'>"+message+"</p>","text/html","UTF-8");Ui.toast(this,MailClient.error(e));}});
            }
        });
    }
    private Button readerButton(String label,Runnable action){Button button=Ui.button(this,label,action);button.setBackground(Ui.touch(this,0xFFDDE9FC,14));button.setTextColor(0xFF31578F);return button;}
    private void reply(boolean all,boolean forward){if(decoded==null){Ui.toast(this,"请等正文读取完成");return;}try{
        String own=mail.accounts.account(readerItem.getString("acc")).getString("email");LinkedHashSet<String> recipients=MailClient.replyRecipients(decoded,readerItem,own,all,forward);
        String subject=readerItem.optString("subject");if(!subject.toLowerCase().startsWith(forward?"fwd:":"re:"))subject=(forward?"Fwd: ":"Re: ")+subject;
        Intent intent=new Intent(this,ComposeActivity.class).putExtra("acc",readerItem.getString("acc")).putExtra("to",String.join(", ",recipients)).putExtra("subject",subject).putExtra("body","\n\n—— 原邮件 ——\n"+readerItem.optString("from")+"\n"+decoded.text);if(!forward)intent.putExtra("inReplyTo",decoded.messageId).putExtra("references",decoded.references+" "+decoded.messageId);startActivity(intent);
    }catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    private void readerMenu(){AlertDialog menu=Ui.dialog(this).setItems(new String[]{"标为未读","加星标","取消星标","移动到…","归档","标为垃圾邮件","移到废纸篓","永久删除","保存附件"},(d,index)->{if(index==8){attachments();return;}if(index==7){Ui.dialog(this).setTitle("永久删除这封邮件？").setMessage("此操作不能撤销。").setNegativeButton("取消",null).setPositiveButton("删除",(x,w)->readerAction("delete",null)).show();return;}if(index==6){confirmTrash(List.of(readerItem));return;}if(index==3){try{folders(mail.accounts.account(readerItem.getString("acc")),path->readerAction("move",path));}catch(Exception e){Ui.toast(this,MailClient.error(e));}return;}readerAction(new String[]{"unread","star","unstar","","archive","junk"}[index],null);}).create();showCompactMenu(menu);}
    private void showCompactMenu(AlertDialog menu){menu.show();int width=getWindow().getDecorView().getWidth();if(width==0)width=getResources().getDisplayMetrics().widthPixels;menu.getWindow().setLayout(Math.min(Ui.dp(this,240),Math.max(1,width-Ui.dp(this,48))),WindowManager.LayoutParams.WRAP_CONTENT);}
    private void readerAction(String action,String target){background(()->mail.apply(List.of(readerItem),action,target),()->{if(Set.of("move","archive","junk","delete").contains(action))buildList();Ui.toast(this,"操作已完成");});}
    private void attachments(){if(decoded==null||decoded.attachments.isEmpty()){Ui.toast(this,"此邮件没有可保存的附件");return;}String[] names=new String[decoded.attachments.size()];for(int i=0;i<names.length;i++)names[i]=decoded.attachments.get(i).name;Ui.dialog(this).setTitle("保存附件").setItems(names,(d,index)->saveAttachment(decoded.attachments.get(index))).show();}
    private void saveAttachment(MailClient.Attachment file){pendingAttachment=file.key;startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(file.type.split(";")[0]).putExtra(Intent.EXTRA_TITLE,file.name),44);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==44&&result==RESULT_OK&&data!=null){JSONObject item=readerItem;String key=pendingAttachment;background(()->mail.saveAttachment(item,key,data.getData()),()->Ui.toast(this,"附件已保存"));}}
    private void startImport(){try{if(importer!=null)importer.stop();importer=new ImportServer(mail.accounts,(records,approval)->runOnUiThread(()->{List<String> names=new ArrayList<>();for(int i=0;i<records.length();i++)names.add(records.optJSONObject(i).optString("alias")+" · "+records.optJSONObject(i).optString("email"));Ui.dialog(this).setTitle("导入 "+records.length()+" 个邮箱配置？").setMessage(String.join("\n",names)+"\n\n不包含密码，现有密码会保留。").setNegativeButton("取消",(d,w)->approval.complete(false)).setPositiveButton("导入",(d,w)->{approval.complete(true);handler.postDelayed(()->{if(navigationPage.equals("mailboxes")){drawer();}else render();Ui.toast(this,"配置已导入，请填写授权码");},500);}).setOnCancelListener(d->approval.complete(false)).show();}));importer.start();Ui.toast(this,"已开启电脑配置导入，等待 USB 连接；两分钟后自动关闭");}catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    private void editAccount(JSONObject old){try{
        JSONObject record=old==null?new JSONObject():new JSONObject(old.toString());LinearLayout fields=Ui.column(this);Ui.pad(fields,16);ScrollView scroll=new ScrollView(this);scroll.addView(fields);
        Spinner provider=new Spinner(this);String[] providers={"Gmail","163","QQ","XYNU","自定义"};provider.setAdapter(Ui.choices(this,Arrays.asList(providers)));fields.addView(provider);
        EditText email=Ui.input(this,"完整邮箱地址",record.optString("email"),false);email.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);email.setEnabled(old==null);Ui.field(fields,"邮箱地址",email);
        EditText alias=Ui.input(this,"例如 Gmail 邮箱",record.optString("alias"),false);Ui.field(fields,"邮箱别名",alias);
        EditText password=Ui.input(this,record.optString("secret").isEmpty()?"授权码或应用专用密码":"留空保留已保存的授权码","",true);Ui.field(fields,"授权码 / 应用专用密码",password);
        Button advanced=Ui.button(this,"服务器设置",()->{});fields.addView(advanced);LinearLayout servers=Ui.column(this);servers.setVisibility(View.GONE);fields.addView(servers);advanced.setOnClickListener(v->servers.setVisibility(servers.getVisibility()==View.GONE?View.VISIBLE:View.GONE));
        JSONObject imap=record.optJSONObject("imap"),smtp=record.optJSONObject("smtp");
        EditText imapHost=Ui.input(this,"imap.example.com",imap==null?"imap.gmail.com":imap.optString("host"),false),imapPort=Ui.input(this,"993",imap==null?"993":String.valueOf(imap.optInt("port",993)),false);
        EditText smtpHost=Ui.input(this,"smtp.example.com",smtp==null?"smtp.gmail.com":smtp.optString("host"),false),smtpPort=Ui.input(this,"465",smtp==null?"465":String.valueOf(smtp.optInt("port",465)),false),user=Ui.input(this,"默认使用完整邮箱地址",record.optString("user"),false),name=Ui.input(this,"发件人显示名称",record.optString("name"),false);
        imapPort.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);smtpPort.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);CheckBox imapSSL=new CheckBox(this);imapSSL.setText("IMAP 使用 SSL/TLS（关闭则强制 STARTTLS）");imapSSL.setChecked(imap==null||imap.optBoolean("secure",true));CheckBox smtpSSL=new CheckBox(this);smtpSSL.setText("SMTP 使用 SSL/TLS（关闭则强制 STARTTLS）");smtpSSL.setChecked(smtp==null||smtp.optBoolean("secure",true));
        Ui.field(servers,"IMAP 服务器",imapHost);Ui.field(servers,"IMAP 端口",imapPort);servers.addView(imapSSL);Ui.field(servers,"SMTP 服务器",smtpHost);Ui.field(servers,"SMTP 端口",smtpPort);servers.addView(smtpSSL);Ui.field(servers,"登录用户名",user);Ui.field(servers,"发件人名称",name);
        int index=record.optString("email").endsWith("@163.com")?1:record.optString("email").endsWith("@qq.com")?2:record.optString("email").endsWith("@xynu.edu.cn")?3:0;provider.setSelection(index);final boolean[] first={true};provider.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> p){}public void onItemSelected(AdapterView<?> p,View v,int choice,long id){if(first[0]){first[0]=false;return;}String[] hosts=switch(choice){case 0->new String[]{"imap.gmail.com","smtp.gmail.com"};case 1->new String[]{"imap.163.com","smtp.163.com"};case 2->new String[]{"imap.qq.com","smtp.qq.com"};case 3->new String[]{"imap.exmail.qq.com","smtp.exmail.qq.com"};default->new String[]{"",""};};imapHost.setText(hosts[0]);smtpHost.setText(hosts[1]);imapPort.setText("993");smtpPort.setText("465");imapSSL.setChecked(true);smtpSSL.setChecked(true);if(choice==4)servers.setVisibility(View.VISIBLE);}});
        AlertDialog dialog=Ui.dialog(this).setTitle(old==null?"添加邮箱":"编辑邮箱").setView(scroll).setNegativeButton("取消",null).setNeutralButton("保存配置",null).setPositiveButton("连接",null).create();
        dialog.setOnShowListener(v->{View.OnClickListener save=button->{try{
            String address=email.getText().toString().trim();if(!address.contains("@")){email.setError("请输入完整邮箱地址");return;}int ip=Integer.parseInt(imapPort.getText().toString()),sp=Integer.parseInt(smtpPort.getText().toString());if(ip<1||ip>65535||sp<1||sp>65535||imapHost.getText().toString().trim().isEmpty()||smtpHost.getText().toString().trim().isEmpty())throw new Exception("请检查服务器和端口");
            record.put("email",address).put("alias",alias.getText().toString().trim().isEmpty()?address:alias.getText().toString().trim()).put("user",user.getText().toString().trim().isEmpty()?address:user.getText().toString().trim()).put("name",name.getText().toString()).put("imap",new JSONObject().put("host",imapHost.getText().toString().trim()).put("port",ip).put("secure",imapSSL.isChecked())).put("smtp",new JSONObject().put("host",smtpHost.getText().toString().trim()).put("port",sp).put("secure",smtpSSL.isChecked()));
            String entered=password.getText().toString().replace(" ","");if(button==dialog.getButton(AlertDialog.BUTTON_POSITIVE)&&entered.isEmpty()&&record.optString("secret").isEmpty()){password.setError("请填写授权码或应用专用密码");return;}
            mail.accounts.save(record,entered.isEmpty()&&record.has("secret")?null:entered);JSONObject saved=null;for(JSONObject a:mail.accounts.accounts())if(a.optString("email").equalsIgnoreCase(address)){saved=a;break;}if(saved==null)throw new Exception("保存账户失败");if(!navigationPage.isEmpty()){drawer();}else render();
            if(button==dialog.getButton(AlertDialog.BUTTON_NEUTRAL)){dialog.dismiss();return;}JSONObject target=saved;dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);dialog.getButton(AlertDialog.BUTTON_POSITIVE).setText("连接中…");MailClient.IO.execute(()->{try{mail.test(target);mail.folders(target);runOnUiThread(()->{dialog.dismiss();Ui.toast(this,"连接成功，正在同步");restartBackground();sync();});}catch(Exception e){runOnUiThread(()->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);dialog.getButton(AlertDialog.BUTTON_POSITIVE).setText("连接");Ui.toast(this,MailClient.error(e));});}});
        }catch(Exception e){Ui.toast(this,MailClient.error(e));}};dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(save);dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(save);});dialog.show();dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }catch(Exception e){Ui.toast(this,MailClient.error(e));}}
    @Override public void onBackPressed(){if(!navigationPage.isEmpty()){if(navigationPage.equals("mailboxes"))restoreList();else drawer();return;}if(reader){buildList();return;}if(!selected.isEmpty()){selected.clear();render();return;}super.onBackPressed();}
    private class MailAdapter extends BaseAdapter {
        public int getCount(){return rows.size();}public Object getItem(int p){return rows.get(p);}public long getItemId(int p){return p;}
        public View getView(int position,View reuse,android.view.ViewGroup parent){JSONObject m=rows.get(position);LinearLayout row=Ui.row(MainActivity.this);row.setPadding(Ui.dp(MainActivity.this,12),Ui.dp(MainActivity.this,12),Ui.dp(MainActivity.this,12),Ui.dp(MainActivity.this,12));row.setBackground(Ui.touch(MainActivity.this,selected.contains(key(m))?Ui.TINT:Color.TRANSPARENT,18));
            try{
                boolean marked=!drafts&&selected.contains(key(m));
                if(!drafts&&!selected.isEmpty()){
                    ImageView check=new ImageView(MainActivity.this);check.setImageDrawable(new MailIcon(MailIcon.CHECK,marked?Color.WHITE:Ui.BORDER));check.setPadding(Ui.dp(MainActivity.this,5),Ui.dp(MainActivity.this,5),Ui.dp(MainActivity.this,5),Ui.dp(MainActivity.this,5));
                    android.graphics.drawable.GradientDrawable circle=Ui.rounded(marked?Ui.BLUE:Color.TRANSPARENT,14,MainActivity.this);if(!marked)circle.setStroke(Ui.dp(MainActivity.this,1.5f),Ui.BORDER);check.setBackground(circle);check.setContentDescription((marked?"已选择邮件：":"未选择邮件：")+m.optString("subject"));
                    LinearLayout.LayoutParams checkParams=new LinearLayout.LayoutParams(Ui.dp(MainActivity.this,28),Ui.dp(MainActivity.this,28));checkParams.rightMargin=Ui.dp(MainActivity.this,12);row.addView(check,checkParams);
                }
            }catch(Exception ignored){}
            LinearLayout text=Ui.column(MainActivity.this);LinearLayout first=Ui.row(MainActivity.this);TextView from=Ui.text(MainActivity.this,(m.optBoolean("seen")||drafts?"":"•  ")+(drafts?"收件人："+(m.optString("to").isEmpty()?"（未填写）":m.optString("to")):MailClient.clean(m.optString("from"))),15,Ui.TEXT);from.setSingleLine(true);from.setEllipsize(android.text.TextUtils.TruncateAt.END);if(!m.optBoolean("seen")&&!drafts)from.setTypeface(null,android.graphics.Typeface.BOLD);first.addView(from,new LinearLayout.LayoutParams(0,-2,1));TextView date=Ui.text(MainActivity.this,new SimpleDateFormat("MM-dd HH:mm",Locale.getDefault()).format(new Date(m.optLong("date",m.optLong("updated",System.currentTimeMillis())))),11,Ui.MUTED);first.addView(date);text.addView(first);
            TextView subject=Ui.text(MainActivity.this,(m.optBoolean("starred")?"★ ":"")+(m.optString("subject").isEmpty()?"（无主题）":m.optString("subject")),15,Ui.TEXT);subject.setSingleLine(true);subject.setEllipsize(android.text.TextUtils.TruncateAt.END);if(!m.optBoolean("seen")&&!drafts)subject.setTypeface(null,android.graphics.Typeface.BOLD);LinearLayout.LayoutParams subjectParams=new LinearLayout.LayoutParams(-1,-2);subjectParams.topMargin=Ui.dp(MainActivity.this,5);text.addView(subject,subjectParams);
            LinearLayout last=Ui.row(MainActivity.this);TextView preview=Ui.text(MainActivity.this,drafts?m.optString("body"):m.optString("preview"),14,Ui.MUTED);preview.setSingleLine(true);preview.setEllipsize(android.text.TextUtils.TruncateAt.END);last.addView(preview,new LinearLayout.LayoutParams(0,-2,1));
            try{
                JSONObject account=mail.accounts.account(m.optString("acc"));TextView tag=Ui.text(MainActivity.this,drafts?"本地草稿":AccountStore.alias(account).replace(" 邮箱",""),11,AccountStore.color(account));
                tag.setSingleLine(true);tag.setEllipsize(android.text.TextUtils.TruncateAt.END);tag.setGravity(Gravity.CENTER);
                tag.setPadding(Ui.dp(MainActivity.this,7),Ui.dp(MainActivity.this,3),Ui.dp(MainActivity.this,7),Ui.dp(MainActivity.this,3));
                tag.setBackground(Ui.rounded((AccountStore.color(account)&0xFFFFFF)|0x18000000,6,MainActivity.this));
                last.addView(tag,new LinearLayout.LayoutParams(Ui.dp(MainActivity.this,56),-2));
            }catch(Exception ignored){}
            LinearLayout.LayoutParams lastParams=new LinearLayout.LayoutParams(-1,-2);lastParams.topMargin=Ui.dp(MainActivity.this,6);text.addView(last,lastParams);row.addView(text,new LinearLayout.LayoutParams(0,-2,1));return row;}
    }
}
