import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    var window: UIWindow?
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        window = UIWindow(frame: UIScreen.main.bounds)
        
        // Create a simple main view controller that will show wall content
        let mainViewController = WallViewController()
        let navigationController = UINavigationController(rootViewController: mainViewController)
        
        // Set up navigation appearance
        navigationController.navigationBar.prefersLargeTitles = true
        navigationController.navigationBar.backgroundColor = UIColor.systemBackground
        
        window?.rootViewController = navigationController
        window?.makeKeyAndVisible()
        
        return true
    }
}

// Simple Wall View Controller
class WallViewController: UIViewController {
    
    private let API_BASE_URL = "https://57891c1e054a.ngrok-free.app"
    private var wallItems: [WallItem] = []
    private var tableView: UITableView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        title = "Digital Wall"
        view.backgroundColor = UIColor.systemBackground
        
        setupTableView()
        setupNavigationBar()
        loadWallData()
    }
    
    private func setupTableView() {
        tableView = UITableView(frame: view.bounds, style: .plain)
        tableView.delegate = self
        tableView.dataSource = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "WallItemCell")
        
        view.addSubview(tableView)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }
    
    private func setupNavigationBar() {
        let addButton = UIBarButtonItem(barButtonSystemItem: .add, target: self, action: #selector(addItemTapped))
        navigationItem.rightBarButtonItem = addButton
    }
    
    @objc private func addItemTapped() {
        let alert = UIAlertController(title: "Add URL", message: "Enter a URL to add to your wall", preferredStyle: .alert)
        
        alert.addTextField { textField in
            textField.placeholder = "https://example.com"
            textField.keyboardType = .URL
        }
        
        let addAction = UIAlertAction(title: "Add", style: .default) { _ in
            if let url = alert.textFields?.first?.text, !url.isEmpty {
                self.addURL(url)
            }
        }
        
        let cancelAction = UIAlertAction(title: "Cancel", style: .cancel)
        
        alert.addAction(addAction)
        alert.addAction(cancelAction)
        
        present(alert, animated: true)
    }
    
    private func addURL(_ url: String) {
        // Add URL to backend via API call
        print("Adding URL: \(url)")
        // TODO: Implement API call to add URL
    }
    
    private func loadWallData() {
        // Load wall data from API
        guard let url = URL(string: "\(API_BASE_URL)/api/walls") else { return }
        
        var request = URLRequest(url: url)
        request.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")
        
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("Error loading walls: \(error)")
                    return
                }
                
                // TODO: Parse response and update UI
                print("Wall data loaded successfully")
            }
        }.resume()
    }
}

// Wall item model
struct WallItem {
    let id: Int
    let title: String?
    let url: String?
    let contentType: String
    let createdAt: String
}

// Table view data source and delegate
extension WallViewController: UITableViewDataSource, UITableViewDelegate {
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return wallItems.isEmpty ? 1 : wallItems.count
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "WallItemCell", for: indexPath)
        
        if wallItems.isEmpty {
            cell.textLabel?.text = "No items yet. Tap + to add content!"
            cell.textLabel?.textColor = UIColor.systemGray
            cell.selectionStyle = .none
        } else {
            let item = wallItems[indexPath.row]
            cell.textLabel?.text = item.title ?? item.url ?? "Untitled"
            cell.detailTextLabel?.text = item.contentType
        }
        
        return cell
    }
    
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        
        guard !wallItems.isEmpty else { return }
        
        let item = wallItems[indexPath.row]
        if let urlString = item.url, let url = URL(string: urlString) {
            UIApplication.shared.open(url)
        }
    }
}