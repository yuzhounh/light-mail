package com.yuzhounh.lightmail;

import android.app.*;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.provider.OpenableColumns;
import android.text.Editable;
import android.text.TextWatcher;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.*;

public class ComposeActivity extends Activity {
    private MailClient mail;
    private JSONObject draft;
    private Spinner from;
    private EditText to,cc,bcc,subject,body;
    private TextView status,attachmentsView;
    private Button send;
    private int pendingAttachments=0;
    private List<JSONObject> accounts=new ArrayList<>();
    private final Handler handler=new Handler(android.os.Looper.getMainLooper());
    private boolean ready=false,sending=false,finished=false;
    private final Runnable autosave=()->save(false);
    @Override public void onCreate(Bundle state){super.onCreate(state);mail=MailClient.get(this);
        try{
            accounts=mail.accounts.accounts();if(accounts.isEmpty()){Ui.toast(this,"请先添加邮箱");finish();return;}
            String id=state!=null?state.getString("draftId"):getIntent().getStringExtra("draftId");draft=id==null?null:mail.cache.draft(id);
            if(draft==null){draft=new JSONObject().put("id",UUID.randomUUID().toString()).put("acc",getIntent().getStringExtra("acc")==null?accounts.get(0).getString("id"):getIntent().getStringExtra("acc")).put("attachments",new JSONArray());
                for(String key:new String[]{"to","cc","bcc","subject","body","inReplyTo","references"})draft.put(key,Objects.toString(getIntent().getStringExtra(key),""));
                if(Intent.ACTION_SENDTO.equals(getIntent().getAction())&&getIntent().getData()!=null){Uri uri=getIntent().getData();draft.put("to",uri.getSchemeSpecificPart().split("\\?")[0]);}
            }
            build();ready=true;
        }catch(Exception e){Ui.toast(this,MailClient.error(e));finish();}
    }
    private void build() throws Exception {
        LinearLayout root=Ui.column(this),bar=Ui.row(this);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,12),Ui.dp(this,6));bar.addView(Ui.icon(this,android.R.drawable.ic_menu_revert,"关闭并保存草稿",this::finish));TextView heading=Ui.title(this,"写邮件");bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));bar.addView(Ui.icon(this,android.R.drawable.ic_menu_add,"添加附件",this::attach));send=Ui.primary(this,"发送",MailIcon.SEND,this::send);bar.addView(send,new LinearLayout.LayoutParams(-2,Ui.dp(this,44)));root.addView(bar);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackground(Ui.rounded(android.graphics.Color.WHITE,24,this));scroll.setClipToOutline(true);LinearLayout fields=Ui.column(this);Ui.pad(fields,18);scroll.addView(fields);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        from=new Spinner(this);List<String> names=new ArrayList<>();int selected=0;for(int i=0;i<accounts.size();i++){JSONObject a=accounts.get(i);names.add(AccountStore.alias(a)+" · "+a.optString("email"));if(a.getString("id").equals(draft.getString("acc")))selected=i;}
        from.setAdapter(Ui.choices(this,names));from.setSelection(selected);fields.addView(from,new LinearLayout.LayoutParams(-1,Ui.dp(this,48)));
        to=Ui.input(this,"收件人，多个用逗号分隔",draft.optString("to"),false);to.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);fields.addView(to);
        Button more=Ui.button(this,"抄送 / 密送",()->{cc.setVisibility(cc.getVisibility()==android.view.View.GONE?android.view.View.VISIBLE:android.view.View.GONE);bcc.setVisibility(cc.getVisibility());});fields.addView(more);
        cc=Ui.input(this,"抄送",draft.optString("cc"),false);bcc=Ui.input(this,"密送",draft.optString("bcc"),false);cc.setVisibility(draft.optString("cc").isEmpty()?android.view.View.GONE:android.view.View.VISIBLE);bcc.setVisibility(draft.optString("bcc").isEmpty()?android.view.View.GONE:android.view.View.VISIBLE);fields.addView(cc);fields.addView(bcc);
        subject=Ui.input(this,"主题",draft.optString("subject"),false);subject.setTextSize(18);fields.addView(subject);
        body=Ui.input(this,"写下邮件正文…",draft.optString("body"),false);body.setSingleLine(false);body.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE|android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);body.setGravity(android.view.Gravity.TOP);body.setBackgroundColor(android.graphics.Color.WHITE);
        body.setMinHeight(Ui.dp(this,260));body.setTextSize(16);fields.addView(body,new LinearLayout.LayoutParams(-1,-2));
        attachmentsView=Ui.text(this,"",13,Ui.MUTED);Ui.pad(attachmentsView,10);fields.addView(attachmentsView);attachmentsView.setOnClickListener(v->removeAttachment());refreshAttachments();
        LinearLayout footer=Ui.row(this);Ui.pad(footer,6);footer.addView(Ui.icon(this,android.R.drawable.ic_menu_delete,"放弃草稿",this::discard));status=Ui.text(this,"输入后自动保存到本机",12,Ui.MUTED);status.setGravity(android.view.Gravity.END);footer.addView(status,new LinearLayout.LayoutParams(0,-2,1));footer.setPadding(Ui.dp(this,8),0,Ui.dp(this,18),0);root.addView(footer);Ui.root(this,root);
        TextWatcher watcher=new TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){if(ready){status.setText("正在保存…");handler.removeCallbacks(autosave);handler.postDelayed(autosave,250);}}public void afterTextChanged(Editable e){}};
        for(EditText input:new EditText[]{to,cc,bcc,subject,body})input.addTextChangedListener(watcher);
        from.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> p,android.view.View v,int position,long id){if(ready)save(false);}public void onNothingSelected(AdapterView<?> p){}});
    }
    private boolean save(boolean requireContent){
        if(!ready||finished||sending)return true;
        try{
            draft.put("acc",accounts.get(from.getSelectedItemPosition()).getString("id"));draft.put("to",to.getText().toString());draft.put("cc",cc.getText().toString());draft.put("bcc",bcc.getText().toString());draft.put("subject",subject.getText().toString());draft.put("body",body.getText().toString());
            boolean content=!draft.optString("to").isEmpty()||!draft.optString("cc").isEmpty()||!draft.optString("bcc").isEmpty()||!draft.optString("subject").isEmpty()||!draft.optString("body").isEmpty()||draft.getJSONArray("attachments").length()>0;
            if(content||mail.cache.draft(draft.getString("id"))!=null)mail.cache.saveDraft(draft);
            status.setText(pendingAttachments>0?"正在添加附件…":content?"草稿已保存":"输入后自动保存到本机");return true;
        }catch(Exception e){status.setText("保存失败，请勿关闭");Ui.toast(this,"草稿保存失败");return false;}
    }
    private void discard(){if(sending)return;if(pendingAttachments>0){Ui.toast(this,"正在添加附件，请稍候");return;}Ui.dialog(this).setTitle("放弃草稿？").setMessage("此操作会删除这封本地草稿。") .setNegativeButton("继续编辑",null).setPositiveButton("放弃草稿",(d,w)->{try{mail.cache.deleteDraft(draft.getString("id"));finished=true;mail.changed();finish();}catch(Exception e){Ui.toast(this,MailClient.error(e));}}).show();}
    private void attach(){if(sending)return;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");startActivityForResult(intent,101);}
    private void refreshAttachments(){JSONArray files=draft.optJSONArray("attachments");List<String> names=new ArrayList<>();if(files!=null)for(int i=0;i<files.length();i++)names.add(files.optJSONObject(i).optString("name"));attachmentsView.setText(String.join(" · ",names));attachmentsView.setVisibility(names.isEmpty()?android.view.View.GONE:android.view.View.VISIBLE);}
    private void removeAttachment(){JSONArray files=draft.optJSONArray("attachments");if(files==null)return;String[] names=new String[files.length()];for(int i=0;i<files.length();i++)names[i]=files.optJSONObject(i).optString("name");Ui.dialog(this).setTitle("移除附件").setItems(names,(d,index)->{files.remove(index);refreshAttachments();save(false);}).show();}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==101&&result==RESULT_OK&&data!=null){
        Uri uri=data.getData();if(uri==null)return;pendingAttachments++;send.setEnabled(false);status.setText("正在添加附件…");MailClient.USER.execute(()->{File file=null;try{
            String name="附件";try(Cursor c=getContentResolver().query(uri,null,null,null,null)){if(c!=null&&c.moveToFirst()){int index=c.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(index>=0)name=c.getString(index);}}
            File folder=new File(getFilesDir(),"draft-attachments");folder.mkdirs();file=new File(folder,UUID.randomUUID().toString());
            try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(file)){byte[] buffer=new byte[16384];long total=0;int n;while((n=in.read(buffer))!=-1){total+=n;if(total>20L*1024*1024){file.delete();throw new Exception("单个附件不能超过20 MB");}out.write(buffer,0,n);}}
            JSONObject attachment=new JSONObject().put("path",file.getAbsolutePath()).put("name",name).put("size",file.length());runOnUiThread(()->{pendingAttachments--;send.setEnabled(pendingAttachments==0&&!sending);draft.optJSONArray("attachments").put(attachment);refreshAttachments();save(false);});
        }catch(Exception e){if(file!=null)file.delete();runOnUiThread(()->{pendingAttachments--;send.setEnabled(pendingAttachments==0&&!sending);status.setText("附件添加失败，草稿已保留");Ui.toast(this,MailClient.error(e));});}});
    }}
    private void send(){
        if(sending||pendingAttachments>0||!save(true))return;
        if(draft.optString("to").trim().isEmpty()){to.setError("请输入收件人");return;}
        handler.removeCallbacks(autosave);sending=true;send.setEnabled(false);for(EditText input:new EditText[]{to,cc,bcc,subject,body})input.setEnabled(false);from.setEnabled(false);status.setText("正在发送…");
        final JSONObject snapshot;try{snapshot=new JSONObject(draft.toString());}catch(Exception e){sending=false;return;}
        MailClient.USER.execute(()->{try{boolean saved=mail.send(snapshot);runOnUiThread(()->{finished=true;sending=false;Ui.toast(this,saved?"邮件已发送":"邮件已发送，已发送文件夹保存失败，请勿重复发送");finish();});}catch(Exception e){runOnUiThread(()->{sending=false;send.setEnabled(true);for(EditText input:new EditText[]{to,cc,bcc,subject,body})input.setEnabled(true);from.setEnabled(true);status.setText("发送失败，草稿已保留");Ui.toast(this,MailClient.error(e));});}});
    }
    @Override protected void onSaveInstanceState(Bundle state){if(ready&&!finished){save(false);state.putString("draftId",draft.optString("id"));}super.onSaveInstanceState(state);}
    @Override protected void onPause(){handler.removeCallbacks(autosave);if(!finished&&!sending)save(false);super.onPause();}
    @Override public void finish(){if(sending){Ui.toast(this,"正在发送，请稍候");return;}if(pendingAttachments>0){Ui.toast(this,"正在添加附件，请稍候");return;}if(ready&&!finished&&!save(false))return;super.finish();}
}
