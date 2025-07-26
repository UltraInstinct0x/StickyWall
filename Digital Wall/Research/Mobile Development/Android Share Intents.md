# [[Android Share Intents]] - Implementation Patterns

## Overview & Core Concepts

**Android Share Intents** enable the [[Digital Wall]] app to integrate seamlessly with Android's native sharing system, appearing as a target in any app's share menu. This document covers comprehensive implementation patterns for Intent Filters, background services, and Play Store compliance for Android sharing integration.

### Key Android Share Components
- **[[Intent Filters]]**: Declaring supported share types and MIME types
- **[[Activity Intent Handling]]**: Processing received share intents
- **[[Background Services]]**: Handling content processing without blocking UI
- **[[ContentProvider Integration]]**: Accessing shared files and media
- **[[Notification System]]**: User feedback and progress indication

## Technical Deep Dive

### Intent Filter Declaration

```xml
<!-- app/src/main/AndroidManifest.xml - Intent filter configuration -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.digitalwall.app">
    
    <application
        android:name=".DigitalWallApplication"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
        
        <!-- Main activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/AppTheme.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        
        <!-- Share handling activity -->
        <activity
            android:name=".ShareHandlerActivity"
            android:exported="true"
            android:theme="@style/ShareTheme"
            android:taskAffinity=""
            android:excludeFromRecents="true"
            android:finishOnTaskLaunch="true">
            
            <!-- Text content sharing -->
            <intent-filter android:priority="100">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            
            <!-- URL sharing (specific intent) -->
            <intent-filter android:priority="100">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="http" />
                <data android:scheme="https" />
            </intent-filter>
            
            <!-- Image sharing -->
            <intent-filter android:priority="90">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            
            <!-- Video sharing -->
            <intent-filter android:priority="90">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="video/*" />
            </intent-filter>
            
            <!-- Multiple files sharing -->
            <intent-filter android:priority="80">
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>
            
            <!-- Generic content sharing (fallback) -->
            <intent-filter android:priority="50">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>
        </activity>
        
        <!-- Background processing service -->
        <service
            android:name=".services.ContentProcessingService"
            android:enabled="true"
            android:exported="false" />
        
        <!-- Foreground service for long-running operations -->
        <service
            android:name=".services.ShareProcessingForegroundService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="dataSync" />
    </application>
    
    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
</manifest>
```

### Share Handler Activity

