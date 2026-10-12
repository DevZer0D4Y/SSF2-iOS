import AVFoundation
import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Game audio should play even when the ring/silent switch is on.
        do { try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default) } catch { Log.write("audio session: \(error.localizedDescription)") }
        return true
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

/// Diagnostics are available in Debug builds only; releases do not create log files.
enum Log {
    static func write(_ line: String) {
        #if DEBUG
        print(line)
        #endif
    }
}

final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private var controllers: ControllerBridge?
    private let feedback = UIImpactFeedbackGenerator(style: .light)
    // Remote loads are refused so the game behaves the same with or without a connection.
    private static let offlineRules = #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}},{"trigger":{"url-filter":"^wss?://"},"action":{"type":"block"}}]"#
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.09, green: 0.10, blue: 0.11, alpha: 1)
        guard let root = Bundle.main.url(forResource: "Web", withExtension: nil) else { showError("The bundled game folder is missing."); return }
        let assets = GameSchemeHandler(root: root)
        assets.onResponse = { path, status, size in
            if status != 200 { Log.write("asset \(status) \(path)") }
        }
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(assets, forURLScheme: GameSchemeHandler.scheme)
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let content = configuration.userContentController
        content.add(self, name: "haptic")
        content.addUserScript(WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        view.addSubview(webView)
        UIApplication.shared.isIdleTimerDisabled = true
        feedback.prepare()
        NotificationCenter.default.addObserver(self, selector: #selector(suspendGame), name: UIApplication.willResignActiveNotification, object: nil)
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "ssf2-offline", encodedContentRuleList: Self.offlineRules) { [weak self] rules, error in
            DispatchQueue.main.async {
                if let rules { content.add(rules) } else { Log.write("content rules: \(error?.localizedDescription ?? "unavailable")") }
                self?.webView.load(URLRequest(url: GameSchemeHandler.startURL))
            }
        }
        controllers = ControllerBridge(webView: webView)
    }

    private func bridgeScript() -> String {
        "window.SSF2Native = {};"
    }

    @objc private func suspendGame() {
        webView.evaluateJavaScript("window.SSF2Controls?.suspend()", completionHandler: nil)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "haptic": feedback.impactOccurred(intensity: 0.65); feedback.prepare()
        default: break
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if [GameSchemeHandler.scheme, "about", "blob", "data"].contains(url.scheme) { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        openExternally(url)
    }

    // Flash links (navigateToURL / window.open) leave the game and open in Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { openExternally(url) }
        return nil
    }

    private func openExternally(_ url: URL) {
        Log.write("external link \(url.absoluteString)")
        guard ["http", "https", "mailto"].contains(url.scheme?.lowercased()) else { return }
        UIApplication.shared.open(url)
    }

    // A fresh page has no controller state yet.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { controllers?.pageReloaded() }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Log.write("navigation failed: \(error.localizedDescription)")
        if (error as NSError).code != NSURLErrorCancelled { showError(error.localizedDescription) }
    }

    private var lastTermination: Date?

    // iOS ends the page's process when it runs out of memory. Reload once; if it keeps happening, stop instead of looping.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let repeated = lastTermination.map { Date().timeIntervalSince($0) < 60 } ?? false
        lastTermination = Date()
        controllers?.pageReloaded()
        Log.write("web content process terminated\(repeated ? " again; not reloading" : "; reloading")")
        if repeated {
            showError("The game ran out of memory and was closed by iOS. Close other apps and try again.")
        } else {
            webView.reload()
        }
    }

    private func showError(_ message: String) {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Unable to start SSF2", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in self?.webView?.load(URLRequest(url: GameSchemeHandler.startURL)) })
        present(alert, animated: true)
    }

}
