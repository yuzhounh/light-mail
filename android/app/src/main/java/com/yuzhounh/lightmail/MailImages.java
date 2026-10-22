package com.yuzhounh.lightmail;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import java.net.URI;
import java.net.URLDecoder;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Normalizes image references before the existing email HTML sanitizer runs. */
final class MailImages {
    static final String ORIGIN="https://mail.lightmail.invalid/";
    private static final Pattern CID=Pattern.compile("(?i)cid:([^\\s\"'<>\\)]+)");
    static String reference(String value){
        String key=value.trim();if(key.regionMatches(true,0,"cid:",0,4))key=key.substring(4);
        try{key=URLDecoder.decode(key.replace("+","%2B"),"UTF-8");}catch(Exception ignored){}
        if(key.startsWith("<")&&key.endsWith(">"))key=key.substring(1,key.length()-1);return key.trim();
    }
    private static String inline(Map<String,String> images,String value){
        String key=reference(value),found=images.get(key);if(found!=null)return found;
        for(Map.Entry<String,String> image:images.entrySet())if(image.getKey().equalsIgnoreCase(key))return image.getValue();return null;
    }
    static String secureUrl(String url){
        String value=url.trim();if(value.startsWith("//"))return "https:"+value;
        if(value.regionMatches(true,0,"http:",0,5))return "https:"+value.substring(5);return value;
    }
    static String html(String html,String base,Map<String,String> images){
        String baseUrl=secureUrl(base);Document document=Jsoup.parseBodyFragment(html,baseUrl);int missing=0;
        for(Element image:document.select("img")){
            String src=image.attr("src");
            for(String lazy:new String[]{"data-src","data-original"})if(!image.attr(lazy).isBlank()){src=image.attr(lazy);break;}
            String embedded=inline(images,src);
            if(embedded!=null)src=embedded;
            else if(src.trim().regionMatches(true,0,"cid:",0,4)||src.isBlank())src=ORIGIN+"unavailable-image/"+(++missing);
            else {
                src=secureUrl(src);
                if(!baseUrl.isEmpty())try{src=new URI(baseUrl).resolve(src.replace(" ","%20")).toString();}catch(Exception ignored){}
                embedded=inline(images,src);if(embedded!=null)src=embedded;
                if(!src.regionMatches(true,0,"https://",0,8)&&!src.regionMatches(true,0,"data:image/",0,11))src=ORIGIN+"unavailable-image/"+(++missing);
            }
            image.attr("src",src).attr("loading","eager");if(image.attr("alt").isBlank())image.attr("alt","图片未加载");
        }
        // CID images can also be referenced by inline CSS backgrounds.
        for(Element element:document.select("[style]")){
            Matcher matcher=CID.matcher(element.attr("style"));StringBuffer style=new StringBuffer();
            while(matcher.find()){String replacement=inline(images,matcher.group(1));matcher.appendReplacement(style,Matcher.quoteReplacement(replacement==null?matcher.group():replacement));}
            matcher.appendTail(style);element.attr("style",style.toString());
        }
        Safelist allowed=Safelist.relaxed().addAttributes(":all","style","class","width","height","align","bgcolor").addAttributes("img","loading").addProtocols("img","src","data");
        return Jsoup.clean(document.body().html(),baseUrl,allowed,new Document.OutputSettings().prettyPrint(false)).replaceAll("(?i)expression\\s*\\(","blocked(");
    }
}