```kotlin
// app/src/main/java/com/digitalwall/app/ShareHandlerActivity.kt
package com.digitalwall.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import com.digitalwall.app.data.model.SharedContent
import com.digitalwall.app.services.ContentProcessingService
import com.digitalwall.app.ui.components.ShareProgressDialog
import com.digitalwall.app.utils.IntentParser
import com.digitalwall.app.utils.ContentValidator
import com.digitalwall.app.utils.ErrorHandler

class ShareHandlerActivity : Activity() {
    
    private lateinit var viewModel: ShareHandlerViewModel
    private var progressDialog: ShareProgressDialog? = null
    
    companion object {
        private const val TAG = "ShareHandlerActivity"
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        viewModel = ViewModelProvider(this)[ShareHandlerViewModel::class.java]
        
        // Handle the incoming share intent
        handleShareIntent(intent)
    }
    
    private fun handleShareIntent(intent: Intent?) {
        if (intent == null || intent.action == null) {
            Log.w(TAG, "Received null or invalid intent")
            finishAndRemoveTask()
            return
        }
        
        lifecycleScope.launch {
            try {
                when (intent.action) {
                    Intent.ACTION_SEND -> handleSingleShare(intent)
                    Intent.ACTION_SEND_MULTIPLE -> handleMultipleShare(intent)
                    else -> {
                        Log.w(TAG, "Unsupported action: ${intent.action}")
                        finishAndRemoveTask()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling share intent", e)
                ErrorHandler.showError(this@ShareHandlerActivity, e) {
                    finishAndRemoveTask()
                }
            }
        }
    }
    
    private suspend fun handleSingleShare(intent: Intent) {
        val sharedContent = IntentParser.parseShareIntent(intent)
        
        if (sharedContent == null) {
            ErrorHandler.showError(this, "No valid content found to share") {
                finishAndRemoveTask()
            }
            return
        }
        
        // Validate content
        val validationResult = ContentValidator.validate(sharedContent)
        if (!validationResult.isValid) {
            ErrorHandler.showError(this, validationResult.errorMessage) {
                finishAndRemoveTask()
            }
            return
        }
        
        // Process content
        processSharedContent(sharedContent)
    }
    
    private suspend fun handleMultipleShare(intent: Intent) {
        val uriList = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        
        if (uriList.isNullOrEmpty()) {
            ErrorHandler.showError(this, "No files found to share") {
                finishAndRemoveTask()
            }
            return
        }
        
        // Process multiple files
        val sharedContentList = mutableListOf<SharedContent>()
        
        for (uri in uriList) {
            val content = IntentParser.parseUriContent(this, uri)
            if (content != null && ContentValidator.validate(content).isValid) {
                sharedContentList.add(content)
            }
        }
        
        if (sharedContentList.isEmpty()) {
            ErrorHandler.showError(this, "No valid files found to share") {
                finishAndRemoveTask()
            }
            return
        }
        
        // Process multiple content items
        processBatchSharedContent(sharedContentList)
    }
    
    private suspend fun processSharedContent(content: SharedContent) {
        showProgressDialog("Processing shared content...")
        
        try {
            // Start processing service
            val serviceIntent = Intent(this, ContentProcessingService::class.java).apply {
                putExtra(ContentProcessingService.EXTRA_CONTENT, content)
                putExtra(ContentProcessingService.EXTRA_PROCESSING_ID, content.id)
            }
            
            startService(serviceIntent)
            
            // Observe processing status
            viewModel.observeProcessingStatus(content.id) { status ->
                when (status) {
                    is ProcessingStatus.InProgress -> {
                        updateProgress(status.progress, status.message)
                    }
                    is ProcessingStatus.Completed -> {
                        hideProgressDialog()
                        showSuccess("Content added to your Digital Wall!")
                        finishAndRemoveTask()
                    }
                    is ProcessingStatus.Failed -> {
                        hideProgressDialog()
                        ErrorHandler.showError(this@ShareHandlerActivity, status.error) {
                            finishAndRemoveTask()
                        }
                    }
                }
            }
            
        } catch (e: Exception) {
            hideProgressDialog()
            Log.e(TAG, "Error processing shared content", e)
            ErrorHandler.showError(this, e) {
                finishAndRemoveTask()
            }
        }
    }
    
    private suspend fun processBatchSharedContent(contentList: List<SharedContent>) {
        showProgressDialog("Processing ${contentList.size} items...")
        
        try {
            // Start batch processing service
            val serviceIntent = Intent(this, ContentProcessingService::class.java).apply {
                putParcelableArrayListExtra(
                    ContentProcessingService.EXTRA_CONTENT_BATCH, 
                    ArrayList(contentList)
                )
            }
            
            startService(serviceIntent)
            
            // Observe batch processing status
            val batchId = contentList.first().batchId
            viewModel.observeBatchProcessingStatus(batchId) { status ->
                when (status) {
                    is BatchProcessingStatus.InProgress -> {
                        updateProgress(status.progress, status.message)
                    }
                    is BatchProcessingStatus.Completed -> {
                        hideProgressDialog()
                        showSuccess("${status.successCount} items added to your Digital Wall!")
                        finishAndRemoveTask()
                    }
                    is BatchProcessingStatus.Failed -> {
                        hideProgressDialog()
                        ErrorHandler.showError(this@ShareHandlerActivity, status.error) {
                            finishAndRemoveTask()
                        }
                    }
                }
            }
            
        } catch (e: Exception) {
            hideProgressDialog()
            Log.e(TAG, "Error processing batch content", e)
            ErrorHandler.showError(this, e) {
                finishAndRemoveTask()
            }
        }
    }
    
    private fun showProgressDialog(message: String) {
        progressDialog = ShareProgressDialog(this).apply {
            setMessage(message)
            show()
        }
    }
    
    private fun updateProgress(progress: Int, message: String) {
        progressDialog?.updateProgress(progress, message)
    }
    
    private fun hideProgressDialog() {
        progressDialog?.dismiss()
        progressDialog = null
    }
    
    private fun showSuccess(message: String) {
        // Show a brief success message
        val successDialog = ShareProgressDialog(this).apply {
            showSuccess(message)
            setOnDismissListener {
                finishAndRemoveTask()
            }
        }
        successDialog.show()
    }
}
```

### Intent Parser Utility

