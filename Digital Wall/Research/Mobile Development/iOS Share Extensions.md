# [[iOS Share Extensions]] - Native Integration Guide

## Overview & Core Concepts

**iOS Share Extensions** enable the [[Digital Wall]] app to appear as a native sharing destination throughout iOS, providing seamless content sharing from any app. This document covers comprehensive implementation patterns for iOS Action Extensions, JavaScript Bridge communication, and App Store compliance.

### Key iOS Share Integration Components
- **[[Action Extension]]**: iOS extension that appears in the share sheet
- **[[JavaScript Bridge]]**: Communication layer between extension and main app
- **[[Background Processing]]**: Handling shared content without launching main app
- **[[Universal Links]]**: Deep linking between extension and main app
- **[[App Groups]]**: Shared data container between extension and app

## Technical Deep Dive

### Action Extension Implementation

```swift
// ShareExtension/ShareViewController.swift - Main Share Extension controller
import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {
    
    private var sharedContent: SharedContent?
    private let maxCharacterCount = 500
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Customize appearance
        title = "Add to Digital Wall"
        placeholder = "Add a note about this content..."
        
        // Set character count
        charactersRemaining = maxCharacterCount
        
        // Extract shared content
        extractSharedContent()
    }
    
    override func isContentValid() -> Bool {
        // Validation logic
        guard let content = sharedContent else { return false }
        
        // Check text length
        if let text = contentText, text.count > maxCharacterCount {
            return false
        }
        
        // Validate content type
        return content.isValid()
    }
    
    override func didSelectPost() {
        // This method is called when user taps "Post"
        guard let content = sharedContent else {
            cancel()
            return
        }
        
        // Add user note
        content.userNote = contentText
        
        // Process the shared content
        processSharedContent(content) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    self?.extensionContext?.completeRequest(
                        returningItems: [],
                        completionHandler: nil
                    )
                case .failure(let error):
                    self?.showError(error)
                }
            }
        }
    }
    
    override func configurationItems() -> [Any]! {
        // Custom configuration items
        let wallSelector = SLComposeSheetConfigurationItem()!
        wallSelector.title = "Wall"
        wallSelector.value = "Personal Wall"
        wallSelector.tapHandler = { [weak self] in
            self?.showWallSelector()
        }
        
        return [wallSelector]
    }
    
    // MARK: - Content Extraction
    
    private func extractSharedContent() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem else {
            return
        }
        
        let group = DispatchGroup()
        var extractedContent = SharedContent()
        
        // Process all attachments
        for provider in extensionItem.attachments ?? [] {
            group.enter()
            
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                extractURL(from: provider) { url in
                    extractedContent.url = url
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                extractText(from: provider) { text in
                    extractedContent.text = text
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                extractImage(from: provider) { image in
                    extractedContent.image = image
                    group.leave()
                }
            } else {
                group.leave()
            }
        }
        
        group.notify(queue: .main) { [weak self] in
            self?.sharedContent = extractedContent
            self?.validateContent()
        }
    }
    
    private func extractURL(from provider: NSItemProvider, completion: @escaping (URL?) -> Void) {
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { (item, error) in
            if let url = item as? URL {
                completion(url)
            } else if let data = item as? Data, let urlString = String(data: data, encoding: .utf8) {
                completion(URL(string: urlString))
            } else {
                completion(nil)
            }
        }
    }
    
    private func extractText(from provider: NSItemProvider, completion: @escaping (String?) -> Void) {
        provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { (item, error) in
            completion(item as? String)
        }
    }
    
    private func extractImage(from provider: NSItemProvider, completion: @escaping (UIImage?) -> Void) {
        provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { (item, error) in
            if let url = item as? URL {
                // Load image from URL
                if let data = try? Data(contentsOf: url) {
                    completion(UIImage(data: data))
                } else {
                    completion(nil)
                }
            } else if let image = item as? UIImage {
                completion(image)
            } else {
                completion(nil)
            }
        }
    }
    
    // MARK: - Content Processing
    
    private func processSharedContent(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void) {
        // Show loading state
        showLoadingIndicator()
        
        // Try different processing strategies
        let strategies: [ContentProcessingStrategy] = [
            BackgroundProcessingStrategy(),
            MainAppProcessingStrategy(),
            LocalStorageStrategy()
        ]
        
        processWithStrategies(content, strategies: strategies, completion: completion)
    }
    
    private func processWithStrategies(_ content: SharedContent, strategies: [ContentProcessingStrategy], completion: @escaping (Result<Void, Error>) -> Void) {
        
        guard let strategy = strategies.first else {
            completion(.failure(ShareExtensionError.allStrategiesFailed))
            return
        }
        
        let remainingStrategies = Array(strategies.dropFirst())
        
        strategy.process(content) { [weak self] result in
            switch result {
            case .success:
                completion(.success(()))
            case .failure(let error):
                if remainingStrategies.isEmpty {
                    completion(.failure(error))
                } else {
                    // Try next strategy
                    self?.processWithStrategies(content, strategies: remainingStrategies, completion: completion)
                }
            }
        }
    }
}

// MARK: - Content Processing Strategies

protocol ContentProcessingStrategy {
    func process(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void)
}

class BackgroundProcessingStrategy: ContentProcessingStrategy {
    func process(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void) {
        // Send content directly to API without opening main app
        let networkManager = NetworkManager()
        
        networkManager.uploadContent(content) { result in
            completion(result)
        }
    }
}

class MainAppProcessingStrategy: ContentProcessingStrategy {
    func process(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void) {
        // Store content locally and open main app
        do {
            try SharedDataManager.saveSharedContent(content)
            
            // Open main app with deep link
            let deepLinkURL = URL(string: "digitalwall://process-shared-content?id=\(content.id)")!
            
            var responder = UIApplication.shared as UIResponder?
            while responder != nil {
                if let application = responder as? UIApplication {
                    application.open(deepLinkURL, options: [:]) { success in
                        completion(success ? .success(()) : .failure(ShareExtensionError.failedToOpenMainApp))
                    }
                    return
                }
                responder = responder?.next
            }
            
            completion(.failure(ShareExtensionError.failedToOpenMainApp))
        } catch {
            completion(.failure(error))
        }
    }
}

class LocalStorageStrategy: ContentProcessingStrategy {
    func process(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void) {
        // Store for later processing
        do {
            try SharedDataManager.queueForLaterProcessing(content)
            completion(.success(()))
        } catch {
            completion(.failure(error))
        }
    }
}
```

