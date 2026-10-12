import GameController
import UIKit
import WebKit

/// Reports every controller the GameController framework supports (Xbox, PlayStation, Switch Pro and
/// Joy-Con, MFi and clip-on controllers, Siri Remote) to the page as position-named inputs.
/// The page maps those inputs to game actions (see SSF2Pads in controls.js).
final class ControllerBridge {
    private weak var webView: WKWebView?
    private var link: CADisplayLink?
    private var lastState = ""

    init(webView: WKWebView) {
        self.webView = webView
        GCController.shouldMonitorBackgroundEvents = false
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(controllersChanged), name: .GCControllerDidConnect, object: nil)
        center.addObserver(self, selector: #selector(controllersChanged), name: .GCControllerDidDisconnect, object: nil)
        GCController.startWirelessControllerDiscovery(completionHandler: nil)
        controllersChanged()
    }

    @objc private func controllersChanged() {
        let names = GCController.controllers().map { $0.vendorName ?? "Controller" }
        Log.write("controllers: \(names.isEmpty ? "none" : names.joined(separator: ", "))")
        if GCController.controllers().isEmpty {
            link?.invalidate(); link = nil
        } else if link == nil {
            link = CADisplayLink(target: self, selector: #selector(poll))
            link?.add(to: .main, forMode: .common)
        }
        poll()
    }

    /// The page reloads (for example after iOS ends its process), so the next poll resends the state.
    func pageReloaded() { lastState = "" }

    @objc private func poll() {
        let pads: [[String: Any]] = GCController.controllers().enumerated().map { index, controller in
            var buttons: [String] = []
            var axes: [Float] = [0, 0, 0, 0]
            func add(_ name: String, _ button: GCControllerButtonInput?) { if button?.isPressed == true { buttons.append(name) } }
            if let pad = controller.extendedGamepad {
                add("south", pad.buttonA); add("east", pad.buttonB); add("west", pad.buttonX); add("north", pad.buttonY)
                add("l1", pad.leftShoulder); add("r1", pad.rightShoulder); add("l2", pad.leftTrigger); add("r2", pad.rightTrigger)
                add("select", pad.buttonOptions); add("start", pad.buttonMenu)
                add("l3", pad.leftThumbstickButton); add("r3", pad.rightThumbstickButton)
                add("dup", pad.dpad.up); add("ddown", pad.dpad.down); add("dleft", pad.dpad.left); add("dright", pad.dpad.right)
                // GameController reports up as positive y; the page expects screen direction (down positive).
                axes = [pad.leftThumbstick.xAxis.value, -pad.leftThumbstick.yAxis.value, pad.rightThumbstick.xAxis.value, -pad.rightThumbstick.yAxis.value]
            } else if let pad = controller.microGamepad {
                // Siri Remote and single Joy-Con style controllers: D-pad plus two face buttons and Menu.
                pad.allowsRotation = true
                add("south", pad.buttonA); add("west", pad.buttonX); add("start", pad.buttonMenu)
                add("dup", pad.dpad.up); add("ddown", pad.dpad.down); add("dleft", pad.dpad.left); add("dright", pad.dpad.right)
            }
            return ["id": index, "name": controller.vendorName ?? "Controller", "buttons": buttons, "axes": axes.map { ($0 * 100).rounded() / 100 }]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: pads), let json = String(data: data, encoding: .utf8), json != lastState else { return }
        lastState = json
        webView?.evaluateJavaScript("window.SSF2Pads&&SSF2Pads.update(\(json))", completionHandler: nil)
    }
}