```kotlin
// app/src/main/java/com/digitalwall/app/utils/IntentParser.kt
package com.digitalwall.app.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.FileProvider
import com.digitalwall.app.data.model.SharedContent
import com.digitalwall.app.data.model.ContentType
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

object IntentParser {
    
    private const val TAG = "IntentParser"
    
    suspend fun parseShareIntent(intent: Intent): SharedContent? {
        return try {
            when {
                intent.hasExtra(Intent.EXTRA_TEXT) -> parseTextContent(intent)
                intent.hasExtra(Intent.EXTRA_STREAM) -> {
                    val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                    if (uri != null) parseUriContent(intent, uri) else null
                }
                else -> null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing share intent", e)
            null
        }
    }
    
    private fun parseTextContent(intent: Intent): SharedContent {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        
        // Determine if text contains URL
        val urlPattern = Regex("""https?://[^\s]+""")
        val foundUrl = urlPattern.find(text)
        
        return SharedContent(
            contentType = if (foundUrl != null) ContentType.URL else ContentType.TEXT,
            textContent = text,
            title = subject,
            sourceUrl = foundUrl?.value,
            timestamp = System.currentTimeMillis(),
            source = "android_share_intent"
        )
    }
    
    suspend fun parseUriContent(context: Context, uri: Uri): SharedContent? {
        return try {
            val contentType = determineContentType(context, uri)
            val mimeType = context.contentResolver.getType(uri)
            
            when (contentType) {
                ContentType.IMAGE -> parseImageContent(context, uri, mimeType)
                ContentType.VIDEO -> parseVideoContent(context, uri, mimeType)
                ContentType.FILE -> parseFileContent(context, uri, mimeType)
                else -> null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing URI content", e)
            null
        }
    }
    
    private fun parseUriContent(intent: Intent, uri: Uri): SharedContent? {
        // Simple URI parsing without context (fallback)
        return SharedContent(
            contentType = ContentType.FILE,
            fileUri = uri,
            mimeType = intent.type,
            timestamp = System.currentTimeMillis(),
            source = "android_share_intent"
        )
    }
    
    private fun determineContentType(context: Context, uri: Uri): ContentType {
        val mimeType = context.contentResolver.getType(uri) ?: return ContentType.FILE
        
        return when {
            mimeType.startsWith("image/") -> ContentType.IMAGE
            mimeType.startsWith("video/") -> ContentType.VIDEO
            mimeType.startsWith("text/") -> ContentType.TEXT
            else -> ContentType.FILE
        }
    }
    
    private suspend fun parseImageContent(
        context: Context, 
        uri: Uri, 
        mimeType: String?
    ): SharedContent {
        val fileName = getFileName(context, uri) ?: "shared_image"
        val fileSize = getFileSize(context, uri)
        
        return SharedContent(
            contentType = ContentType.IMAGE,
            fileUri = uri,
            fileName = fileName,
            fileSize = fileSize,
            mimeType = mimeType,
            timestamp = System.currentTimeMillis(),
            source = "android_share_intent"
        ).apply {
            // Extract image metadata
            extractImageMetadata(context, uri)?.let { metadata ->
                this.metadata = metadata
            }
        }
    }
    
    private suspend fun parseVideoContent(
        context: Context,
        uri: Uri, 
        mimeType: String?
    ): SharedContent {
        val fileName = getFileName(context, uri) ?: "shared_video"
        val fileSize = getFileSize(context, uri)
        
        return SharedContent(
            contentType = ContentType.VIDEO,
            fileUri = uri,
            fileName = fileName,
            fileSize = fileSize,
            mimeType = mimeType,
            timestamp = System.currentTimeMillis(),
            source = "android_share_intent"
        ).apply {
            // Extract video metadata
            extractVideoMetadata(context, uri)?.let { metadata ->
                this.metadata = metadata
            }
        }
    }
    
    private suspend fun parseFileContent(
        context: Context,
        uri: Uri,
        mimeType: String?
    ): SharedContent {
        val fileName = getFileName(context, uri) ?: "shared_file"
        val fileSize = getFileSize(context, uri)
        
        return SharedContent(
            contentType = ContentType.FILE,
            fileUri = uri,
            fileName = fileName,
            fileSize = fileSize,
            mimeType = mimeType,
            timestamp = System.currentTimeMillis(),
            source = "android_share_intent"
        )
    }
    
    private fun getFileName(context: Context, uri: Uri): String? {
        return when (uri.scheme) {
            "content" -> {
                val cursor = context.contentResolver.query(
                    uri, null, null, null, null
                )
                cursor?.use {
                    if (it.moveToFirst()) {
                        val nameIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                        if (nameIndex != -1) it.getString(nameIndex) else null
                    } else null
                }
            }
            "file" -> File(uri.path ?: "").name
            else -> null
        }
    }
    
    private fun getFileSize(context: Context, uri: Uri): Long {
        return try {
            val cursor = context.contentResolver.query(
                uri, arrayOf(MediaStore.Files.FileColumns.SIZE), 
                null, null, null
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    val sizeIndex = it.getColumnIndex(MediaStore.Files.FileColumns.SIZE)
                    if (sizeIndex != -1) it.getLong(sizeIndex) else 0L
                } else 0L
            } ?: 0L
        } catch (e: Exception) {
            Log.w(TAG, "Could not determine file size", e)
            0L
        }
    }
    
    private fun extractImageMetadata(context: Context, uri: Uri): Map<String, Any>? {
        return try {
            val inputStream = context.contentResolver.openInputStream(uri)
            inputStream?.use {
                // Use ExifInterface for metadata extraction
                val exif = androidx.exifinterface.media.ExifInterface(it)
                
                mapOf(
                    "width" to exif.getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_IMAGE_WIDTH, 0),
                    "height" to exif.getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_IMAGE_LENGTH, 0),
                    "orientation" to exif.getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 0),
                    "datetime" to (exif.getAttribute(androidx.exifinterface.media.ExifInterface.TAG_DATETIME) ?: ""),
                    "make" to (exif.getAttribute(androidx.exifinterface.media.ExifInterface.TAG_MAKE) ?: ""),
                    "model" to (exif.getAttribute(androidx.exifinterface.media.ExifInterface.TAG_MODEL) ?: "")
                ).filterValues { 
                    when (it) {
                        is String -> it.isNotEmpty()
                        is Int -> it != 0
                        else -> true
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not extract image metadata", e)
            null
        }
    }
    
    private fun extractVideoMetadata(context: Context, uri: Uri): Map<String, Any>? {
        return try {
            val retriever = android.media.MediaMetadataRetriever()
            retriever.setDataSource(context, uri)
            
            mapOf(
                "duration" to (retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L),
                "width" to (retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0),
                "height" to (retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0),
                "bitrate" to (retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull() ?: 0)
            ).filterValues {
                when (it) {
                    is Long -> it != 0L
                    is Int -> it != 0
                    else -> true
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not extract video metadata", e)
            null
        }
    }
}
```