### Shared Data Management

```swift
// Shared/SharedDataManager.swift - Data sharing between extension and app
import Foundation

class SharedDataManager {
    private static let appGroupIdentifier = "group.com.digitalwall.app"
    private static let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier)!
    private static let fileManager = FileManager.default
    
    // MARK: - Shared Container
    
    private static var sharedContainerURL: URL {
        return fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)!
    }
    
    private static var sharedContentDirectory: URL {
        let url = sharedContainerURL.appendingPathComponent("SharedContent", isDirectory: true)
        
        // Ensure directory exists
        try? fileManager.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
        
        return url
    }
    
    // MARK: - Content Persistence
    
    static func saveSharedContent(_ content: SharedContent) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        
        let data = try encoder.encode(content)
        let fileURL = sharedContentDirectory.appendingPathComponent("\(content.id).json")
        
        try data.write(to: fileURL)
        
        // Update shared queue
        var queue = getSharedContentQueue()
        queue.append(content.id)
        setSharedContentQueue(queue)
        
        // Notify main app if possible
        notifyMainApp(about: content.id)
    }
    
    static func loadSharedContent(id: String) throws -> SharedContent {
        let fileURL = sharedContentDirectory.appendingPathComponent("\(id).json")
        let data = try Data(contentsOf: fileURL)
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        
        return try decoder.decode(SharedContent.self, from: data)
    }
    
    static func deleteSharedContent(id: String) throws {
        let fileURL = sharedContentDirectory.appendingPathComponent("\(id).json")
        try fileManager.removeItem(at: fileURL)
        
        // Remove from queue
        var queue = getSharedContentQueue()
        queue.removeAll { $0 == id }
        setSharedContentQueue(queue)
    }
    
    static func getAllPendingContent() -> [SharedContent] {
        let queue = getSharedContentQueue()
        
        return queue.compactMap { id in
            try? loadSharedContent(id: id)
        }
    }
    
    // MARK: - Queue Management
    
    private static func getSharedContentQueue() -> [String] {
        return sharedDefaults.stringArray(forKey: "SharedContentQueue") ?? []
    }
    
    private static func setSharedContentQueue(_ queue: [String]) {
        sharedDefaults.set(queue, forKey: "SharedContentQueue")
    }
    
    static func queueForLaterProcessing(_ content: SharedContent) throws {
        try saveSharedContent(content)
        
        // Mark as queued
        sharedDefaults.set(true, forKey: "HasPendingContent")
        sharedDefaults.synchronize()
    }
    
    static func hasPendingContent() -> Bool {
        return sharedDefaults.bool(forKey: "HasPendingContent")
    }
    
    static func clearPendingFlag() {
        sharedDefaults.removeObject(forKey: "HasPendingContent")
        sharedDefaults.synchronize()
    }
    
    // MARK: - Inter-App Communication
    
    private static func notifyMainApp(about contentId: String) {
        // Post notification that can be observed by main app
        sharedDefaults.set(contentId, forKey: "LastSharedContentId")
        sharedDefaults.set(Date(), forKey: "LastShareTimestamp")
        sharedDefaults.synchronize()
        
        // Trigger background fetch if app supports it
        let notification = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterPostNotification(
            notification,
            CFNotificationName("com.digitalwall.contentShared" as CFString),
            nil,
            nil,
            true
        )
    }
}
```

