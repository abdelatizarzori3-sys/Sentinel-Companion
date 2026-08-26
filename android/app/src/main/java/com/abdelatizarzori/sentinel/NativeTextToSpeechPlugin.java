package com.abdelatizarzori.sentinel;

import android.app.Activity;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "NativeTextToSpeech")
public class NativeTextToSpeechPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech textToSpeech;
    private boolean ready = false;
    private PluginCall pendingCall;

    @PluginMethod
    public void speak(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("TTS_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> speakOnMainThread(call));
    }

    private void speakOnMainThread(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) { call.reject("TTS_EMPTY_TEXT"); return; }
        if (textToSpeech == null) {
            pendingCall = call;
            textToSpeech = new TextToSpeech(getContext(), this);
            return;
        }
        if (!ready) { call.reject("TTS_UNAVAILABLE"); return; }
        startSpeaking(call, text);
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (!ready) { call.reject("TTS_UNAVAILABLE"); return; }
        Activity activity = getActivity();
        if (activity == null) { call.reject("TTS_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> startSpeaking(call, call.getString("text", "").trim()));
    }

    private void startSpeaking(PluginCall call, String text) {
        if (textToSpeech == null || text.isEmpty()) { call.reject("TTS_EMPTY_TEXT"); return; }
        String languageTag = call.getString("locale", "ar-MA");
        Locale locale = Locale.forLanguageTag(languageTag);
        if (textToSpeech.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) textToSpeech.setLanguage(locale);
        String utteranceId = "sentinel-" + System.currentTimeMillis();
        textToSpeech.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { if (utteranceId.equals(id)) call.resolve(new JSObject()); }
            @Override public void onError(String id) { if (utteranceId.equals(id)) call.reject("TTS_ERROR"); }
        });
        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (result == TextToSpeech.ERROR) call.reject("TTS_ERROR");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> { if (textToSpeech != null) textToSpeech.stop(); });
        call.resolve();
    }
}
