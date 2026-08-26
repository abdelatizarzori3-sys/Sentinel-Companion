package com.abdelatizarzori.sentinel;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(NativeSpeechRecognitionPlugin.class);
        registerPlugin(NativeAudioRecorderPlugin.class);
        registerPlugin(NativeTextToSpeechPlugin.class);
    }
}