### Network Communication

```swift
// Shared/NetworkManager.swift - Network layer for extension
import Foundation
import Network

class NetworkManager {
    private let baseURL = "https://api.digitalwall.app/v1"
    private let session: URLSession
    private let monitor = NWPathMonitor()
    
    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30.0
        config.timeoutIntervalForResource = 60.0
        
        self.session = URLSession(configuration: config)
        
        // Monitor network connectivity
        startNetworkMonitoring()
    }
    
    // MARK: - Content Upload
    
    func uploadContent(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void) {
        
        // Check network connectivity
        guard isNetworkAvailable() else {
            completion(.failure(NetworkError.noConnection))
            return
        }
        
        // Prepare request
        guard let request = createUploadRequest(for: content) else {
            completion(.failure(NetworkError.invalidRequest))
            return
        }
        
        // Upload with retry logic
        uploadWithRetry(request: request, retryCount: 0, completion: completion)
    }
    
    private func createUploadRequest(for content: SharedContent) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)/share") else { return nil }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add authentication if available
        if let token = getAuthToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Prepare request body
        do {
            let uploadData = ShareUploadData(
                contentType: content.type.rawValue,
                url: content.url?.absoluteString,
                text: content.text,
                title: content.extractedTitle,
                userNote: content.userNote,
                timestamp: content.createdAt,
                source: "ios_share_extension"
            )
            
            request.httpBody = try JSONEncoder().encode(uploadData)
            
            return request
        } catch {
            return nil
        }
    }
    
    private func uploadWithRetry(request: URLRequest, retryCount: Int, completion: @escaping (Result<Void, Error>) -> Void) {
        
        session.dataTask(with: request) { [weak self] data, response, error in
            
            if let error = error {
                // Retry on network errors
                if retryCount < 3 && self?.shouldRetry(error: error) == true {
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(retryCount + 1)) {
                        self?.uploadWithRetry(request: request, retryCount: retryCount + 1, completion: completion)
                    }
                } else {
                    completion(.failure(error))
                }
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(NetworkError.invalidResponse))
                return
            }
            
            switch httpResponse.statusCode {
            case 200...299:
                completion(.success(()))
            case 429: // Rate limited
                if retryCount < 2 {
                    let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After") ?? "5"
                    let delay = Double(retryAfter) ?? 5.0
                    
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                        self?.uploadWithRetry(request: request, retryCount: retryCount + 1, completion: completion)
                    }
                } else {
                    completion(.failure(NetworkError.rateLimited))
                }
            case 401:
                completion(.failure(NetworkError.unauthorized))
            default:
                completion(.failure(NetworkError.serverError(httpResponse.statusCode)))
            }
        }.resume()
    }
    
    private func shouldRetry(error: Error) -> Bool {
        // Retry on network connectivity issues
        let nsError = error as NSError
        
        let retryableCodes = [
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorNetworkConnectionLost
        ]
        
        return retryableCodes.contains(nsError.code)
    }
    
    // MARK: - Network Monitoring
    
    private func startNetworkMonitoring() {
        monitor.pathUpdateHandler = { path in
            // Handle network state changes
            if path.status == .satisfied {
                self.processQueuedRequests()
            }
        }
        
        let queue = DispatchQueue(label: "NetworkMonitor")
        monitor.start(queue: queue)
    }
    
    private func isNetworkAvailable() -> Bool {
        return monitor.currentPath.status == .satisfied
    }
    
    private func processQueuedRequests() {
        // Process any queued requests when network becomes available
        let queuedContent = SharedDataManager.getAllPendingContent()
        
        for content in queuedContent {
            uploadContent(content) { result in
                switch result {
                case .success:
                    try? SharedDataManager.deleteSharedContent(id: content.id)
                case .failure:
                    // Keep in queue for retry
                    break
                }
            }
        }
        
        if queuedContent.isEmpty {
            SharedDataManager.clearPendingFlag()
        }
    }
    
    // MARK: - Authentication
    
    private func getAuthToken() -> String? {
        // Get auth token from keychain or shared defaults
        return SharedDataManager.sharedDefaults.string(forKey: "AuthToken")
    }
}

// MARK: - Data Models

struct ShareUploadData: Codable {
    let contentType: String
    let url: String?
    let text: String?
    let title: String?
    let userNote: String?
    let timestamp: Date
    let source: String
}

enum NetworkError: LocalizedError {
    case noConnection
    case invalidRequest
    case invalidResponse
    case unauthorized
    case rateLimited
    case serverError(Int)
    
    var errorDescription: String? {
        switch self {
        case .noConnection:
            return "No network connection available"
        case .invalidRequest:
            return "Invalid request"
        case .invalidResponse:
            return "Invalid server response"
        case .unauthorized:
            return "Authentication required"
        case .rateLimited:
            return "Too many requests, please try again later"
        case .serverError(let code):
            return "Server error: \(code)"
        }
    }
}
```

