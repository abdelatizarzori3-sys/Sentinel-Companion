package com.abdelatizarzori.sentinel;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeSpeechRecognitionPlugin.class);
        registerPlugin(NativeAudioRecorderPlugin.class);
        registerPlugin(NativeTextToSpeechPlugin.class);
        registerPlugin(NativeGeneratedAudioPlugin.class);
        registerPlugin(NativeSentinelTransportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
