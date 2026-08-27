package com.abdelatizarzori.sentinel;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NativeSentinelTransport")
public class NativeSentinelTransportPlugin extends Plugin {
    private static final String BASE_URL = "https://marokecho-jrrh7cuh.manus.space";
    private static final int MAX_REQUEST_BYTES = 2_600_000;
    private static final int MAX_RESPONSE_BYTES = 1_000_000;

    @PluginMethod
    public void post(PluginCall call) {
        String operation = call.getString("operation", "");
        String body = call.getString("body", "");
        String path = routeFor(operation);
        if (path == null) { call.reject("TRANSPORT_OPERATION_DENIED"); return; }
        if (body.isEmpty() || body.getBytes(StandardCharsets.UTF_8).length > MAX_REQUEST_BYTES) { call.reject("TRANSPORT_PAYLOAD_INVALID"); return; }
        getBridge().execute(() -> send(call, path, body));
    }

    private String routeFor(String operation) {
        if ("transcribe".equals(operation)) return "/api/trpc/voice.sentinelTranscribe?batch=1";
        if ("reply".equals(operation)) return "/api/trpc/ai.sentinelReply?batch=1";
        return null;
    }

    private void send(PluginCall call, String path, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(BASE_URL + path).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(35_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(data.length);
            try (OutputStream stream = connection.getOutputStream()) { stream.write(data); }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String response = readLimited(stream);
            JSObject result = new JSObject();
            result.put("status", status);
            result.put("body", response);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("TRANSPORT_NETWORK_ERROR");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readLimited(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder output = new StringBuilder();
        char[] buffer = new char[4096];
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            int count;
            while ((count = reader.read(buffer)) != -1) {
                output.append(buffer, 0, count);
                if (output.length() > MAX_RESPONSE_BYTES) throw new IllegalStateException("Response too large");
            }
        }
        return output.toString();
    }
}
