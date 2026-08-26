package com.abdelatizarzori.sentinel;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "NativeSpeechRecognition",
    permissions = {
        @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
    }
)
public class NativeSpeechRecognitionPlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private PluginCall activeCall;

    @PluginMethod
    public void start(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("RECOGNITION_UNAVAILABLE");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicrophonePermissionResult");
            return;
        }
        beginRecognition(call);
    }

    @PermissionCallback
    private void onMicrophonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("MICROPHONE_PERMISSION_DENIED");
            return;
        }
        beginRecognition(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopRecognition();
        call.resolve();
    }

    private void beginRecognition(PluginCall call) {
        stopRecognition();
        activeCall = call;
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onPartialResults(Bundle partialResults) { }
            @Override public void onEvent(int eventType, Bundle params) { }

            @Override public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                JSObject result = new JSObject();
                result.put("text", matches != null && !matches.isEmpty() ? matches.get(0) : "");
                result.put("locale", activeCall.getString("language", "ar-MA"));
                resolveActive(result);
            }

            @Override public void onError(int error) {
                String reason;
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    reason = "NO_SPEECH";
                } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    reason = "MICROPHONE_PERMISSION_DENIED";
                } else if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT) {
                    reason = "RECOGNITION_NETWORK_ERROR";
                } else {
                    reason = "RECOGNITION_ERROR";
                }
                rejectActive(reason);
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language", "ar-MA"));
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(intent);
    }

    private void resolveActive(JSObject result) {
        if (activeCall != null) activeCall.resolve(result);
        stopRecognition();
    }

    private void rejectActive(String reason) {
        if (activeCall != null) activeCall.reject(reason);
        stopRecognition();
    }

    private void stopRecognition() {
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
        activeCall = null;
    }
}
