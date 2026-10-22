package com.yuzhounh.lightmail;

import android.graphics.*;
import android.graphics.drawable.Drawable;

/** Shared 24-unit outline icons; all strokes use the same weight and rounded ends. */
final class MailIcon extends Drawable {
    static final int MENU=1,MAIL=2,INBOX=3,WRITE=4,BACK=5,CLOSE=6,MORE=7,REFRESH=8,
        SETTINGS=9,TRASH=10,ATTACH=11,SEND=12,DRAFT=13,SEARCH=14,CHECK=15,FOLDER=16,JUNK=17,ARCHIVE=18,INBOXES=19;
    private final int kind;
    private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
    MailIcon(int kind,int color){this.kind=kind;p.setColor(color);p.setStrokeWidth(1.8f);p.setStyle(Paint.Style.STROKE);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);}
    private void lines(Canvas c,float... xy){Path path=new Path();path.moveTo(xy[0],xy[1]);for(int i=2;i<xy.length;i+=2)path.lineTo(xy[i],xy[i+1]);c.drawPath(path,p);}
    @Override public void draw(Canvas c){Rect b=getBounds();c.save();c.translate(b.left,b.top);c.scale(b.width()/24f,b.height()/24f);
        switch(kind){
            case MENU:lines(c,4,6,20,6);lines(c,4,12,20,12);lines(c,4,18,20,18);break;
            case MAIL:c.drawRoundRect(3,5,21,19,3,3,p);lines(c,4,7,12,13,20,7);break;
            case INBOX:lines(c,3,13,6,5,18,5,21,13,21,20,3,20,3,13,8,13,10,16,14,16,16,13,21,13);break;
            case WRITE:lines(c,14,5,19,10,9,20,4,21,5,16,18,3,21,6,19,8);break;
            case BACK:lines(c,14,5,7,12,14,19);lines(c,7,12,21,12);break;
            case CLOSE:lines(c,6,6,18,18);lines(c,18,6,6,18);break;
            case MORE:for(int i=5;i<21;i+=7)c.drawCircle(12,i,.8f,p);break;
            case REFRESH:c.drawArc(4,4,20,20,35,285,false,p);lines(c,20,4,20,10,14,10);break;
            case SETTINGS:c.drawCircle(12,12,3,p);for(int i=0;i<8;i++){c.save();c.rotate(i*45,12,12);lines(c,12,3,12,5);c.restore();}c.drawCircle(12,12,7,p);break;
            case TRASH:lines(c,3,6,21,6);lines(c,8,6,8,3,16,3,16,6);lines(c,5,6,6,21,18,21,19,6);lines(c,10,10,10,17);lines(c,14,10,14,17);break;
            case ATTACH:Path path=new Path();path.moveTo(8,12);path.lineTo(14,6);path.cubicTo(19,1,25,7,20,12);path.lineTo(11,21);path.cubicTo(5,27,-2,19,4,13);path.lineTo(13,4);c.drawPath(path,p);break;
            case SEND:lines(c,3,3,22,12,3,21,6,12,3,3);lines(c,6,12,22,12);break;
            case DRAFT:lines(c,6,3,15,3,20,8,20,21,4,21,4,3,6,3);lines(c,14,3,14,9,20,9);lines(c,8,13,16,13);lines(c,8,17,14,17);break;
            case SEARCH:c.drawCircle(10,10,6.5f,p);lines(c,15,15,21,21);break;
            case CHECK:lines(c,5,12,10,17,20,6);break;
            case FOLDER:lines(c,3,6,9,6,11,9,21,9,21,20,3,20,3,6);break;
            case JUNK:c.drawCircle(12,12,9,p);lines(c,12,7,12,13);c.drawCircle(12,17,.5f,p);break;
            case INBOXES:lines(c,6,3,18,3);lines(c,4,7,20,7);lines(c,5,11,2,17,2,21,22,21,22,17,19,11,5,11);lines(c,2,17,8,17,10,20,14,20,16,17,22,17);break;
            case ARCHIVE:c.drawRect(3,4,21,9,p);lines(c,5,9,5,21,19,21,19,9);lines(c,10,13,14,13);break;
        }c.restore();
    }
    @Override public void setAlpha(int a){p.setAlpha(a);invalidateSelf();}
    @Override public void setColorFilter(ColorFilter f){p.setColorFilter(f);invalidateSelf();}
    @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
}
