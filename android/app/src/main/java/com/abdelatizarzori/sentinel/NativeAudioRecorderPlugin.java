package com.abdelatizarzori.sentinel;

import android.Manifest;
import android.app.Activity;
import android.media.MediaRecorder;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

@CapacitorPlugin(
    name = "NativeAudioRecorder",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class NativeAudioRecorderPlugin extends Plugin {
    private MediaRecorder recorder;
    private File recordingFile;
    private boolean recording = false;

    @PluginMethod
    public void startRecording(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("AUDIO_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> startAfterPermission(call));
    }

    private void startAfterPermission(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicrophonePermissionResult");
            return;
        }
        beginRecording(call);
    }

    @PermissionCallback
    private void onMicrophonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) { call.reject("MICROPHONE_PERMISSION_DENIED"); return; }
        Activity activity = getActivity();
        if (activity == null) { call.reject("AUDIO_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> beginRecording(call));
    }

    private void beginRecording(PluginCall call) {
        if (recording) { call.reject("ALREADY_RECORDING"); return; }
        try {
            recordingFile = new File(getContext().getCacheDir(), "sentinel-voice-" + System.currentTimeMillis() + ".m4a");
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(64000);
            recorder.setAudioSamplingRate(16000);
            recorder.setOutputFile(recordingFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            recording = true;
            call.resolve();
        } catch (Exception error) {
            releaseRecorder(); deleteRecording(); call.reject("AUDIO_START_FAILED");
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("AUDIO_UNAVAILABLE"); return; }
        activity.runOnUiThread(() -> finishRecording(call));
    }

    private void finishRecording(PluginCall call) {
        if (!recording || recorder == null || recordingFile == null) { call.reject("NOT_RECORDING"); return; }
        try {
            recorder.stop();
            releaseRecorder(); recording = false;
            long size = recordingFile.length();
            if (size <= 0 || size > 1_800_000L) {
                deleteRecording(); call.reject(size > 1_800_000L ? "AUDIO_TOO_LARGE" : "AUDIO_EMPTY"); return;
            }
            byte[] bytes = readAllBytes(recordingFile);
            JSObject result = new JSObject();
            result.put("audioBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            result.put("mimeType", "audio/mp4");
            result.put("size", bytes.length);
            deleteRecording(); call.resolve(result);
        } catch (RuntimeException error) {
            releaseRecorder(); recording = false; deleteRecording(); call.reject("AUDIO_TOO_SHORT");
        } catch (IOException error) {
            releaseRecorder(); recording = false; deleteRecording(); call.reject("AUDIO_READ_FAILED");
        }
    }

    private byte[] readAllBytes(File file) throws IOException {
        byte[] data = new byte[(int) file.length()];
        try (FileInputStream stream = new FileInputStream(file)) {
            int offset = 0;
            while (offset < data.length) { int read = stream.read(data, offset, data.length - offset); if (read < 0) break; offset += read; }
            if (offset != data.length) throw new IOException("Could not read complete recording");
        }
        return data;
    }

    private void releaseRecorder() { if (recorder != null) { try { recorder.reset(); } catch (Exception ignored) { } try { recorder.release(); } catch (Exception ignored) { } recorder = null; } }
    private void deleteRecording() { if (recordingFile != null && recordingFile.exists()) recordingFile.delete(); recordingFile = null; }
}
