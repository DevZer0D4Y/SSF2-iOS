import UIKit

/// A native recovery control with a definite width and an always-enabled button.
/// It does not depend on JavaScript, WebKit or an in-flight page load.
final class RecoveryView: UIView {
    var onRestart: (() -> Void)?
    private let label = UILabel()
    private let button = UIButton(type: .system)
    private var lastPress = Date.distantPast
    var message: String {
        get { label.text ?? "" }
        set { label.text = newValue }
    }
    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        label.font = .preferredFont(forTextStyle: .body)
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.adjustsFontForContentSizeCategory = true
        var style = UIButton.Configuration.filled()
        style.title = "Restart game"
        style.baseBackgroundColor = UIColor(red: 0.97, green: 0.86, blue: 0.35, alpha: 1)
        style.baseForegroundColor = .black
        style.cornerStyle = .capsule
        button.configuration = style
        button.accessibilityIdentifier = "restart-game"
        button.addTarget(self, action: #selector(pressed), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [label, button])
        stack.axis = .vertical; stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        let preferredWidth = stack.widthAnchor.constraint(equalTo: safeAreaLayoutGuide.widthAnchor, constant: -48)
        preferredWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: safeAreaLayoutGuide.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor),
            preferredWidth,
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
            stack.widthAnchor.constraint(greaterThanOrEqualToConstant: 200),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
    }
    required init?(coder: NSCoder) { fatalError("Use init(frame:)") }
    @objc private func pressed() {
        guard Date().timeIntervalSince(lastPress) > 0.4 else { return }
        lastPress = Date()
        onRestart?()
    }
}