### Main App Integration

```swift
// DigitalWallApp/AppDelegate.swift - Main app integration
import UIKit
import UserNotifications

class AppDelegate: UIResponder, UIApplicationDelegate {
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Set up extension communication
        setupExtensionCommunication()
        
        // Check for pending shared content
        checkForPendingSharedContent()
        
        return true
    }
    
    // MARK: - Extension Communication
    
    private func setupExtensionCommunication() {
        // Listen for Darwin notifications from extension
        let notification = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterAddObserver(
            notification,
            Unmanaged.passUnretained(self).toOpaque(),
            { (_, observer, name, _, _) in
                guard let observer = observer else { return }
                let appDelegate = Unmanaged<AppDelegate>.fromOpaque(observer).takeUnretainedValue()
                appDelegate.handleSharedContentNotification()
            },
            "com.digitalwall.contentShared" as CFString,
            nil,
            .deliverImmediately
        )
    }
    
    private func handleSharedContentNotification() {
        DispatchQueue.main.async {
            self.checkForPendingSharedContent()
        }
    }
    
    private func checkForPendingSharedContent() {
        if SharedDataManager.hasPendingContent() {
            processPendingSharedContent()
        }
    }
    
    private func processPendingSharedContent() {
        let pendingContent = SharedDataManager.getAllPendingContent()
        
        for content in pendingContent {
            // Process content through main app pipeline
            ContentProcessingService.shared.process(content) { [weak self] result in
                switch result {
                case .success:
                    try? SharedDataManager.deleteSharedContent(id: content.id)
                    self?.showSuccessNotification()
                case .failure(let error):
                    self?.showErrorNotification(error)
                }
            }
        }
        
        SharedDataManager.clearPendingFlag()
    }
    
    // MARK: - URL Handling
    
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        
        // Handle deep links from extension
        if url.scheme == "digitalwall" {
            return handleDigitalWallURL(url)
        }
        
        return false
    }
    
    private func handleDigitalWallURL(_ url: URL) -> Bool {
        guard url.host == "process-shared-content" else { return false }
        
        // Extract content ID from URL
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        guard let contentId = components?.queryItems?.first(where: { $0.name == "id" })?.value else {
            return false
        }
        
        // Load and process shared content
        do {
            let content = try SharedDataManager.loadSharedContent(id: contentId)
            
            // Navigate to appropriate screen
            navigateToContentProcessing(content: content)
            
            return true
        } catch {
            showErrorNotification(error)
            return false
        }
    }
    
    private func navigateToContentProcessing(content: SharedContent) {
        // Navigate to content processing screen
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first {
            
            let storyboard = UIStoryboard(name: "Main", bundle: nil)
            if let processingVC = storyboard.instantiateViewController(withIdentifier: "ContentProcessingViewController") as? ContentProcessingViewController {
                processingVC.sharedContent = content
                
                let navController = UINavigationController(rootViewController: processingVC)
                window.rootViewController?.present(navController, animated: true)
            }
        }
    }
    
    // MARK: - Notifications
    
    private func showSuccessNotification() {
        let content = UNMutableNotificationContent()
        content.title = "Content Added"
        content.body = "Your shared content has been added to Digital Wall"
        content.sound = .default
        
        let request = UNNotificationRequest(
            identifier: "content_added",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
    
    private func showErrorNotification(_ error: Error) {
        let content = UNMutableNotificationContent()
        content.title = "Share Failed"
        content.body = error.localizedDescription
        content.sound = .default
        
        let request = UNNotificationRequest(
            identifier: "share_error",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
}
```