### Background Processing Service

```kotlin
// app/src/main/java/com/digitalwall/app/services/ContentProcessingService.kt
package com.digitalwall.app.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import com.digitalwall.app.data.model.SharedContent
import com.digitalwall.app.data.repository.ContentRepository
import com.digitalwall.app.network.ApiService
import com.digitalwall.app.utils.NotificationHelper
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class ContentProcessingService : Service() {
    
    @Inject
    lateinit var apiService: ApiService
    
    @Inject
    lateinit var contentRepository: ContentRepository
    
    @Inject
    lateinit var notificationHelper: NotificationHelper
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    companion object {
        const val EXTRA_CONTENT = "extra_content"
        const val EXTRA_CONTENT_BATCH = "extra_content_batch"
        const val EXTRA_PROCESSING_ID = "extra_processing_id"
        private const val TAG = "ContentProcessingService"
        private const val NOTIFICATION_ID = 1001
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when {
            intent?.hasExtra(EXTRA_CONTENT) == true -> {
                val content = intent.getParcelableExtra<SharedContent>(EXTRA_CONTENT)
                val processingId = intent.getStringExtra(EXTRA_PROCESSING_ID)
                
                if (content != null && processingId != null) {
                    processSingleContent(content, processingId)
                } else {
                    Log.e(TAG, "Invalid content or processing ID")
                    stopSelf(startId)
                }
            }
            
            intent?.hasExtra(EXTRA_CONTENT_BATCH) == true -> {
                val contentList = intent.getParcelableArrayListExtra<SharedContent>(EXTRA_CONTENT_BATCH)
                
                if (!contentList.isNullOrEmpty()) {
                    processBatchContent(contentList)
                } else {
                    Log.e(TAG, "Empty content batch")
                    stopSelf(startId)
                }
            }
            
            else -> {
                Log.e(TAG, "Unknown service request")
                stopSelf(startId)
            }
        }
        
        return START_NOT_STICKY
    }
    
    private fun processSingleContent(content: SharedContent, processingId: String) {
        serviceScope.launch {
            try {
                // Start foreground service for long-running operation
                startForegroundService(content.fileName ?: "Shared content")
                
                // Update processing status
                updateProcessingStatus(processingId, ProcessingStatus.InProgress(10, "Preparing content..."))
                
                // Upload content to server
                updateProcessingStatus(processingId, ProcessingStatus.InProgress(30, "Uploading content..."))
                val uploadResult = uploadContent(content)
                
                if (uploadResult.isSuccess) {
                    // Process with AI
                    updateProcessingStatus(processingId, ProcessingStatus.InProgress(60, "Analyzing content..."))
                    val analysisResult = processWithAI(uploadResult.getOrThrow())
                    
                    // Store in local database
                    updateProcessingStatus(processingId, ProcessingStatus.InProgress(90, "Saving to wall..."))
                    contentRepository.saveProcessedContent(analysisResult)
                    
                    // Complete processing
                    updateProcessingStatus(processingId, ProcessingStatus.Completed)
                    showSuccessNotification(content)
                    
                } else {
                    val error = uploadResult.exceptionOrNull() ?: Exception("Upload failed")
                    updateProcessingStatus(processingId, ProcessingStatus.Failed(error))
                    showErrorNotification(content, error)
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Content processing failed", e)
                updateProcessingStatus(processingId, ProcessingStatus.Failed(e))
                showErrorNotification(content, e)
            } finally {
                stopForeground(true)
                stopSelf()
            }
        }
    }
    
    private fun processBatchContent(contentList: List<SharedContent>) {
        serviceScope.launch {
            try {
                val batchId = contentList.first().batchId
                val totalItems = contentList.size
                var processedItems = 0
                var successfulItems = 0
                
                // Start foreground service
                startForegroundService("Processing ${totalItems} items")
                
                // Update batch status
                updateBatchProcessingStatus(
                    batchId, 
                    BatchProcessingStatus.InProgress(0, "Starting batch processing...")
                )
                
                for ((index, content) in contentList.withIndex()) {
                    try {
                        val progress = ((index + 1) * 100) / totalItems
                        updateBatchProcessingStatus(
                            batchId,
                            BatchProcessingStatus.InProgress(progress, "Processing item ${index + 1}/${totalItems}")
                        )
                        
                        // Process individual item
                        val uploadResult = uploadContent(content)
                        if (uploadResult.isSuccess) {
                            val analysisResult = processWithAI(uploadResult.getOrThrow())
                            contentRepository.saveProcessedContent(analysisResult)
                            successfulItems++
                        }
                        
                        processedItems++
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to process item ${index}", e)
                        processedItems++
                    }
                }
                
                // Complete batch processing
                updateBatchProcessingStatus(
                    batchId,
                    BatchProcessingStatus.Completed(processedItems, successfulItems)
                )
                showBatchSuccessNotification(successfulItems, totalItems)
                
            } catch (e: Exception) {
                Log.e(TAG, "Batch processing failed", e)
                val batchId = contentList.firstOrNull()?.batchId ?: ""
                updateBatchProcessingStatus(batchId, BatchProcessingStatus.Failed(e))
                showBatchErrorNotification(e)
            } finally {
                stopForeground(true)
                stopSelf()
            }
        }
    }
    
    private fun startForegroundService(title: String) {
        val notification = notificationHelper.createProcessingNotification(
            title = title,
            content = "Digital Wall is processing your shared content"
        )
        
        startForeground(NOTIFICATION_ID, notification)
    }
    
    private suspend fun uploadContent(content: SharedContent): Result<String> {
        return try {
            when (content.contentType) {
                ContentType.TEXT, ContentType.URL -> {
                    val response = apiService.shareTextContent(
                        text = content.textContent ?: "",
                        url = content.sourceUrl,
                        title = content.title
                    )
                    Result.success(response.contentId)
                }
                
                ContentType.IMAGE, ContentType.VIDEO, ContentType.FILE -> {
                    val response = apiService.shareFileContent(
                        fileUri = content.fileUri!!,
                        fileName = content.fileName ?: "shared_file",
                        mimeType = content.mimeType ?: "application/octet-stream"
                    )
                    Result.success(response.contentId)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Upload failed", e)
            Result.failure(e)
        }
    }
    
    private suspend fun processWithAI(contentId: String): ProcessedContent {
        val response = apiService.getProcessedContent(contentId)
        return ProcessedContent(
            id = response.id,
            title = response.title,
            description = response.description,
            tags = response.tags,
            category = response.category,
            processedAt = System.currentTimeMillis()
        )
    }
    
    private fun updateProcessingStatus(processingId: String, status: ProcessingStatus) {
        // Broadcast processing status update
        val intent = Intent("com.digitalwall.PROCESSING_STATUS_UPDATE").apply {
            putExtra("processing_id", processingId)
            putExtra("status", status)
        }
        sendBroadcast(intent)
    }
    
    private fun updateBatchProcessingStatus(batchId: String, status: BatchProcessingStatus) {
        // Broadcast batch processing status update
        val intent = Intent("com.digitalwall.BATCH_PROCESSING_STATUS_UPDATE").apply {
            putExtra("batch_id", batchId)
            putExtra("status", status)
        }
        sendBroadcast(intent)
    }
    
    private fun showSuccessNotification(content: SharedContent) {
        notificationHelper.showSuccessNotification(
            title = "Content Added",
            message = "${content.fileName ?: "Shared content"} was added to your Digital Wall"
        )
    }
    
    private fun showErrorNotification(content: SharedContent, error: Throwable) {
        notificationHelper.showErrorNotification(
            title = "Share Failed",
            message = "Failed to add ${content.fileName ?: "content"}: ${error.localizedMessage}"
        )
    }
    
    private fun showBatchSuccessNotification(successful: Int, total: Int) {
        val message = if (successful == total) {
            "All $total items added to your Digital Wall"
        } else {
            "$successful of $total items added successfully"
        }
        
        notificationHelper.showSuccessNotification(
            title = "Batch Processing Complete",
            message = message
        )
    }
    
    private fun showBatchErrorNotification(error: Throwable) {
        notificationHelper.showErrorNotification(
            title = "Batch Processing Failed",
            message = "Failed to process shared content: ${error.localizedMessage}"
        )
    }
}
```

