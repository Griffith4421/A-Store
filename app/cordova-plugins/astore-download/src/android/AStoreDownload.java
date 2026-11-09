package com.aryan.astore.download;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URL;
import java.util.Locale;

/** Uses Android's system DownloadManager; APK installation always remains user-confirmed. */
public final class AStoreDownload extends CordovaPlugin {
    private DownloadManager manager;

    @Override
    protected void pluginInitialize() {
        manager = (DownloadManager) cordova.getActivity().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callback) throws JSONException {
        if ("enqueue".equals(action)) {
            enqueue(args.optJSONObject(0), callback);
            return true;
        }
        if ("query".equals(action)) {
            query(args.optString(0), callback);
            return true;
        }
        if ("openApk".equals(action)) {
            openApk(args.optString(0), callback);
            return true;
        }
        return false;
    }

    private void enqueue(JSONObject options, CallbackContext callback) {
        try {
            if (manager == null) throw new IllegalStateException("Android DownloadManager is unavailable.");
            String rawUrl = options == null ? "" : options.optString("url", "").trim();
            URL parsed = new URL(rawUrl);
            String protocol = parsed.getProtocol().toLowerCase(Locale.ROOT);
            if (!"https".equals(protocol)) throw new IllegalArgumentException("Downloads must use a secure HTTPS URL.");

            String filename = safeFilename(options.optString("filename", "A-Store-download.bin"));
            String title = options.optString("title", "A-Store download").trim();
            String description = options.optString("description", "Downloading from A-Store").trim();
            String mimeType = options.optString("mimeType", mimeFor(filename));

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(rawUrl));
            request.setTitle(title.isEmpty() ? "A-Store download" : title);
            request.setDescription(description);
            request.setMimeType(mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.allowScanningByMediaScanner();
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            long id = manager.enqueue(request);
            JSONObject result = new JSONObject();
            result.put("id", String.valueOf(id));
            result.put("filename", filename);
            callback.success(result);
        } catch (Exception error) {
            callback.error(message(error, "Could not start the Android download."));
        }
    }

    private void query(String rawId, CallbackContext callback) {
        Cursor cursor = null;
        try {
            long id = Long.parseLong(rawId);
            DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
            cursor = manager.query(query);
            if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Download record was not found.");
            int statusValue = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
            long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            String status;
            switch (statusValue) {
                case DownloadManager.STATUS_PENDING: status = "pending"; break;
                case DownloadManager.STATUS_RUNNING: status = "running"; break;
                case DownloadManager.STATUS_PAUSED: status = "paused"; break;
                case DownloadManager.STATUS_SUCCESSFUL: status = "successful"; break;
                default: status = "failed"; break;
            }
            int progress = total > 0 ? (int) Math.min(100, Math.max(0, (downloaded * 100L) / total)) : 0;
            JSONObject result = new JSONObject();
            result.put("id", rawId);
            result.put("status", status);
            result.put("progress", progress);
            result.put("bytesDownloaded", downloaded);
            result.put("totalBytes", total);
            result.put("reason", reason == 0 ? "" : reasonText(reason));
            if (statusValue == DownloadManager.STATUS_SUCCESSFUL) {
                Uri uri = manager.getUriForDownloadedFile(id);
                result.put("uri", uri == null ? "" : uri.toString());
            }
            callback.success(result);
        } catch (Exception error) {
            callback.error(message(error, "Could not check the download status."));
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private void openApk(String rawId, CallbackContext callback) {
        Cursor cursor = null;
        try {
            long id = Long.parseLong(rawId);
            cursor = manager.query(new DownloadManager.Query().setFilterById(id));
            if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("The downloaded APK could not be found.");
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status != DownloadManager.STATUS_SUCCESSFUL) throw new IllegalStateException("Wait for the APK download to finish before installing it.");
            Uri apkUri = manager.getUriForDownloadedFile(id);
            if (apkUri == null) throw new IllegalStateException("Android could not locate the downloaded APK.");

            Context context = cordova.getActivity();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + context.getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settings);
                JSONObject result = new JSONObject();
                result.put("requiresPermission", true);
                callback.success(result);
                return;
            }

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(install);
            JSONObject result = new JSONObject();
            result.put("requiresPermission", false);
            callback.success(result);
        } catch (Exception error) {
            callback.error(message(error, "Android could not open the package installer."));
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private static String safeFilename(String value) {
        String cleaned = value == null ? "" : value.replaceAll("[^A-Za-z0-9._-]", "-");
        cleaned = cleaned.replaceAll("^-+|-+$", "");
        if (cleaned.isEmpty()) cleaned = "A-Store-download.bin";
        return cleaned.length() > 90 ? cleaned.substring(0, 90) : cleaned;
    }

    private static String mimeFor(String filename) {
        return filename.toLowerCase(Locale.ROOT).endsWith(".apk")
                ? "application/vnd.android.package-archive" : "application/octet-stream";
    }

    private static String reasonText(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_CANNOT_RESUME: return "The download could not resume.";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "Download storage is unavailable.";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS: return "A file with this name already exists.";
            case DownloadManager.ERROR_FILE_ERROR: return "The device could not save the file.";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "The server returned an invalid download response.";
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "There is not enough free storage.";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "The download link redirects too many times.";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE: return "The server rejected the download.";
            case DownloadManager.ERROR_UNKNOWN: return "The download failed for an unknown reason.";
            default: return "Download failed (reason " + reason + ").";
        }
    }

    private static String message(Exception error, String fallback) {
        String value = error == null ? "" : error.getMessage();
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