## Development Patterns

### Error Handling and Fallbacks

```swift
// Shared/ErrorHandling.swift - Comprehensive error handling
import Foundation

enum ShareExtensionError: LocalizedError {
    case noValidContent
    case networkUnavailable
    case authenticationRequired
    case quotaExceeded
    case contentTooLarge
    case unsupportedContentType
    case allStrategiesFailed
    case failedToOpenMainApp
    
    var errorDescription: String? {
        switch self {
        case .noValidContent:
            return "No valid content found to share"
        case .networkUnavailable:
            return "Network connection unavailable. Content will be processed when connection is restored."
        case .authenticationRequired:
            return "Please sign in to Digital Wall to share content"
        case .quotaExceeded:
            return "Daily sharing quota exceeded. Please try again tomorrow."
        case .contentTooLarge:
            return "Content is too large to share. Please try with smaller content."
        case .unsupportedContentType:
            return "This type of content is not supported for sharing"
        case .allStrategiesFailed:
            return "Unable to process shared content. Please try again later."
        case .failedToOpenMainApp:
            return "Unable to open Digital Wall app"
        }
    }
    
    var isRetryable: Bool {
        switch self {
        case .networkUnavailable, .allStrategiesFailed:
            return true
        case .noValidContent, .authenticationRequired, .quotaExceeded, .contentTooLarge, .unsupportedContentType, .failedToOpenMainApp:
            return false
        }
    }
    
    var shouldStoreForLater: Bool {
        switch self {
        case .networkUnavailable, .allStrategiesFailed:
            return true
        default:
            return false
        }
    }
}

class ErrorHandler {
    static func handle(_ error: Error, in viewController: UIViewController, completion: @escaping (Bool) -> Void) {
        
        let alert = UIAlertController(
            title: "Share Error",
            message: error.localizedDescription,
            preferredStyle: .alert
        )
        
        if let shareError = error as? ShareExtensionError {
            if shareError.shouldStoreForLater {
                alert.addAction(UIAlertAction(title: "Save for Later", style: .default) { _ in
                    completion(true)  // Continue with local storage
                })
            }
            
            if shareError.isRetryable {
                alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in
                    completion(false)  // Trigger retry
                })
            }
        }
        
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            completion(false)
        })
        
        viewController.present(alert, animated: true)
    }
}
```

