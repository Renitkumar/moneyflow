package com.moneyflow.app;

import android.Manifest;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    private static final int WRITE_STORAGE_REQUEST = 4101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new ReportDownloadBridge(), "MoneyFlowAndroid");
        }
    }

    private class ReportDownloadBridge {
        @JavascriptInterface
        public boolean saveCsv(String base64Csv, String fileName) {
            try {
                byte[] data;
                data = android.util.Base64.decode(base64Csv, android.util.Base64.DEFAULT);

                String safeName = fileName == null ? "moneyflow_report.csv" : fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
                if (!safeName.toLowerCase().endsWith(".csv")) safeName += ".csv";

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, "text/csv");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/MoneyFlow");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    android.net.Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;

                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out == null) throw new Exception("Unable to open download file");
                        out.write(data);
                        out.flush();
                    }

                    ContentValues done = new ContentValues();
                    done.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(uri, done, null, null);
                    return true;
                }

                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, WRITE_STORAGE_REQUEST);
                    return false;
                }

                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File moneyFlow = new File(downloads, "MoneyFlow");
                if (!moneyFlow.exists() && !moneyFlow.mkdirs()) return false;
                File file = new File(moneyFlow, safeName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(data);
                    out.flush();
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