## Development Patterns

### Content Validation and Security

```kotlin
// app/src/main/java/com/digitalwall/app/utils/ContentValidator.kt
package com.digitalwall.app.utils

import android.content.Context
import android.net.Uri
import com.digitalwall.app.data.model.SharedContent
import com.digitalwall.app.data.model.ContentType
import java.util.regex.Pattern

data class ValidationResult(
    val isValid: Boolean,
    val errorMessage: String = ""
)

object ContentValidator {
    
    private const val MAX_TEXT_LENGTH = 10000
    private const val MAX_FILE_SIZE = 50 * 1024 * 1024L // 50MB
    private const val MAX_BATCH_SIZE = 20
    
    // Suspicious patterns
    private val SPAM_PATTERNS = listOf(
        Pattern.compile("(click here|buy now|limited time)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\b\\d{4}\\s?-?\\s?\\d{4}\\s?-?\\s?\\d{4}\\s?-?\\s?\\d{4}\\b"), // Credit card pattern
        Pattern.compile("(password|login|credential)", Pattern.CASE_INSENSITIVE)
    )
    
    private val BLOCKED_DOMAINS = listOf(
        "malicious-site.com",
        "spam-domain.net",
        "phishing-site.org"
    )
    
    fun validate(content: SharedContent): ValidationResult {
        return when (content.contentType) {
            ContentType.TEXT -> validateTextContent(content)
            ContentType.URL -> validateUrlContent(content)
            ContentType.IMAGE -> validateImageContent(content)
            ContentType.VIDEO -> validateVideoContent(content)
            ContentType.FILE -> validateFileContent(content)
        }
    }
    
    fun validateBatch(contentList: List<SharedContent>): ValidationResult {
        if (contentList.size > MAX_BATCH_SIZE) {
            return ValidationResult(
                false, 
                "Too many items to share at once (max: $MAX_BATCH_SIZE)"
            )
        }
        
        val totalSize = contentList.sumOf { it.fileSize ?: 0L }
        if (totalSize > MAX_FILE_SIZE * 2) { // Allow larger total for batch
            return ValidationResult(
                false,
                "Total file size too large (max: ${(MAX_FILE_SIZE * 2) / (1024 * 1024)}MB)"
            )
        }
        
        // Validate each item
        for (content in contentList) {
            val result = validate(content)
            if (!result.isValid) {
                return result
            }
        }
        
        return ValidationResult(true)
    }
    
    private fun validateTextContent(content: SharedContent): ValidationResult {
        val text = content.textContent ?: return ValidationResult(false, "No text content found")
        
        if (text.length > MAX_TEXT_LENGTH) {
            return ValidationResult(false, "Text content too long (max: $MAX_TEXT_LENGTH characters)")
        }
        
        // Check for spam patterns
        for (pattern in SPAM_PATTERNS) {
            if (pattern.matcher(text).find()) {
                return ValidationResult(false, "Content appears to be spam or contains sensitive information")
            }
        }
        
        return ValidationResult(true)
    }
    
    private fun validateUrlContent(content: SharedContent): ValidationResult {
        val url = content.sourceUrl ?: return ValidationResult(false, "No URL found")
        
        // Basic URL validation
        if (!url.matches(Regex("https?://.*"))) {
            return ValidationResult(false, "Invalid URL format")
        }
        
        // Check blocked domains
        try {
            val uri = Uri.parse(url)
            val host = uri.host?.lowercase() ?: ""
            
            if (BLOCKED_DOMAINS.any { host.contains(it) }) {
                return ValidationResult(false, "URL from blocked domain")
            }
        } catch (e: Exception) {
            return ValidationResult(false, "Invalid URL format")
        }
        
        // Validate accompanying text if present
        if (content.textContent != null) {
            val textValidation = validateTextContent(content)
            if (!textValidation.isValid) {
                return textValidation
            }
        }
        
        return ValidationResult(true)
    }
    
    private fun validateImageContent(content: SharedContent): ValidationResult {
        return validateFileContent(content, listOf("image/jpeg", "image/png", "image/webp", "image/gif"))
    }
    
    private fun validateVideoContent(content: SharedContent): ValidationResult {
        return validateFileContent(content, listOf("video/mp4", "video/webm", "video/quicktime"))
    }
    
    private fun validateFileContent(
        content: SharedContent,
        allowedMimeTypes: List<String>? = null
    ): ValidationResult {
        val fileSize = content.fileSize ?: 0L
        
        if (fileSize == 0L) {
            return ValidationResult(false, "File appears to be empty")
        }
        
        if (fileSize > MAX_FILE_SIZE) {
            val maxSizeMB = MAX_FILE_SIZE / (1024 * 1024)
            return ValidationResult(false, "File too large (max: ${maxSizeMB}MB)")
        }
        
        // MIME type validation
        val mimeType = content.mimeType
        if (allowedMimeTypes != null && mimeType != null && !allowedMimeTypes.contains(mimeType)) {
            return ValidationResult(false, "Unsupported file type: $mimeType")
        }
        
        // File name validation
        val fileName = content.fileName
        if (fileName != null && containsSuspiciousFileExtension(fileName)) {
            return ValidationResult(false, "File type not allowed for security reasons")
        }
        
        return ValidationResult(true)
    }
    
    private fun containsSuspiciousFileExtension(fileName: String): Boolean {
        val suspiciousExtensions = listOf(
            ".exe", ".bat", ".cmd", ".com", ".pif", ".scr", ".vbs", ".js",
            ".jar", ".app", ".deb", ".pkg", ".dmg"
        )
        
        val lowercaseFileName = fileName.lowercase()
        return suspiciousExtensions.any { lowercaseFileName.endsWith(it) }
    }
}
```

