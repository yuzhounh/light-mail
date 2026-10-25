package com.yuzhounh.lightmail;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class MailCache extends SQLiteOpenHelper {
    private final Context context;
    MailCache(Context c){super(c,"mail.db",null,2);context=c.getApplicationContext();setWriteAheadLoggingEnabled(true);}
    @Override public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE messages(acc TEXT, folder TEXT, uid INTEGER, validity TEXT, date INTEGER, data TEXT, PRIMARY KEY(acc,folder,uid))");
        db.execSQL("CREATE INDEX message_date ON messages(date DESC)");
        db.execSQL("CREATE TABLE folders(acc TEXT PRIMARY KEY,data TEXT)");
        db.execSQL("CREATE TABLE generations(acc TEXT,folder TEXT,validity TEXT,PRIMARY KEY(acc,folder))");
        db.execSQL("CREATE TABLE drafts(id TEXT PRIMARY KEY,acc TEXT,data TEXT,updated INTEGER)");
        indexes(db);
    }
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){if(oldVersion<2)indexes(db);}
    private static void indexes(SQLiteDatabase db){db.execSQL("CREATE INDEX IF NOT EXISTS message_folder_date ON messages(acc,folder,date DESC)");db.execSQL("CREATE INDEX IF NOT EXISTS message_inbox_date ON messages(folder,date DESC)");}
    synchronized void generation(String acc,String folder,String validity){
        SQLiteDatabase db=getWritableDatabase();try(Cursor c=db.rawQuery("SELECT validity FROM generations WHERE acc=? AND folder=?",new String[]{acc,folder})){
            if(c.moveToFirst()&&!validity.equals(c.getString(0))){deleteBodies(db.rawQuery("SELECT acc,folder,validity,uid FROM messages WHERE acc=? AND folder=?",new String[]{acc,folder}));db.delete("messages","acc=? AND folder=?",new String[]{acc,folder});}
        }
        ContentValues v=new ContentValues();v.put("acc",acc);v.put("folder",folder);v.put("validity",validity);db.insertWithOnConflict("generations",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    synchronized void put(JSONObject item) throws Exception {
        ContentValues v=new ContentValues();v.put("acc",item.getString("acc"));v.put("folder",item.getString("folder"));v.put("uid",item.getLong("uid"));v.put("validity",item.getString("validity"));v.put("date",item.optLong("date"));v.put("data",item.toString());
        getWritableDatabase().insertWithOnConflict("messages",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    /** One transaction for a whole sync window instead of a journal commit per message. */
    synchronized void putAll(List<JSONObject> items) throws Exception {
        if(items.isEmpty())return;SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{for(JSONObject item:items)put(item);db.setTransactionSuccessful();}finally{db.endTransaction();}
    }
    synchronized List<JSONObject> list(String acc,String folder,String search,boolean unread,int limit) throws Exception {
        List<JSONObject> result=new ArrayList<>();String selection=acc==null?"folder='INBOX'":"acc=? AND folder=?";
        String[] args=acc==null?null:new String[]{acc,folder};
        // Apply filters before the result limit, including matches in older cached mail.
        String scanLimit=search.isEmpty()&&!unread?String.valueOf(limit):null;
        String needle=search.toLowerCase(java.util.Locale.ROOT);
        try(Cursor c=getReadableDatabase().query("messages",new String[]{"data"},selection,args,null,null,"date DESC",scanLimit)){
            while(c.moveToNext()){JSONObject m=new JSONObject(c.getString(0));String text=(m.optString("from")+" "+m.optString("subject")+" "+m.optString("preview")).toLowerCase(java.util.Locale.ROOT);if((!unread||!m.optBoolean("seen"))&&(needle.isEmpty()||text.contains(needle)))result.add(m);if(result.size()>=limit)break;}
        }return result;
    }
    synchronized void update(String acc,String folder,long uid,String key,boolean value) throws Exception {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM messages WHERE acc=? AND folder=? AND uid=?",new String[]{acc,folder,String.valueOf(uid)})){
            if(c.moveToFirst()){JSONObject m=new JSONObject(c.getString(0));m.put(key,value);put(m);}
        }
    }
    synchronized void remove(String acc,String folder,long uid){String[] args={acc,folder,String.valueOf(uid)};deleteBodies(getReadableDatabase().rawQuery("SELECT acc,folder,validity,uid FROM messages WHERE acc=? AND folder=? AND uid=?",args));getWritableDatabase().delete("messages","acc=? AND folder=? AND uid=?",args);}
    /** Cached message bodies are removed together with their rows so deleted mail does not accumulate on disk. */
    private void deleteBodies(Cursor rows){try(Cursor c=rows){while(c.moveToNext()){try{File file=body(new JSONObject().put("acc",c.getString(0)).put("folder",c.getString(1)).put("validity",c.getString(2)).put("uid",c.getLong(3)));if(file.isFile()&&!file.delete())android.util.Log.w("LightMail","Unable to remove a cached message body");}catch(Exception ignored){}}}}
    synchronized JSONObject get(String acc,String folder,long uid) throws Exception {try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM messages WHERE acc=? AND folder=? AND uid=?",new String[]{acc,folder,String.valueOf(uid)})){return c.moveToFirst()?new JSONObject(c.getString(0)):null;}}
    synchronized long[] uids(String acc,String folder){List<Long> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT uid FROM messages WHERE acc=? AND folder=?",new String[]{acc,folder})){while(c.moveToNext())out.add(c.getLong(0));}long[] result=new long[out.size()];for(int i=0;i<result.length;i++)result[i]=out.get(i);return result;}
    synchronized void folderUnread(String acc,String folder,int unread) throws Exception {JSONArray list=folders(acc);boolean changed=false;for(int i=0;i<list.length();i++){JSONObject f=list.getJSONObject(i);if(f.optString("path").equals(folder)&&f.optInt("unread")!=unread){f.put("unread",unread);changed=true;}}if(changed)saveFolders(acc,list);}
    synchronized void reconcile(String acc,String folder,java.util.Set<Long> serverUids){List<Long> removed=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT uid FROM messages WHERE acc=? AND folder=?",new String[]{acc,folder})){while(c.moveToNext())if(!serverUids.contains(c.getLong(0)))removed.add(c.getLong(0));}for(long uid:removed)remove(acc,folder,uid);}
    synchronized void saveFolders(String acc,JSONArray folders){ContentValues v=new ContentValues();v.put("acc",acc);v.put("data",folders.toString());getWritableDatabase().insertWithOnConflict("folders",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    synchronized JSONArray folders(String acc) throws Exception {try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM folders WHERE acc=?",new String[]{acc})){return c.moveToFirst()?new JSONArray(c.getString(0)):new JSONArray();}}
    File body(JSONObject item) throws Exception {
        String key=item.getString("acc")+"|"+item.getString("folder")+"|"+item.getString("validity")+"|"+item.getLong("uid");
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder name=new StringBuilder();for(byte b:digest)name.append(String.format("%02x",b));
        File directory=new File(context.getFilesDir(),"messages");if(!directory.exists()&&!directory.mkdirs())throw new Exception("无法建立缓存目录");return new File(directory,name+".eml");
    }
    synchronized void saveDraft(JSONObject draft) throws Exception {draft.put("updated",System.currentTimeMillis());ContentValues v=new ContentValues();v.put("id",draft.getString("id"));v.put("acc",draft.getString("acc"));v.put("data",draft.toString());v.put("updated",System.currentTimeMillis());getWritableDatabase().insertWithOnConflict("drafts",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    synchronized JSONObject draft(String id) throws Exception {try(Cursor c=getReadableDatabase().rawQuery("SELECT data FROM drafts WHERE id=?",new String[]{id})){return c.moveToFirst()?new JSONObject(c.getString(0)):null;}}
    synchronized List<JSONObject> drafts(String acc) throws Exception {List<JSONObject> out=new ArrayList<>();try(Cursor c=getReadableDatabase().query("drafts",new String[]{"data"},acc==null?null:"acc=?",acc==null?null:new String[]{acc},null,null,"updated DESC")){while(c.moveToNext())out.add(new JSONObject(c.getString(0)));}return out;}
    synchronized void deleteDraft(String id) {
        Set<File> unused=new HashSet<>();
        try{
            JSONObject removed=draft(id);if(removed==null)return;
            unused=draftAttachmentCopies(removed);
            // Resolve references before deleting anything; shared copies belong to the surviving drafts.
            for(JSONObject other:drafts(null))if(!id.equals(other.getString("id")))unused.removeAll(draftAttachmentCopies(other));
        }catch(Exception error){
            unused.clear();android.util.Log.w("LightMail","Draft attachment cleanup skipped because references could not be verified");
        }
        if(getWritableDatabase().delete("drafts","id=?",new String[]{id})==0)return;
        for(File file:unused)if(file.isFile()&&!file.delete())android.util.Log.w("LightMail","Unable to remove a discarded draft attachment copy");
    }
    private Set<File> draftAttachmentCopies(JSONObject draft) throws IOException {
        Set<File> files=new HashSet<>();JSONArray attachments=draft.optJSONArray("attachments");if(attachments==null)return files;
        File directory=new File(context.getFilesDir(),"draft-attachments").getCanonicalFile();
        for(int i=0;i<attachments.length();i++){
            JSONObject item=attachments.optJSONObject(i);if(item==null||item.optString("path").isEmpty())continue;
            File file=new File(item.optString("path")).getCanonicalFile();
            // Never remove an original document or anything outside our private copy directory.
            if(directory.equals(file.getParentFile()))files.add(file);
        }return files;
    }
}
