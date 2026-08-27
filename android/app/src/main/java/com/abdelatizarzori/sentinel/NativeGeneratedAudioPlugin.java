package com.abdelatizarzori.sentinel;

import android.app.Activity;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "NativeGeneratedAudio")
public class NativeGeneratedAudioPlugin extends Plugin {
    private MediaPlayer player;
    private File audioFile;

    @PluginMethod
    public void play(PluginCall call) {
        Activity activity = getActivity();
        String encoded = call.getString("audioBase64", "");
        if (activity == null || encoded.isEmpty()) { call.reject("AUDIO_UNAVAILABLE"); return; }
        getBridge().execute(() -> {
            try {
                stopPlayer();
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > 900_000) { call.reject("AUDIO_PAYLOAD_INVALID"); return; }
                audioFile = new File(getContext().getCacheDir(), "sentinel-gemini-" + System.currentTimeMillis() + ".wav");
                try (FileOutputStream output = new FileOutputStream(audioFile)) { output.write(bytes); }
                player = new MediaPlayer();
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
                player.setDataSource(audioFile.getAbsolutePath());
                player.setOnPreparedListener(mediaPlayer -> {
                    mediaPlayer.start();
                    JSObject result = new JSObject();
                    result.put("started", true);
                    result.put("durationMs", Math.max(800, mediaPlayer.getDuration()));
                    call.resolve(result);
                    notifyListeners("audioStarted", result);
                });
                player.setOnCompletionListener(mediaPlayer -> {
                    notifyListeners("audioFinished", new JSObject());
                    stopPlayer();
                });
                player.setOnErrorListener((mediaPlayer, what, extra) -> { stopPlayer(); call.reject("AUDIO_PLAYBACK_ERROR"); return true; });
                player.prepareAsync();
            } catch (Exception error) {
                stopPlayer();
                call.reject("AUDIO_PLAYBACK_ERROR");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopPlayer();
        call.resolve();
    }

    private void stopPlayer() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            player.release();
            player = null;
        }
        if (audioFile != null) { audioFile.delete(); audioFile = null; }
    }
}
