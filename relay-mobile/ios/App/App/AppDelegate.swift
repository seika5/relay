import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // For .bin identity files (AirDrop / Files "Open with Relay"):
        // Write the file directly to Documents/identity.bin using native FileManager.
        // Capacitor's Filesystem plugin cannot handle security-scoped resource URLs from the
        // Documents/Inbox, so we do the I/O here entirely in Swift.
        if url.isFileURL && url.pathExtension == "bin" {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }

            if let data = try? Data(contentsOf: url) {
                writeIdentityAndReload(data: data)
            }
        }
        // Still pass to Capacitor so other URL-scheme plugins work.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Identity file handling

    /// Guard flag so reloadWebView retries cannot fire more than once.
    private var identityReloadDone = false

    /// Writes raw identity bytes to Documents/identity.bin (replacing any existing file),
    /// then reloads the WKWebView exactly once so React picks it up via loadNativeIdentity.
    private func writeIdentityAndReload(data: Data) {
        identityReloadDone = false

        // 1. Write to app Documents using FileManager (no Capacitor, no URL schemes).
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dest = docs.appendingPathComponent("identity.bin")
        do {
            try data.write(to: dest, options: .atomic)
        } catch {
            // Could not write — nothing more we can do from native.
            return
        }

        // 2. Reload the WebView so the React app re-runs loadNativeIdentity and finds the file.
        //    Retry briefly to handle cold-start timing (WebView may still be initialising).
        scheduleReload(attempt: 0)
    }

    private func scheduleReload(attempt: Int) {
        // Bail out if we already fired a reload (prevents duplicate retries from all hitting).
        guard !identityReloadDone else { return }

        guard let webView = (window?.rootViewController as? CAPBridgeViewController)?.bridge?.webView else {
            if attempt < 20 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    self.scheduleReload(attempt: attempt + 1)
                }
            }
            return
        }

        // Mark done before calling reload so any already-queued retries exit immediately.
        identityReloadDone = true
        webView.reload()
    }
}
