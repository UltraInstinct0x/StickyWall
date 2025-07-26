import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    
    private let API_BASE_URL = "https://31174a748985.ngrok-free.app" // Digital Wall backend via ngrok
    private let containerView = UIView()
    private let titleLabel = UILabel()
    private let statusLabel = UILabel()
    private let progressView = UIProgressView()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        processSharedContent()
    }
    
    private func setupUI() {
        view.backgroundColor = UIColor.systemBackground
        
        // Setup container
        containerView.translatesAutoresizingMaskIntoConstraints = false
        containerView.backgroundColor = UIColor.secondarySystemBackground
        containerView.layer.cornerRadius = 12
        view.addSubview(containerView)
        
        // Setup title
        titleLabel.text = "Adding to Digital Wall..."
        titleLabel.font = UIFont.systemFont(ofSize: 18, weight: .medium)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(titleLabel)
        
        // Setup status
        statusLabel.text = "Processing your content..."
        statusLabel.font = UIFont.systemFont(ofSize: 14)
        statusLabel.textAlignment = .center
        statusLabel.textColor = UIColor.secondaryLabel
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(statusLabel)
        
        // Setup progress
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor.systemBlue
        containerView.addSubview(progressView)
        
        // Layout constraints
        NSLayoutConstraint.activate([
            containerView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            containerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            containerView.widthAnchor.constraint(equalToConstant: 280),
            containerView.heightAnchor.constraint(equalToConstant: 120),
            
            titleLabel.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            
            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            
            progressView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16),
            progressView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            progressView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            progressView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -20)
        ])
    }
    
    private func processSharedContent() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            showError("No content to share")
            return
        }
        
        var sharedData: [String: Any] = [:]
        var filesToUpload: [(Data, String, String)] = [] // (data, filename, mimeType)
        
        let dispatchGroup = DispatchGroup()
        
        // Process each attachment
        for attachment in attachments {
            if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                dispatchGroup.enter()
                attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { (item, error) in
                    if let url = item as? URL {
                        sharedData["url"] = url.absoluteString
                    }
                    dispatchGroup.leave()
                }
            }
            
            if attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                dispatchGroup.enter()
                attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { (item, error) in
                    if let text = item as? String {
                        sharedData["text"] = text
                    }
                    dispatchGroup.leave()
                }
            }
            
            if attachment.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                dispatchGroup.enter()
                attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { (item, error) in
                    defer { dispatchGroup.leave() }
                    
                    if let image = item as? UIImage,
                       let imageData = image.jpegData(compressionQuality: 0.8) {
                        let filename = "image_\(Date().timeIntervalSince1970).jpg"
                        filesToUpload.append((imageData, filename, "image/jpeg"))
                    }
                }
            }
            
            if attachment.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                dispatchGroup.enter()
                attachment.loadItem(forTypeIdentifier: UTType.movie.identifier, options: nil) { (item, error) in
                    defer { dispatchGroup.leave() }
                    
                    if let videoURL = item as? URL,
                       let videoData = try? Data(contentsOf: videoURL) {
                        let filename = "video_\(Date().timeIntervalSince1970).mp4"
                        filesToUpload.append((videoData, filename, "video/mp4"))
                    }
                }
            }
        }
        
        // Wait for all attachments to be processed
        dispatchGroup.notify(queue: .main) {
            self.uploadToBackend(sharedData: sharedData, files: filesToUpload)
        }
    }
    
    private func uploadToBackend(sharedData: [String: Any], files: [(Data, String, String)]) {
        statusLabel.text = "Uploading to your wall..."
        progressView.setProgress(0.3, animated: true)
        
        // Get or create user session
        let userSession = getUserSession()
        
        guard let url = URL(string: "\(API_BASE_URL)/api/share") else {
            showError("Invalid server URL")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30.0
        
        // Add ngrok headers to bypass warnings
        request.setValue("https://31174a748985.ngrok-free.app", forHTTPHeaderField: "ngrok-skip-browser-warning")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add text fields
        if let title = sharedData["title"] as? String {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"title\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(title)\r\n".data(using: .utf8)!)
        }
        
        if let text = sharedData["text"] as? String {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"text\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(text)\r\n".data(using: .utf8)!)
        }
        
        if let urlString = sharedData["url"] as? String {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"url\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(urlString)\r\n".data(using: .utf8)!)
        }
        
        // Add session ID
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"session_id\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(userSession)\r\n".data(using: .utf8)!)
        
        // Add source identifier
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"source\"\r\n\r\n".data(using: .utf8)!)
        body.append("ios_share_extension\r\n".data(using: .utf8)!)
        
        // Add files
        for (fileData, filename, mimeType) in files {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        progressView.setProgress(0.6, animated: true)
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    let nsError = error as NSError
                    if nsError.code == NSURLErrorTimedOut {
                        self?.showError("Upload timed out. Please try again.")
                    } else if nsError.code == NSURLErrorNotConnectedToInternet {
                        self?.showError("No internet connection.")
                    } else {
                        self?.showError("Upload failed: \(error.localizedDescription)")
                    }
                    return
                }
                
                if let httpResponse = response as? HTTPURLResponse {
                    if httpResponse.statusCode == 200 || httpResponse.statusCode == 303 {
                        // Try to parse JSON response for success confirmation
                        if let data = data,
                           let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                           let success = json["success"] as? Bool {
                            if success {
                                self?.showSuccess()
                            } else {
                                let errorMessage = json["error"] as? String ?? "Unknown server error"
                                self?.showError("Server error: \(errorMessage)")
                            }
                        } else {
                            // Fallback for non-JSON responses (redirects)
                            self?.showSuccess()
                        }
                    } else {
                        // Try to get error message from response body
                        var errorMessage = "Server error (\(httpResponse.statusCode))"
                        if let data = data,
                           let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                           let serverError = json["error"] as? String {
                            errorMessage = serverError
                        }
                        self?.showError(errorMessage)
                    }
                } else {
                    self?.showError("Invalid server response")
                }
            }
        }
        
        task.resume()
    }
    
    private func getUserSession() -> String {
        let userDefaults = UserDefaults(suiteName: "group.com.digitalwall.shared")
        if let existingSession = userDefaults?.string(forKey: "userSession") {
            return existingSession
        }
        
        // Create consistent session ID format matching the backend expectations
        let timestamp = Int(Date().timeIntervalSince1970)
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        let newSession = "ios_\(timestamp)_\(deviceId.prefix(8))"
        userDefaults?.set(newSession, forKey: "userSession")
        return newSession
    }
    
    private func showSuccess() {
        progressView.setProgress(1.0, animated: true)
        titleLabel.text = "Added to Digital Wall!"
        statusLabel.text = "Your content has been saved successfully"
        statusLabel.textColor = UIColor.systemGreen
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }
    
    private func showError(_ message: String) {
        titleLabel.text = "Upload Failed"
        statusLabel.text = message
        statusLabel.textColor = UIColor.systemRed
        progressView.isHidden = true
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            self.extensionContext?.cancelRequest(withError: NSError(domain: "ShareExtension", code: 1, userInfo: [NSLocalizedDescriptionKey: message]))
        }
    }
}