package com.yuzhounh.lightmail;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.widget.*;

final class Ui {
    static final int BG=0xFFF8FAFD,TEXT=0xFF213047,MUTED=0xFF67768C,BLUE=0xFF416DC3,BORDER=0xFFE4EAF2,TINT=0xFFEAF1FC;
    static int dp(Context c,float x){return (int)(x*c.getResources().getDisplayMetrics().density+.5f);}
    static GradientDrawable rounded(int color,int radius,Context c){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(c,radius));return d;}
    static LinearLayout column(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.VERTICAL);return v;}
    static LinearLayout row(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(android.view.Gravity.CENTER_VERTICAL);return v;}
    static TextView text(Context c,String value,int size,int color){TextView v=new TextView(c);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setIncludeFontPadding(false);v.setLineSpacing(dp(c,2),1);return v;}
    static TextView title(Context c,String value){TextView t=text(c,value,20,TEXT);t.setTypeface(null,Typeface.BOLD);return t;}
    static void pad(View v,int n){int d=dp(v.getContext(),n);v.setPadding(d,d,d,d);}
    static android.graphics.drawable.RippleDrawable touch(Context c,int color,int radius){return new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x22416DC3),rounded(color,radius,c),rounded(Color.WHITE,radius,c));}
    static GradientDrawable gradient(){return new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{0xFFECF3FF,0xFFF3F2FA,0xFFFAF6F0});}
    static Button button(Context c,String value,Runnable click){Button b=new Button(c);b.setText(value);b.setTextSize(13);b.setAllCaps(false);b.setMinHeight(dp(c,48));b.setMinimumWidth(0);b.setMinWidth(0);b.setStateListAnimator(null);b.setPadding(dp(c,12),dp(c,8),dp(c,12),dp(c,8));b.setTextColor(BLUE);b.setBackground(touch(c,TINT,14));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(c,48));lp.setMargins(0,dp(c,5),0,dp(c,5));b.setLayoutParams(lp);b.setOnClickListener(v->click.run());return b;}
    static Button primary(Context c,String value,int glyph,Runnable click){Button b=button(c,value,click);b.setBackground(touch(c,BLUE,18));b.setTextColor(Color.WHITE);MailIcon icon=new MailIcon(glyph,Color.WHITE);icon.setBounds(0,0,dp(c,21),dp(c,21));b.setCompoundDrawables(icon,null,null,null);b.setCompoundDrawablePadding(dp(c,10));return b;}
    static int glyph(int resource){return switch(resource){case android.R.drawable.ic_menu_sort_by_size->MailIcon.MENU;case android.R.drawable.ic_popup_sync->MailIcon.REFRESH;case android.R.drawable.ic_menu_more->MailIcon.MORE;case android.R.drawable.ic_menu_manage->MailIcon.SETTINGS;case android.R.drawable.ic_menu_close_clear_cancel->MailIcon.CLOSE;case android.R.drawable.ic_menu_delete->MailIcon.TRASH;case android.R.drawable.ic_menu_add->MailIcon.ATTACH;case android.R.drawable.ic_menu_revert,android.R.drawable.ic_media_previous->MailIcon.BACK;default->resource;};}
    static ImageButton icon(Context c,int resource,String description,Runnable click){ImageButton b=new ImageButton(c);b.setImageDrawable(new MailIcon(glyph(resource),TEXT));b.setContentDescription(description);b.setBackground(touch(c,Color.TRANSPARENT,16));b.setPadding(dp(c,12),dp(c,12),dp(c,12),dp(c,12));b.setLayoutParams(new LinearLayout.LayoutParams(dp(c,48),dp(c,48)));b.setOnClickListener(v->click.run());return b;}
    static int logo(org.json.JSONObject account){String email=account==null?"":account.optString("email").toLowerCase(java.util.Locale.ROOT);return email.endsWith("@163.com")?R.drawable.logo_163:email.endsWith("@qq.com")?R.drawable.logo_qq:email.endsWith("@gmail.com")?R.drawable.logo_gmail:email.endsWith("@xynu.edu.cn")?R.drawable.logo_xynu:0;}
    static int brandColor(int logo){return Color.parseColor(logo==R.drawable.logo_163?"#C8161D":logo==R.drawable.logo_qq?"#EF8A00":logo==R.drawable.logo_gmail?"#EA4335":"#2B7FE8");}
    static ImageView accountBadge(Context c,org.json.JSONObject account,int size){int logo=logo(account);if(logo==0)return badge(c,MailIcon.MAIL,AccountStore.color(account),size);ImageView v=new ImageView(c);v.setImageResource(logo);v.setPadding(dp(c,size*.2f),dp(c,size*.2f),dp(c,size*.2f),dp(c,size*.2f));v.setBackground(rounded((brandColor(logo)&0xFFFFFF)|0x16000000,16,c));v.setLayoutParams(new LinearLayout.LayoutParams(dp(c,size),dp(c,size)));v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return v;}
    static ImageView accountGlyph(Context c,org.json.JSONObject account,int size){int logo=logo(account);ImageView v=new ImageView(c);if(logo==0)v.setImageDrawable(new MailIcon(MailIcon.MAIL,AccountStore.color(account)));else v.setImageResource(logo);v.setLayoutParams(new LinearLayout.LayoutParams(dp(c,size),dp(c,size)));v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return v;}
    static ImageView badge(Context c,int glyph,int color,int size){ImageView v=new ImageView(c);v.setImageDrawable(new MailIcon(glyph,color));v.setPadding(dp(c,size*.24f),dp(c,size*.24f),dp(c,size*.24f),dp(c,size*.24f));v.setBackground(rounded((color&0xFFFFFF)|0x16000000,16,c));v.setLayoutParams(new LinearLayout.LayoutParams(dp(c,size),dp(c,size)));v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return v;}
    static EditText input(Context c,String hint,String value,boolean password){EditText e=new EditText(c);e.setTextSize(15);e.setTextColor(TEXT);e.setHint(hint);e.setSingleLine(true);e.setText(value);e.setPadding(dp(c,12),dp(c,10),dp(c,12),dp(c,10));e.setBackground(rounded(Color.rgb(242,245,250),10,c));if(password)e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(c,50));lp.setMargins(0,dp(c,6),0,dp(c,12));e.setLayoutParams(lp);return e;}
    static ArrayAdapter<String> choices(Context c,java.util.List<String> values){return new ArrayAdapter<String>(c,android.R.layout.simple_spinner_dropdown_item,values){@Override public View getView(int position,View reuse,android.view.ViewGroup parent){View v=super.getView(position,reuse,parent);((TextView)v).setTextSize(14);return v;}@Override public View getDropDownView(int position,View reuse,android.view.ViewGroup parent){View v=super.getDropDownView(position,reuse,parent);((TextView)v).setTextSize(14);return v;}};}
    static void field(LinearLayout root,String label,EditText input){root.addView(text(root.getContext(),label,13,MUTED));root.addView(input);}
    static android.app.AlertDialog.Builder dialog(Context c){return new android.app.AlertDialog.Builder(c){
        @Override public android.app.AlertDialog.Builder setItems(CharSequence[] items,android.content.DialogInterface.OnClickListener listener){
            ArrayAdapter<CharSequence> adapter=new ArrayAdapter<CharSequence>(c,android.R.layout.simple_list_item_1,items){@Override public View getView(int position,View reuse,android.view.ViewGroup parent){TextView text=(TextView)super.getView(position,reuse,parent);text.setTextSize(14);text.setMinHeight(dp(c,48));return text;}};
            super.setAdapter(adapter,listener);return this;
        }
        @Override public android.app.AlertDialog create(){android.app.AlertDialog dialog=super.create();android.view.Window window=dialog.getWindow();if(window!=null){window.setBackgroundDrawable(rounded(Color.WHITE,24,c));window.getDecorView().setClipToOutline(true);}return dialog;}
    };}
    static void root(Activity activity,LinearLayout root){root.setBackground(gradient());root.setOnApplyWindowInsetsListener((v,insets)->{
        if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());int bottom=Math.max(bars.bottom,insets.getInsets(WindowInsets.Type.ime()).bottom);v.setPadding(bars.left,bars.top,bars.right,bottom);}
        else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
    });activity.setContentView(root);root.requestApplyInsets();}
    static void toast(Context c,String value){Toast.makeText(c,value,Toast.LENGTH_LONG).show();}
}
