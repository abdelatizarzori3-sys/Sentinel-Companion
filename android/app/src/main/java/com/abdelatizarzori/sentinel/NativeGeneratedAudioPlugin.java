package com.abdelatizarzori.sentinel;

import android.app.Activity;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeGeneratedAudio")
public class NativeGeneratedAudioPlugin extends Plugin {
    private AudioTrack track;
    private Thread playbackThread;

    @PluginMethod
    public void play(PluginCall call) {
        Activity activity = getActivity();
        String encoded = call.getString("audioBase64", "");
        int sampleRate = call.getInt("sampleRate", 24000);
        if (activity == null || encoded.isEmpty()) { call.reject("AUDIO_UNAVAILABLE"); return; }
        getBridge().execute(() -> {
            try {
                stopTrack();
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > 900_000) { call.reject("AUDIO_PAYLOAD_INVALID"); return; }
                if (sampleRate < 8000 || sampleRate > 48000) { call.reject("AUDIO_SAMPLE_RATE_INVALID"); return; }
                int minimumBuffer = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
                if (minimumBuffer <= 0) { call.reject("AUDIO_TRACK_UNAVAILABLE"); return; }
                int bufferSize = Math.max(minimumBuffer, Math.min(bytes.length, sampleRate * 2));
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                track = new AudioTrack.Builder()
                    .setAudioAttributes(attributes)
                    .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
                if (track.getState() != AudioTrack.STATE_INITIALIZED) { stopTrack(); call.reject("AUDIO_TRACK_UNAVAILABLE"); return; }
                track.play();
                JSObject result = new JSObject();
                result.put("started", true);
                result.put("durationMs", Math.max(800, (bytes.length * 1000L) / (sampleRate * 2)));
                call.resolve(result);
                notifyListeners("audioStarted", result);
                final AudioTrack playingTrack = track;
                playbackThread = new Thread(() -> {
                    try {
                        int offset = 0;
                        while (offset < bytes.length && playingTrack == track) {
                            int written = playingTrack.write(bytes, offset, bytes.length - offset, AudioTrack.WRITE_BLOCKING);
                            if (written <= 0) break;
                            offset += written;
                        }
                        if (playingTrack == track) {
                            notifyListeners("audioFinished", new JSObject());
                            stopTrack();
                        }
                    } catch (Exception ignored) { stopTrack(); }
                }, "sentinel-gemini-audio");
                playbackThread.start();
            } catch (Exception error) {
                stopTrack();
                call.reject("AUDIO_PLAYBACK_ERROR");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopTrack();
        call.resolve();
    }

    private synchronized void stopTrack() {
        AudioTrack current = track;
        track = null;
        if (current != null) {
            try { current.pause(); current.flush(); } catch (Exception ignored) { }
            current.release();
        }
        playbackThread = null;
    }
}