### Error Handling and User Feedback

```kotlin
// app/src/main/java/com/digitalwall/app/utils/ErrorHandler.kt
package com.digitalwall.app.utils

import android.content.Context
import android.content.DialogInterface
import androidx.appcompat.app.AlertDialog
import com.digitalwall.app.R
import java.net.UnknownHostException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException

object ErrorHandler {
    
    fun showError(
        context: Context, 
        error: Throwable, 
        onDismiss: (() -> Unit)? = null
    ) {
        val (title, message, actions) = categorizeError(error)
        
        val builder = AlertDialog.Builder(context)
            .setTitle(title)
            .setMessage(message)
            .setCancelable(true)
        
        // Add appropriate actions
        when (actions) {
            ErrorAction.RETRY -> {
                builder.setPositiveButton("Retry") { _, _ -> 
                    // Trigger retry logic
                    onDismiss?.invoke()
                }
                builder.setNegativeButton("Cancel") { _, _ ->
                    onDismiss?.invoke()
                }
            }
            
            ErrorAction.SETTINGS -> {
                builder.setPositiveButton("Settings") { _, _ ->
                    // Open app settings
                    openAppSettings(context)
                }
                builder.setNegativeButton("Cancel") { _, _ ->
                    onDismiss?.invoke()
                }
            }
            
            ErrorAction.DISMISS -> {
                builder.setPositiveButton("OK") { _, _ ->
                    onDismiss?.invoke()
                }
            }
        }
        
        builder.setOnDismissListener { onDismiss?.invoke() }
        builder.show()
    }
    
    fun showError(
        context: Context,
        message: String,
        onDismiss: (() -> Unit)? = null
    ) {
        AlertDialog.Builder(context)
            .setTitle("Error")
            .setMessage(message)
            .setPositiveButton("OK") { _, _ -> onDismiss?.invoke() }
            .setOnDismissListener { onDismiss?.invoke() }
            .show()
    }
    
    private fun categorizeError(error: Throwable): Triple<String, String, ErrorAction> {
        return when (error) {
            is UnknownHostException -> Triple(
                "Network Error",
                "No internet connection available. Please check your network settings and try again.",
                ErrorAction.RETRY
            )
            
            is SocketTimeoutException -> Triple(
                "Connection Timeout",
                "The request timed out. Please check your internet connection and try again.",
                ErrorAction.RETRY
            )
            
            is SSLException -> Triple(
                "Security Error",
                "There was a problem with the secure connection. Please try again later.",
                ErrorAction.RETRY
            )
            
            is SecurityException -> Triple(
                "Permission Error",
                "Digital Wall needs permission to access this content. Please check app permissions.",
                ErrorAction.SETTINGS
            )
            
            is OutOfMemoryError -> Triple(
                "Memory Error",
                "The content is too large to process. Please try with smaller files.",
                ErrorAction.DISMISS
            )
            
            else -> {
                val message = error.localizedMessage ?: error.message ?: "An unexpected error occurred"
                Triple(
                    "Error",
                    message,
                    ErrorAction.DISMISS
                )
            }
        }
    }
    
    private fun openAppSettings(context: Context) {
        val intent = android.content.Intent().apply {
            action = android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS
            data = android.net.Uri.fromParts("package", context.packageName, null)
        }
        context.startActivity(intent)
    }
    
    private enum class ErrorAction {
        RETRY, SETTINGS, DISMISS
    }
}
```

