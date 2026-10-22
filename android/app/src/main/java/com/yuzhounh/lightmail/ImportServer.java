package com.yuzhounh.lightmail;

import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

final class ImportServer {
    interface Confirm { void show(JSONArray accounts,CompletableFuture<Boolean> accepted); }
    private ServerSocket server;
    private volatile boolean stopped;
    private final AccountStore store;
    private final Confirm confirm;
    ImportServer(AccountStore s,Confirm c){store=s;confirm=c;}
    void start() throws Exception {
        server=new ServerSocket();server.setReuseAddress(true);server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),48765));server.setSoTimeout(120000);
        Thread thread=new Thread(()->{while(!stopped){try(Socket socket=server.accept()){
            socket.setSoTimeout(10000);InputStream in=socket.getInputStream();ByteArrayOutputStream header=new ByteArrayOutputStream();int value;String text="";
            while((value=in.read())!=-1){header.write(value);if(header.size()>8192)throw new IOException("Header too long");text=header.toString("US-ASCII");if(text.endsWith("\r\n\r\n"))break;}
            String answer;int status=200;
            if(text.startsWith("GET /info "))answer=new JSONObject().put("app","Light Mail").put("version","0.1.5").put("configurationOnly",true).toString();
            else if(text.startsWith("POST /accounts ")){
                int length=-1;for(String line:text.split("\r\n"))if(line.toLowerCase().startsWith("content-length:"))length=Integer.parseInt(line.substring(line.indexOf(':')+1).trim());
                if(length<0||length>65536)throw new IOException("Invalid payload size");byte[] bytes=new byte[length];int read=0,n;while(read<length&&(n=in.read(bytes,read,length-read))>0)read+=n;if(read!=length)throw new EOFException();
                JSONArray accounts=new JSONObject(new String(bytes,StandardCharsets.UTF_8)).getJSONArray("accounts");if(accounts.length()>20)throw new IOException("Too many accounts");
                CompletableFuture<Boolean> approval=new CompletableFuture<>();confirm.show(accounts,approval);
                if(approval.get(90,TimeUnit.SECONDS)){store.importConfiguration(accounts);answer=new JSONObject().put("imported",accounts.length()).put("passwordsImported",false).toString();}
                else {status=409;answer="{\"error\":\"Import cancelled\"}";}
            }else{status=404;answer="{}";}
            byte[] body=answer.getBytes(StandardCharsets.UTF_8);OutputStream out=socket.getOutputStream();out.write(("HTTP/1.1 "+status+" OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
        }catch(Exception error){if(!(error instanceof SocketTimeoutException))android.util.Log.w("LightMail","Configuration import did not complete");break;}}stop();},"LightMail-configuration-import");thread.setDaemon(true);thread.start();
    }
    void stop(){stopped=true;if(server!=null)try{server.close();}catch(IOException ignored){}}
}