### Testing and Validation

```swift
// Tests/ShareExtensionTests.swift - Extension testing framework
import XCTest
@testable import ShareExtension

class ShareExtensionTests: XCTestCase {
    
    var shareViewController: ShareViewController!
    var mockExtensionContext: MockExtensionContext!
    
    override func setUp() {
        super.setUp()
        
        shareViewController = ShareViewController()
        mockExtensionContext = MockExtensionContext()
        shareViewController.extensionContext = mockExtensionContext
    }
    
    func testURLExtraction() {
        // Test URL extraction from share sheet
        let testURL = URL(string: "https://example.com")!
        let provider = MockItemProvider(url: testURL)
        
        let expectation = XCTestExpectation(description: "URL extracted")
        
        shareViewController.extractURL(from: provider) { url in
            XCTAssertEqual(url, testURL)
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testContentValidation() {
        // Test content validation logic
        let validContent = SharedContent()
        validContent.url = URL(string: "https://example.com")
        validContent.text = "Valid content"
        
        shareViewController.sharedContent = validContent
        XCTAssertTrue(shareViewController.isContentValid())
        
        // Test invalid content
        let invalidContent = SharedContent()
        shareViewController.sharedContent = invalidContent
        XCTAssertFalse(shareViewController.isContentValid())
    }
    
    func testNetworkFallback() {
        // Test network failure fallback to local storage
        let mockNetworkManager = MockNetworkManager()
        mockNetworkManager.shouldFail = true
        
        let content = SharedContent()
        content.url = URL(string: "https://example.com")
        
        let expectation = XCTestExpectation(description: "Fallback executed")
        
        let strategies: [ContentProcessingStrategy] = [
            MockBackgroundProcessingStrategy(networkManager: mockNetworkManager),
            MockLocalStorageStrategy()
        ]
        
        shareViewController.processWithStrategies(content, strategies: strategies) { result in
            switch result {
            case .success:
                expectation.fulfill()
            case .failure:
                XCTFail("Should have fallen back to local storage")
            }
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
}

// MARK: - Mock Objects

class MockExtensionContext: NSExtensionContext {
    var completionCalled = false
    
    override func completeRequest(returningItems items: [Any]?, completionHandler: ((Bool) -> Void)? = nil) {
        completionCalled = true
        completionHandler?(true)
    }
}

class MockItemProvider: NSItemProvider {
    private let testURL: URL
    
    init(url: URL) {
        self.testURL = url
        super.init()
    }
    
    override func hasItemConformingToTypeIdentifier(_ typeIdentifier: String) -> Bool {
        return typeIdentifier == UTType.url.identifier
    }
    
    override func loadItem(forTypeIdentifier typeIdentifier: String, options: [AnyHashable : Any]? = nil, completionHandler: NSItemProvider.CompletionHandler? = nil) {
        completionHandler?(testURL, nil)
    }
}

class MockNetworkManager: NetworkManager {
    var shouldFail = false
    
    override func uploadContent(_ content: SharedContent, completion: @escaping (Result<Void, Error>) -> Void) {
        if shouldFail {
            completion(.failure(NetworkError.noConnection))
        } else {
            completion(.success(()))
        }
    }
}
```

## Production Considerations

### App Store Guidelines Compliance

