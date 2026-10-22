package com.yuzhounh.lightmail;

import android.content.Context;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/** Observe scroll intent without taking touch events away from mail rows or refresh. */
final class MailRefreshLayout extends SwipeRefreshLayout {
    interface ScrollIntent { void scroll(boolean upward); }
    private ScrollIntent listener;
    private float lastY,startX,travel;
    private final int slop;
    MailRefreshLayout(Context c){super(c);slop=ViewConfiguration.get(c).getScaledTouchSlop()*2;}
    void setScrollIntent(ScrollIntent value){listener=value;}
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){lastY=event.getRawY();startX=event.getRawX();travel=0;}
        else if(event.getActionMasked()==MotionEvent.ACTION_MOVE&&event.getPointerCount()==1){
            float delta=lastY-event.getRawY();lastY=event.getRawY();
            if(Math.abs(event.getRawX()-startX)<slop*2&&!isRefreshing()){
                if(travel*delta<0)travel=0;travel+=delta;
                if(Math.abs(travel)>slop){if(listener!=null)listener.scroll(travel>0);travel=0;}
            }
        }
        return super.dispatchTouchEvent(event);
    }
}
