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
    private var webView: WKWebView?
    private var controllers: ControllerBridge?
    private let textures = TextureStore()
    private var lowMemory = UserDefaults.standard.bool(forKey: "SSF2LowMemoryMode")
    private let feedback = UIImpactFeedbackGenerator(style: .light)
    private let recovery = UIView()
    private let recoveryText = UILabel()
    private let restart = UIButton(type: .system)
    private static let offlineRules = #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}},{"trigger":{"url-filter":"^wss?://"},"action":{"type":"block"}}]"#
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.09, green: 0.10, blue: 0.11, alpha: 1)
        configureRecovery()
        UIApplication.shared.isIdleTimerDisabled = true
        feedback.prepare()
        NotificationCenter.default.addObserver(self, selector: #selector(suspendGame), name: UIApplication.willResignActiveNotification, object: nil)
        createGameView()
    }

    private func configureRecovery() {
        recovery.translatesAutoresizingMaskIntoConstraints = false
        recovery.backgroundColor = view.backgroundColor
        recovery.isHidden = true
        recoveryText.font = .preferredFont(forTextStyle: .body)
        recoveryText.textColor = .white
        recoveryText.numberOfLines = 0
        recoveryText.textAlignment = .center
        recoveryText.adjustsFontForContentSizeCategory = true
        var style = UIButton.Configuration.filled()
        style.title = "Restart game"
        style.baseBackgroundColor = UIColor(red: 0.97, green: 0.86, blue: 0.35, alpha: 1)
        style.baseForegroundColor = .black
        style.cornerStyle = .capsule
        restart.configuration = style
        restart.addTarget(self, action: #selector(restartGame), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [recoveryText, restart])
        stack.axis = .vertical; stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        recovery.addSubview(stack); view.addSubview(recovery)
        NSLayoutConstraint.activate([
            recovery.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            recovery.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            recovery.topAnchor.constraint(equalTo: view.topAnchor),
            recovery.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: recovery.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: recovery.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            restart.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
    }

    private func discardGameView() {
        controllers?.stop(); controllers = nil
        if let page = webView {
            page.navigationDelegate = nil; page.uiDelegate = nil
            page.configuration.userContentController.removeScriptMessageHandler(forName: "haptic")
            page.configuration.userContentController.removeScriptMessageHandler(forName: "gameFailure")
            page.configuration.userContentController.removeAllUserScripts()
            page.stopLoading(); page.removeFromSuperview()
        }
        webView = nil
        _ = textures.respond(#"{"op":"reset"}"#)
    }

    private func createGameView() {
        discardGameView()
        guard let root = Bundle.main.url(forResource: "Web", withExtension: nil) else {
            showRecovery("The bundled game folder is missing."); return
        }
        let assets = GameSchemeHandler(root: root)
        assets.onResponse = { path, status, _ in if status != 200 { Log.write("asset \(status) \(path)") } }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.setURLSchemeHandler(assets, forURLScheme: GameSchemeHandler.scheme)
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let content = configuration.userContentController
        content.add(self, name: "haptic"); content.add(self, name: "gameFailure")
        content.addUserScript(WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let page = WKWebView(frame: view.bounds, configuration: configuration)
        webView = page
        page.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        page.isOpaque = false; page.backgroundColor = view.backgroundColor
        page.scrollView.isScrollEnabled = false
        page.scrollView.contentInsetAdjustmentBehavior = .never
        page.navigationDelegate = self; page.uiDelegate = self
        page.allowsBackForwardNavigationGestures = false
        #if DEBUG
        if #available(iOS 16.4, *) { page.isInspectable = true }
        #endif
        view.insertSubview(page, belowSubview: recovery)
        controllers = ControllerBridge(webView: page)
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "ssf2-offline", encodedContentRuleList: Self.offlineRules) { [weak self, weak page] rules, error in
            DispatchQueue.main.async {
                guard let self, let page, self.webView === page else { return }
                if let rules { content.add(rules) } else { Log.write("content rules: \(error?.localizedDescription ?? "unavailable")") }
                page.load(URLRequest(url: GameSchemeHandler.startURL))
                DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self, weak page] in
                    guard let self, let page, self.webView === page, !self.recovery.isHidden else { return }
                    self.restart.isEnabled = true
                    self.recoveryText.text = "Loading is taking longer than expected. Tap Restart game to retry."
                }
            }
        }
    }

    private func bridgeScript() -> String {
        "window.SSF2Native = {lowMemory: \(lowMemory), textureCache:true};"
    }
    @objc private func suspendGame() {
        webView?.evaluateJavaScript("window.SSF2Controls?.suspend()", completionHandler: nil)
    }
    private func trusted(_ frame: WKFrameInfo) -> Bool {
        frame.isMainFrame && frame.securityOrigin.protocol == GameSchemeHandler.scheme && frame.securityOrigin.host == GameSchemeHandler.host
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let page = webView, controller === page.configuration.userContentController, trusted(message.frameInfo) else { return }
        switch message.name {
        case "haptic": feedback.impactOccurred(intensity: 0.65); feedback.prepare()
        case "gameFailure":
            guard let reason = message.body as? String, ["graphics-lost", "sprite-cache-read"].contains(reason) else { return }
            enableLowMemoryMode()
            showRecovery("The game was interrupted. Restart to return to the main menu. The current match cannot be recovered.")
        default: break
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard webView === self.webView, let url = action.request.url else { decisionHandler(.cancel); return }
        if [GameSchemeHandler.scheme, "about", "blob", "data"].contains(url.scheme) { decisionHandler(.allow); return }
        decisionHandler(.cancel); openExternally(url)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if webView === self.webView, let url = action.request.url { openExternally(url) }
        return nil
    }
    private func openExternally(_ url: URL) {
        guard ["http", "https", "mailto"].contains(url.scheme?.lowercased()) else { return }
        UIApplication.shared.open(url)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard webView === self.webView, prompt == "SSF2TextureCache", trusted(frame), let message = defaultText else {
            completionHandler(nil); return
        }
        completionHandler(autoreleasepool { textures.respond(message) })
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        controllers?.pageReloaded()
        recovery.isHidden = true; restart.isEnabled = true
    }
    private func navigationFailed(_ page: WKWebView, error: Error) {
        guard page === webView, (error as NSError).code != NSURLErrorCancelled else { return }
        showRecovery("The game could not load. Tap Restart game to try again.")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigationFailed(webView, error: error)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        navigationFailed(webView, error: error)
    }
    private func enableLowMemoryMode() {
        lowMemory = true; UserDefaults.standard.set(true, forKey: "SSF2LowMemoryMode")
        guard let page = webView else { return }
        let content = page.configuration.userContentController
        content.removeAllUserScripts()
        content.addUserScript(WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        page.evaluateJavaScript("window.SSF2Rendering?.lowerMemory()", completionHandler: nil)
    }
    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning(); enableLowMemoryMode()
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        enableLowMemoryMode()
        showRecovery("The game stopped. Restart to return to the main menu. The current match cannot be recovered.")
    }
    private func showRecovery(_ message: String) {
        recoveryText.text = message; restart.isEnabled = true
        recovery.isHidden = false; view.bringSubviewToFront(recovery)
        discardGameView()
    }
    @objc private func restartGame() {
        restart.isEnabled = false
        recoveryText.text = "Restarting game…"
        createGameView()
    }
}
