package com.abdelatizarzori.sentinel;

import android.app.Activity;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

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
    private PluginCall pendingSpeakCall;
    private PluginCall pendingStatusCall;

    @PluginMethod
    public void checkStatus(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("TTS_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> {
            if (textToSpeech == null) {
                pendingStatusCall = call;
                textToSpeech = new TextToSpeech(getContext(), this);
            } else {
                resolveStatus(call);
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("TTS_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> {
            String text = call.getString("text", "").trim();
            if (text.isEmpty()) { call.reject("TTS_EMPTY_TEXT"); return; }
            if (textToSpeech == null) {
                pendingSpeakCall = call;
                textToSpeech = new TextToSpeech(getContext(), this);
                return;
            }
            if (!ready) { call.reject("TTS_INITIALIZING"); return; }
            startSpeaking(call, text);
        });
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (ready && textToSpeech != null) {
            textToSpeech.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
        }
        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (pendingStatusCall != null) {
                resolveStatus(pendingStatusCall);
                pendingStatusCall = null;
            }
            if (pendingSpeakCall != null) {
                PluginCall call = pendingSpeakCall;
                pendingSpeakCall = null;
                if (!ready) { call.reject("TTS_UNAVAILABLE"); return; }
                startSpeaking(call, call.getString("text", "").trim());
            }
        });
    }

    private void resolveStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ready", ready);
        result.put("engine", textToSpeech == null ? "" : textToSpeech.getDefaultEngine());
        String requestedTag = call.getString("locale", "ar-MA");
        Locale requested = Locale.forLanguageTag(requestedTag);
        boolean requestedAvailable = textToSpeech != null && (languageAvailable(requested) || ("ar".equals(requested.getLanguage()) && languageAvailable(new Locale("ar"))));
        result.put("requestedLanguageAvailable", requestedAvailable);
        result.put("defaultLocale", textToSpeech == null || textToSpeech.getDefaultLanguage() == null ? "" : textToSpeech.getDefaultLanguage().toLanguageTag());
        call.resolve(result);
    }

    private boolean languageAvailable(Locale locale) {
        if (textToSpeech == null || locale == null) return false;
        int availability = textToSpeech.isLanguageAvailable(locale);
        return availability != TextToSpeech.LANG_MISSING_DATA && availability != TextToSpeech.LANG_NOT_SUPPORTED;
    }

    private void startSpeaking(PluginCall call, String text) {
        if (textToSpeech == null || text.isEmpty()) { call.reject("TTS_EMPTY_TEXT"); return; }
        String tag = call.getString("locale", "ar-MA");
        Locale requested = Locale.forLanguageTag(tag);
        int availability = textToSpeech.isLanguageAvailable(requested);
        Locale applied = requested;
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            applied = new Locale("ar");
            availability = textToSpeech.isLanguageAvailable(applied);
        }
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("TTS_LANGUAGE_UNAVAILABLE");
            return;
        }
        int appliedResult = textToSpeech.setLanguage(applied);
        if (appliedResult == TextToSpeech.LANG_MISSING_DATA || appliedResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("TTS_LANGUAGE_UNAVAILABLE");
            return;
        }
        final String appliedLanguageTag = applied.toLanguageTag();
        String utteranceId = "sentinel-" + System.currentTimeMillis();
        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {
                if (!utteranceId.equals(id)) return;
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("locale", appliedLanguageTag);
                result.put("estimatedDurationMs", Math.max(1100, Math.min(12000, text.length() * 82)));
                call.resolve(result);
                notifyListeners("speechStarted", result);
            }
            @Override public void onDone(String id) {
                if (utteranceId.equals(id)) notifyListeners("speechFinished", new JSObject());
            }
            @Override public void onError(String id) {
                if (utteranceId.equals(id)) call.reject("TTS_ERROR");
            }
            @Override public void onError(String id, int errorCode) {
                if (utteranceId.equals(id)) call.reject("TTS_ERROR_" + errorCode);
            }
        });
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        if (result == TextToSpeech.ERROR) call.reject("TTS_ERROR");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> { if (textToSpeech != null) textToSpeech.stop(); });
        call.resolve();
    }

}