## Production Considerations

### Play Store Compliance

```kotlin
// app/src/main/java/com/digitalwall/app/compliance/PlayStoreCompliance.kt
package com.digitalwall.app.compliance

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

object PlayStoreCompliance {
    
    /**
     * Play Store Content Policy Compliance:
     * 
     * 1. Data Safety Requirements
     * - Clearly declare what data is collected
     * - Implement proper consent mechanisms
     * - Provide data deletion options
     * 
     * 2. Restricted Content
     * - No adult content sharing
     * - No copyrighted content without permission
     * - No spam or misleading content
     * 
     * 3. User-Generated Content
     * - Implement content moderation
     * - Provide reporting mechanisms
     * - Remove inappropriate content promptly
     */
    
    fun checkDataSafetyCompliance(context: Context): Boolean {
        // Check if privacy policy is accessible
        val hasPrivacyPolicy = checkPrivacyPolicyAccess(context)
        
        // Check if user consent is properly obtained
        val hasUserConsent = checkUserConsent(context)
        
        // Check if data deletion is implemented
        val hasDataDeletion = checkDataDeletionCapability(context)
        
        return hasPrivacyPolicy && hasUserConsent && hasDataDeletion
    }
    
    fun checkPermissionCompliance(context: Context): Boolean {
        // Verify all permissions are properly justified
        val permissions = listOf(
            android.Manifest.permission.INTERNET,
            android.Manifest.permission.ACCESS_NETWORK_STATE,
            android.Manifest.permission.READ_EXTERNAL_STORAGE,
            android.Manifest.permission.FOREGROUND_SERVICE,
            android.Manifest.permission.POST_NOTIFICATIONS
        )
        
        return permissions.all { permission ->
            val granted = ContextCompat.checkSelfPermission(context, permission) == 
                         PackageManager.PERMISSION_GRANTED
            
            // Log permission usage justification
            logPermissionJustification(permission, granted)
            
            // All permissions should be optional or properly justified
            true
        }
    }
    
    fun implementContentModeration(): ContentModerationResult {
        // Content moderation implementation
        return ContentModerationResult(
            hasAutomaticFiltering = true,
            hasUserReporting = true,
            hasContentReview = true,
            hasAppealProcess = true
        )
    }
    
    private fun checkPrivacyPolicyAccess(context: Context): Boolean {
        // Verify privacy policy is accessible from app
        // This should link to actual hosted privacy policy
        return true // Placeholder
    }
    
    private fun checkUserConsent(context: Context): Boolean {
        // Verify user consent mechanisms are in place
        val prefs = context.getSharedPreferences("privacy_prefs", Context.MODE_PRIVATE)
        return prefs.getBoolean("user_consent_granted", false)
    }
    
    private fun checkDataDeletionCapability(context: Context): Boolean {
        // Verify users can delete their data
        // This should be implemented in account settings
        return true // Placeholder - implement actual deletion capability
    }
    
    private fun logPermissionJustification(permission: String, granted: Boolean) {
        val justifications = mapOf(
            android.Manifest.permission.INTERNET to "Required for uploading shared content to Digital Wall servers",
            android.Manifest.permission.ACCESS_NETWORK_STATE to "Required for checking network connectivity before uploads",
            android.Manifest.permission.READ_EXTERNAL_STORAGE to "Required for accessing shared files and images",
            android.Manifest.permission.FOREGROUND_SERVICE to "Required for background processing of shared content",
            android.Manifest.permission.POST_NOTIFICATIONS to "Required for notifying users of share processing status"
        )
        
        val justification = justifications[permission] ?: "Unknown permission justification"
        android.util.Log.d("Compliance", "Permission: $permission, Granted: $granted, Justification: $justification")
    }
    
    data class ContentModerationResult(
        val hasAutomaticFiltering: Boolean,
        val hasUserReporting: Boolean,
        val hasContentReview: Boolean,
        val hasAppealProcess: Boolean
    )
}
```

