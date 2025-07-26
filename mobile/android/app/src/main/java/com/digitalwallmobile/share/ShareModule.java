package com.digitalwallmobile.share;

import android.content.Intent;
import android.os.Bundle;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.io.IOException;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

public class ShareModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "ShareModule";
    private OkHttpClient client;

    public ShareModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.client = new OkHttpClient();
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void processShareData(ReadableMap shareData, Promise promise) {
        try {
            JSONObject json = new JSONObject();
            if (shareData.hasKey("text")) {
                json.put("text", shareData.getString("text"));
            }
            if (shareData.hasKey("url")) {
                json.put("url", shareData.getString("url"));
            }
            if (shareData.hasKey("title")) {
                json.put("title", shareData.getString("title"));
            }

            MediaType JSON = MediaType.get("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(JSON, json.toString());

            Request request = new Request.Builder()
                .url("https://182e96e39f50.ngrok-free.app/api/share")
                .addHeader("Accept", "application/json")
                .addHeader("ngrok-skip-browser-warning", "true")
                .post(body)
                .build();

            client
                .newCall(request)
                .enqueue(
                    new Callback() {
                        @Override
                        public void onFailure(
                            @NonNull Call call,
                            @NonNull IOException e
                        ) {
                            promise.reject(
                                "NETWORK_ERROR",
                                "Failed to send share data",
                                e
                            );
                        }

                        @Override
                        public void onResponse(
                            @NonNull Call call,
                            @NonNull Response response
                        ) throws IOException {
                            if (response.isSuccessful()) {
                                WritableMap result = Arguments.createMap();
                                result.putBoolean("success", true);
                                promise.resolve(result);
                            } else {
                                promise.reject(
                                    "HTTP_ERROR",
                                    "HTTP " +
                                    response.code() +
                                    ": " +
                                    response.message()
                                );
                            }
                        }
                    }
                );
        } catch (Exception e) {
            promise.reject(
                "PROCESSING_ERROR",
                "Failed to process share data",
                e
            );
        }
    }

    @ReactMethod
    public void handleIncomingShare() {
        Intent intent = getCurrentActivity().getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                String sharedTitle = intent.getStringExtra(Intent.EXTRA_TITLE);

                WritableMap shareData = Arguments.createMap();
                shareData.putString("text", sharedText);
                shareData.putString("title", sharedTitle);

                getReactApplicationContext()
                    .getJSModule(
                        DeviceEventManagerModule.RCTDeviceEventEmitter.class
                    )
                    .emit("ShareDataReceived", shareData);
            }
        }
    }
}
