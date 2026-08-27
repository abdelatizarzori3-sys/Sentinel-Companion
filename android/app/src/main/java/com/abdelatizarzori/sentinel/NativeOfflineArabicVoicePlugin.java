package com.abdelatizarzori.sentinel;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.GenerationConfig;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsSupertonicModelConfig;

import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeOfflineArabicVoice")
public class NativeOfflineArabicVoicePlugin extends Plugin {
    private static final String MODEL_DIR = "sentinel_tts/supertonic_ar";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private OfflineTts tts;
    private AudioTrack activeTrack;

    @PluginMethod
    public void checkStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("loaded", tts != null);
        result.put("source", "supertonic-local-arabic");
        result.put("locale", "ar");
        result.put("note", "Arabic local voice; Moroccan Darija pronunciation must be tested on device.");
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) { call.reject("LOCAL_ARABIC_EMPTY_TEXT"); return; }
        if (text.length() > 300) text = text.substring(0, 300);
        final String textToSpeak = text;
        executor.execute(() -> {
            try {
                OfflineTts engine = ensureTts();
                GenerationConfig config = new GenerationConfig();
                config.setSpeed(1.05f);
                config.setNumSteps(5);
                config.setExtra(Collections.singletonMap("lang", "ar"));
                GeneratedAudio generated = engine.generateWithConfig(textToSpeak, config);
                if (generated == null || generated.getSamples() == null || generated.getSamples().length == 0) {
                    call.reject("LOCAL_ARABIC_EMPTY_AUDIO");
                    return;
                }
                play(call, generated.getSamples(), generated.getSampleRate());
            } catch (Throwable error) {
                Exception exception = error instanceof Exception ? (Exception) error : new Exception(error);
                call.reject("LOCAL_ARABIC_VOICE_FAILED", error.getMessage(), exception);
            }
        });
    }

    private synchronized OfflineTts ensureTts() {
        if (tts != null) return tts;
        OfflineTtsSupertonicModelConfig supertonic = new OfflineTtsSupertonicModelConfig(
            MODEL_DIR + "/duration_predictor.int8.onnx",
            MODEL_DIR + "/text_encoder.int8.onnx",
            MODEL_DIR + "/vector_estimator.int8.onnx",
            MODEL_DIR + "/vocoder.int8.onnx",
            MODEL_DIR + "/tts.json",
            MODEL_DIR + "/unicode_indexer.bin",
            MODEL_DIR + "/voice.bin"
        );
        OfflineTtsModelConfig model = new OfflineTtsModelConfig();
        model.setSupertonic(supertonic);
        model.setNumThreads(2);
        model.setProvider("cpu");
        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(model);
        tts = new OfflineTts(getContext().getAssets(), config);
        return tts;
    }

    private void play(PluginCall call, float[] samples, int sampleRate) {
        final int rate = sampleRate > 0 ? sampleRate : 44100;
        short[] pcm = new short[samples.length];
        for (int index = 0; index < samples.length; index++) {
            float sample = Math.max(-1f, Math.min(1f, samples[index]));
            pcm[index] = (short) (sample * Short.MAX_VALUE);
        }
        int minBuffer = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufferSize = Math.max(minBuffer, pcm.length * 2);
        stopTrack();
        AudioTrack track = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(bufferSize)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build();
        int written = track.write(pcm, 0, pcm.length, AudioTrack.WRITE_BLOCKING);
        if (written <= 0) { track.release(); call.reject("LOCAL_ARABIC_AUDIO_WRITE_FAILED"); return; }
        activeTrack = track;
        track.play();
        int durationMs = Math.max(600, Math.round((written * 1000f) / rate));
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("source", "supertonic-local-arabic");
        result.put("locale", "ar");
        result.put("sampleRate", rate);
        result.put("durationMs", durationMs);
        call.resolve(result);
        executor.execute(() -> {
            try { Thread.sleep(durationMs + 150L); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            if (activeTrack == track) stopTrack();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        executor.execute(this::stopTrack);
        call.resolve();
    }

    private synchronized void stopTrack() {
        if (activeTrack == null) return;
        try { activeTrack.pause(); activeTrack.flush(); activeTrack.release(); } catch (IllegalStateException ignored) { }
        activeTrack = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopTrack();
        if (tts != null) { tts.release(); tts = null; }
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