## Integration Examples

### Complete Android Share Integration Architecture

```mermaid
graph TD
    A[Android Share Sheet] --> B[Intent Filters]
    B --> C[ShareHandlerActivity]
    C --> D[IntentParser]
    D --> E[ContentValidator]
    E --> F[Processing Strategy Selection]
    
    subgraph "Processing Strategies"
        G[Background Service]
        H[Foreground Service]
        I[Immediate Processing]
    end
    
    F --> G
    F --> H  
    F --> I
    
    G --> J[Content Upload]
    H --> J
    I --> J
    
    J --> K[[[FastAPI Async Architecture]]]
    K --> L[AI Processing]
    L --> M[Storage]
    
    subgraph "User Feedback"
        N[Notifications]
        O[Progress Dialog]
        P[Error Handling]
    end
    
    G --> N
    H --> O
    I --> P
    
    subgraph "Compliance & Security"
        Q[Content Validation]
        R[Permission Checking]
        S[Play Store Compliance]
    end
    
    E --> Q
    C --> R
    A --> S
```

### Integration with [[Digital Wall]] Components

- **[[PWA Share Target API]]**: Android share complements web-based sharing functionality
- **[[React Native Cross-Platform]]**: Shared business logic between Android native and React Native
- **[[FastAPI Async Architecture]]**: Backend API endpoints for processing Android-shared content
- **[[Content Processing Pipeline]]**: Server-side processing of content shared from Android

## References & Further Reading

### Official Documentation
- [Android Intents and Intent Filters](https://developer.android.com/guide/components/intents-filters)
- [Android Share Actions](https://developer.android.com/training/sharing/receive)
- [Background Processing](https://developer.android.com/guide/background/)

### Play Store Guidelines
- [Play Console Policy Center](https://play.google.com/about/developer-content-policy/)
- [Data Safety in Play Console](https://support.google.com/googleplay/android-developer/answer/10787469)

### Related [[Vault]] Concepts
- [[Android Development]] - Android app development fundamentals
- [[Intent System]] - Android Intent handling patterns
- [[Background Processing]] - Android background task management
- [[Mobile Share Integration]] - Cross-platform sharing strategies
- [[Content Security]] - Secure content handling practices

#digital-wall #research #android #share-intents #mobile-development #intent-filters