```swift
// Documentation/AppStoreGuidelines.swift - App Store compliance notes

/*
 App Store Review Guidelines for Share Extensions:
 
 1. Extension Functionality (Guideline 4.7)
    - Extensions must provide a clear, defined function
    - Must not duplicate main app functionality unnecessarily
    - Should enhance user experience without being intrusive
 
 2. User Interface Guidelines (Guideline 4.5.1)
    - Extensions should follow iOS design guidelines
    - Interface should be intuitive and consistent with iOS
    - Loading states and error handling must be user-friendly
 
 3. Data Collection (Guideline 5.1.1)
    - Clearly communicate what data is collected
    - Obtain user consent for data usage
    - Provide privacy policy covering extension data usage
 
 4. Performance Guidelines (Guideline 2.5.1)
    - Extensions should launch quickly
    - Memory usage should be minimal
    - Should not crash or freeze
    - Must handle errors gracefully
 
 5. Content Guidelines (Guideline 1.2)
    - Extensions must not facilitate sharing of inappropriate content
    - Should respect content ownership and copyright
    - Must not enable spam or harassment
 
 Implementation Compliance:
 */

class AppStoreComplianceManager {
    
    // Privacy compliance
    static func requestDataCollectionConsent() -> Bool {
        let consentKey = "DataCollectionConsent"
        
        if UserDefaults.standard.object(forKey: consentKey) == nil {
            // Show consent dialog
            showDataCollectionConsentDialog { granted in
                UserDefaults.standard.set(granted, forKey: consentKey)
            }
            return UserDefaults.standard.bool(forKey: consentKey)
        }
        
        return UserDefaults.standard.bool(forKey: consentKey)
    }
    
    // Content filtering
    static func isContentAppropriate(_ content: SharedContent) -> Bool {
        // Implement content filtering logic
        // Check for inappropriate URLs, text content, etc.
        
        if let url = content.url {
            let inappropriateDomains = ["example-spam.com", "inappropriate-site.com"]
            if inappropriateDomains.contains(where: { url.host?.contains($0) == true }) {
                return false
            }
        }
        
        if let text = content.text {
            let inappropriateWords = ["spam", "inappropriate"]  // In real implementation, use proper content filtering
            if inappropriateWords.contains(where: { text.lowercased().contains($0) }) {
                return false
            }
        }
        
        return true
    }
    
    // Performance monitoring
    static func trackPerformanceMetrics() {
        let startTime = CFAbsoluteTimeGetCurrent()
        
        // Track extension launch time
        DispatchQueue.main.async {
            let launchTime = CFAbsoluteTimeGetCurrent() - startTime
            
            // Log performance metrics (ensure this complies with privacy guidelines)
            if launchTime > 3.0 {  // Flag slow launches
                print("Warning: Extension launch took \(launchTime) seconds")
            }
        }
    }
}
```

## Integration Examples

### Complete iOS Share Extension Architecture

```mermaid
graph TD
    A[iOS Share Sheet] --> B[Action Extension]
    B --> C[Content Extraction]
    C --> D[Content Validation]
    D --> E[Processing Strategy Selection]
    
    subgraph "Processing Strategies"
        F[Background Upload]
        G[Main App Processing]
        H[Local Storage]
    end
    
    E --> F
    E --> G
    E --> H
    
    F --> I[[[FastAPI Async Architecture]]]
    G --> J[Main App Launch]
    H --> K[Shared App Group]
    
    subgraph "Shared Components"
        L[Network Manager]
        M[Data Manager]
        N[Error Handler]
    end
    
    F --> L
    G --> M
    H --> M
    
    subgraph "Main App Integration"
        O[Deep Link Handling]
        P[Pending Content Processing]
        Q[User Notifications]
    end
    
    J --> O
    K --> P
    P --> Q
```

### Integration with [[Digital Wall]] Components

- **[[PWA Share Target API]]**: iOS extension complements web-based sharing
- **[[React Native Cross-Platform]]**: Shared codebase for cross-platform mobile features
- **[[FastAPI Async Architecture]]**: Backend API endpoints for processing shared content
- **[[Content Processing Pipeline]]**: Server-side processing of content shared from iOS

## References & Further Reading

### Official Documentation
- [iOS App Extension Programming Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/)
- [Share Extension Documentation](https://developer.apple.com/documentation/social/slcomposeserviceviewcontroller)
- [App Groups Documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_application-groups)

### Best Practices
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [iOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

### Related [[Vault]] Concepts
- [[iOS Development]] - iOS app development fundamentals
- [[App Extensions]] - iOS extension architecture patterns
- [[Inter-App Communication]] - Communication between apps and extensions
- [[Mobile Share Integration]] - Cross-platform sharing strategies
- [[Native Mobile Development]] - Native app development best practices

#digital-wall #research #ios #share-extension #mobile-development #native-integration