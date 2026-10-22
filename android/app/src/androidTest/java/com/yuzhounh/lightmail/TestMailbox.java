package com.yuzhounh.lightmail;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;

/** Local TLS IMAP/SMTP fixture. No connection to a real mail provider. */
final class TestMailbox implements AutoCloseable {
    final SSLServerSocket imap,smtp;
    final SSLSocketFactory clientFactory;
    final ExecutorService threads=Executors.newCachedThreadPool();
    final List<Socket> sockets=new CopyOnWriteArrayList<>();
    volatile long uid=1;
    volatile boolean seen=false,star=false,failAuth=false;
    volatile int exists=1,stores=0,moves=0;
    volatile String received="";
    private final String raw="From: sender@example.test\r\nTo: receiver@example.test\r\nSubject: Protocol test\r\nMessage-ID: <fixture@example.test>\r\nDate: Mon, 19 Oct 2026 12:00:00 +0800\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nBackground cached body.\r\n";
    TestMailbox(Context testContext) throws Exception {
        KeyStore keys=KeyStore.getInstance("PKCS12");try(InputStream in=testContext.getAssets().open("test-tls.p12")){keys.load(in,"test-only-password".toCharArray());}
        KeyManagerFactory km=KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());km.init(keys,"test-only-password".toCharArray());TrustManagerFactory tm=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());tm.init(keys);
        SSLContext tls=SSLContext.getInstance("TLS");tls.init(km.getKeyManagers(),tm.getTrustManagers(),null);clientFactory=tls.getSocketFactory();
        imap=(SSLServerSocket)tls.getServerSocketFactory().createServerSocket(0,10,InetAddress.getByName("127.0.0.1"));smtp=(SSLServerSocket)tls.getServerSocketFactory().createServerSocket(0,10,InetAddress.getByName("127.0.0.1"));
        accept(imap,false);accept(smtp,true);
    }
    private void accept(SSLServerSocket server,boolean isSmtp){threads.execute(()->{while(!server.isClosed())try{Socket socket=server.accept();sockets.add(socket);threads.execute(()->{try{socket.setSoTimeout(20000);if(isSmtp)smtp(socket);else imap(socket);}catch(Exception ignored){}finally{sockets.remove(socket);try{socket.close();}catch(Exception ignored){}}});}catch(IOException e){break;}});}
    private static void send(OutputStream out,String value) throws Exception {out.write(value.getBytes(StandardCharsets.UTF_8));out.flush();}
    private void imap(Socket socket) throws Exception {
        BufferedReader in=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII));OutputStream out=socket.getOutputStream();
        send(out,"* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN UIDPLUS MOVE UNSELECT ID] Local test\r\n");String line;
        while((line=in.readLine())!=null){String[] words=line.split(" ",3);if(words.length<2)continue;String tag=words[0],cmd=words[1].toUpperCase(Locale.ROOT),arg=words.length>2?words[2]:"",u=arg.toUpperCase(Locale.ROOT);
            switch(cmd){
                case "CAPABILITY":send(out,"* CAPABILITY IMAP4rev1 AUTH=PLAIN UIDPLUS MOVE UNSELECT ID\r\n"+tag+" OK capability\r\n");break;
                case "AUTHENTICATE":if(!arg.contains(" ")){send(out,"+ \r\n");in.readLine();}send(out,tag+(failAuth?" NO [AUTHENTICATIONFAILED] Invalid test credential\r\n":" OK authenticated\r\n"));break;
                case "LOGIN":send(out,tag+(failAuth?" NO [AUTHENTICATIONFAILED] Invalid test credential\r\n":" OK authenticated\r\n"));break;
                case "ID":send(out,"* ID NIL\r\n"+tag+" OK id\r\n");break;
                case "LIST":case "LSUB":
                    String[][] folders={{"INBOX","\\Inbox"},{"Sent","\\Sent"},{"Drafts","\\Drafts"},{"Trash","\\Trash"},{"Archive","\\Archive"},{"Junk","\\Junk"}};
                    for(String[] f:folders)if(arg.contains("*")||arg.endsWith('"'+f[0]+'"')||arg.endsWith(" "+f[0]))send(out,"* LIST (\\HasNoChildren "+f[1]+") \"/\" \""+f[0]+"\"\r\n");send(out,tag+" OK list\r\n");break;
                case "EXAMINE":case "SELECT":send(out,"* FLAGS (\\Seen \\Flagged \\Deleted)\r\n* "+exists+" EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 7] generation\r\n* OK [UIDNEXT "+(uid+1)+"] next\r\n* OK [PERMANENTFLAGS (\\Seen \\Flagged \\Deleted)] flags\r\n"+tag+" OK ["+(cmd.equals("EXAMINE")?"READ-ONLY":"READ-WRITE")+"] opened\r\n");break;
                case "STATUS":send(out,"* STATUS INBOX (MESSAGES "+exists+" RECENT 0 UIDNEXT "+(uid+1)+" UIDVALIDITY 7 UNSEEN "+(seen?0:exists)+")\r\n"+tag+" OK status\r\n");break;
                case "UID":
                    if(u.startsWith("FETCH"))fetch(out,tag,arg);
                    else if(u.startsWith("STORE")){stores++;if(u.contains("\\SEEN"))seen=!u.contains("-FLAGS");if(u.contains("\\FLAGGED"))star=!u.contains("-FLAGS");send(out,"* 1 FETCH (UID "+uid+" FLAGS ("+(seen?"\\Seen ":"")+(star?"\\Flagged":"")+"))\r\n"+tag+" OK flags\r\n");}
                    else if(u.startsWith("MOVE")||u.startsWith("EXPUNGE")){moves++;exists=0;send(out,"* 1 EXPUNGE\r\n"+tag+" OK moved\r\n");}
                    else if(u.startsWith("SEARCH"))send(out,"* SEARCH "+uid+"\r\n"+tag+" OK search\r\n");
                    else send(out,tag+" OK uid\r\n");break;
                case "FETCH":fetch(out,tag,arg);break;
                case "STORE":stores++;if(u.contains("\\SEEN"))seen=!u.contains("-FLAGS");if(u.contains("\\FLAGGED"))star=!u.contains("-FLAGS");send(out,"* 1 FETCH (UID "+uid+" FLAGS ("+(seen?"\\Seen ":"")+(star?"\\Flagged":"")+"))\r\n"+tag+" OK flags\r\n");break;
                case "MOVE":moves++;exists=0;send(out,"* 1 EXPUNGE\r\n"+tag+" OK moved\r\n");break;
                case "LOGOUT":send(out,"* BYE closing\r\n"+tag+" OK logout\r\n");return;
                default:send(out,tag+" OK completed\r\n");
            }
        }
    }
    private void fetch(OutputStream out,String tag,String arg) throws Exception {
        String u=arg.toUpperCase(Locale.ROOT);if(exists==0){send(out,tag+" OK empty\r\n");return;}
        String flags=(seen?"\\Seen ":"")+(star?"\\Flagged":"");String prefix="* 1 FETCH (UID "+uid+" FLAGS ("+flags+")";
        if(u.contains("ENVELOPE"))prefix+=" INTERNALDATE \"19-Oct-2026 12:00:00 +0800\" RFC822.SIZE "+raw.getBytes(StandardCharsets.UTF_8).length+" ENVELOPE (\"Mon, 19 Oct 2026 12:00:00 +0800\" \"Protocol test\" ((\"Sender\" NIL \"sender\" \"example.test\")) NIL NIL ((\"Receiver\" NIL \"receiver\" \"example.test\")) NIL NIL NIL \"<fixture@example.test>\")";
        int bracket=u.indexOf('[');
        if(bracket>=0){String section=arg.substring(bracket+1,arg.indexOf(']',bracket));byte[] bytes=(section.toUpperCase(Locale.ROOT).contains("HEADER")?raw.substring(0,raw.indexOf("\r\n\r\n")+4):raw).getBytes(StandardCharsets.UTF_8);send(out,prefix+" BODY["+section+"]"+(u.contains("]<")?"<0>":"")+" {"+bytes.length+"}\r\n");out.write(bytes);send(out,")\r\n"+tag+" OK fetch\r\n");}
        else send(out,prefix+")\r\n"+tag+" OK fetch\r\n");
    }
    private void smtp(Socket socket) throws Exception {
        BufferedReader in=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));OutputStream out=socket.getOutputStream();send(out,"220 localhost ESMTP test\r\n");String line;int auth=0;
        while((line=in.readLine())!=null){String upper=line.toUpperCase(Locale.ROOT);
            if(auth>0){if(auth==1){auth=2;send(out,"334 UGFzc3dvcmQ6\r\n");}else{auth=0;send(out,"235 authenticated\r\n");}continue;}
            if(upper.startsWith("EHLO")||upper.startsWith("HELO"))send(out,"250-localhost\r\n250 AUTH PLAIN LOGIN\r\n");
            else if(upper.startsWith("AUTH LOGIN")){auth=1;send(out,"334 VXNlcm5hbWU6\r\n");}
            else if(upper.startsWith("AUTH"))send(out,"235 authenticated\r\n");
            else if(upper.equals("DATA")){send(out,"354 send message\r\n");StringBuilder data=new StringBuilder();while((line=in.readLine())!=null&&!line.equals("."))data.append(line.startsWith("..")?line.substring(1):line).append("\r\n");received=data.toString();send(out,"250 accepted\r\n");}
            else if(upper.equals("QUIT")){send(out,"221 bye\r\n");return;}else send(out,"250 OK\r\n");
        }
    }
    @Override public void close(){try{imap.close();smtp.close();}catch(IOException ignored){}for(Socket s:sockets)try{s.close();}catch(IOException ignored){}threads.shutdownNow();}
}
