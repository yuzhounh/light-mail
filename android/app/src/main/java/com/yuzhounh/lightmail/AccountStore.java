package com.yuzhounh.lightmail;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AccountStore {
    private final SharedPreferences preferences;
    AccountStore(Context context) { preferences=context.getSharedPreferences("lightmail",Context.MODE_PRIVATE); }
    SharedPreferences prefs() { return preferences; }
    synchronized List<JSONObject> accounts() throws Exception {
        JSONArray array=new JSONArray(preferences.getString("accounts","[]"));
        List<JSONObject> result=new ArrayList<>();
        for(int i=0;i<array.length();i++) result.add(array.getJSONObject(i));
        return result;
    }
    synchronized JSONObject account(String id) throws Exception {
        for(JSONObject a:accounts()) if(a.getString("id").equals(id)) return a;
        throw new Exception("邮箱不存在");
    }
    String password(JSONObject a) throws Exception {
        String value=a.optString("secret");
        if(value.isEmpty()) return "";
        String[] parts=value.split(":");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8);
    }
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias("lightmail-accounts")) {
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("lightmail-accounts",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey("lightmail-accounts",null);
    }
    synchronized void save(JSONObject record,String password) throws Exception {
        JSONObject a=new JSONObject(record.toString());
        if(a.optString("email").trim().isEmpty()) throw new Exception("请输入邮箱地址");
        if(a.optString("id").isEmpty()) a.put("id",UUID.randomUUID().toString());
        if(password!=null) {
            if(password.isEmpty()) a.remove("secret");
            else {
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
                a.put("secret",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(password.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP));
            }
        }
        a.remove("pass");a.remove("password");
        List<JSONObject> list=accounts();boolean found=false;
        for(int i=0;i<list.size();i++) if(list.get(i).getString("id").equals(a.getString("id"))) { list.set(i,a);found=true; }
        if(!found) list.add(a);
        persist(list);
    }
    synchronized void importConfiguration(JSONArray records) throws Exception {
        List<JSONObject> existing=accounts();
        for(int i=0;i<records.length();i++) {
            JSONObject input=records.getJSONObject(i),a=new JSONObject();
            String email=input.getString("email").trim();if(!email.contains("@")) throw new Exception("邮箱配置无效");
            a.put("id",input.optString("id",UUID.randomUUID().toString()));
            a.put("email",email);a.put("user",input.optString("user",email));a.put("name",input.optString("name",""));
            a.put("alias",input.optString("alias",email));
            for(String protocol:new String[]{"imap","smtp"}) {
                JSONObject server=input.getJSONObject(protocol);int port=server.getInt("port");
                if(port<1||port>65535||server.optString("host").trim().isEmpty())throw new Exception("服务器配置无效");
                a.put(protocol,new JSONObject().put("host",server.getString("host")).put("port",port).put("secure",server.optBoolean("secure",true)));
            }
            for(JSONObject old:existing) if(old.optString("email").equalsIgnoreCase(email)){a.put("id",old.getString("id"));if(old.has("secret"))a.put("secret",old.getString("secret"));break;}
            save(a,null);
        }
    }
    synchronized void remove(String id) throws Exception { List<JSONObject> list=accounts();list.removeIf(a->a.optString("id").equals(id));persist(list); }
    synchronized void move(String id,int direction) throws Exception {
        List<JSONObject> list=accounts();for(int i=0;i<list.size();i++)if(list.get(i).optString("id").equals(id)){int target=i+direction;if(target>=0&&target<list.size())java.util.Collections.swap(list,i,target);break;}persist(list);
    }
    private void persist(List<JSONObject> list) throws Exception {
        JSONArray array=new JSONArray();for(JSONObject a:list)array.put(a);
        if(!preferences.edit().putString("accounts",array.toString()).commit())throw new Exception("保存失败，请重试");
    }
    static String alias(JSONObject a) { return a.optString("alias",a.optString("email")); }
    static int color(JSONObject a) {
        String email=a.optString("email").toLowerCase();
        return android.graphics.Color.parseColor(email.endsWith("@gmail.com")?"#C34C43":email.endsWith("@163.com")?"#AE3442":email.endsWith("@qq.com")?"#1675AE":"#315F96");
    }
}
