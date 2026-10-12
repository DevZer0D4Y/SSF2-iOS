# Super Smash Flash 2 for iOS

An unofficial iPhone and iPad port of **Super Smash Flash 2 v1.3.1.2 (Portable)**, running its original Flash game through [Ruffle](https://ruffle.rs) inside a native iOS app. The game and runtime are bundled for offline play, with a matching touch control deck, controller support, and a customizable layout.

**[Download the latest IPA](https://github.com/DevZer0D4Y/SSF2-iOS/releases/latest)**

If you want to support me and remain up-to-date about this and other projects, you can in different ways:

Ko-Fi: https://ko-fi.com/dev_zer0

Discord: https://discord.gg/uFChheZEWX

YouTube: https://www.youtube.com/@develop_erZ

## Features

- The original portable game, graphics, and sound, using **Ruffle 0.6.0**. Nothing is downloaded while playing.
- A touch control deck styled around SSF2: an eight-direction D-pad, jump, attack, special, shield, grab, taunt, pause, and Start / OK.
- Simultaneous touch inputs, diagonal movement, touch feedback, and adjustable control size and opacity.
- **Customizable touch layouts**: move, resize, and hide controls, with separate layouts for portrait and landscape.
- Native controller support through Apple's GameController framework, including extended gamepads and supported micro gamepads. Remap buttons in **CONTROLS**, or hide the touch deck while a controller is connected.
- Customizable keyboard bindings that match the game's own Player 1 control settings.
- Local game saves and control settings, automatic suspension when the app loses focus, and a tap-to-resume screen.
- Deferred, compressed WebGL texture uploads to reduce the game's GPU memory use on iOS.

## Requirements

- An iPhone or iPad running **iOS/iPadOS 16 or later**.
- A sideloading tool to sign and install the IPA, such as ESign, AltStore, SideStore, or Sideloadly.
- Enough free storage for the IPA and installed app. The game assets alone occupy roughly 750 MB.

## Installation

1. Download `SuperSmashFlash2-1.1.2-unsigned.ipa` from the [latest release](https://github.com/DevZer0D4Y/SSF2-iOS/releases/latest).
2. Sign and install it with your sideloading tool. With ESign, import the IPA, then sign and install it inside ESign.
3. Open **Super Smash Flash 2** and tap **LET'S PLAY** to start the game and enable audio. Tap the game screen to navigate its menus.
4. Open **CONTROLS** to adjust the touch deck or controller mapping.

The app's bundle identifier is `com.devz.supersmashflash2`. To update an existing installation and keep its data, use the same signing identity and keep the bundle identifier unchanged.

## Playing and settings

The touch controls operate Player 1. The game's own menus can be tapped directly. The port's **CONTROLS** panel pauses the runtime while you adjust the deck.

| Touch control | Default game key | Action |
|---|---|---|
| D-pad | **W A S D** | Move; up jumps when Tap Jump is enabled |
| **JUMP** | **W** | Jump through the game's Tap Jump setting |
| **A / ATTACK** | **P** | Normal attack |
| **B / SPECIAL** | **O** | Special attack |
| **SHIELD** | **I** | Shield / dodge |
| **GRAB** | **U** | Grab |
| **TAUNT** | **1** | Taunt |
| **PAUSE** | **Enter** | Game pause (match the game’s Pause binding) |
| **START / OK** | **Space** | Confirm where the game accepts it |
| **BACK** | **Escape** | Back where the game accepts it |

If you change the game's bindings in **Options → Controls**, change the matching keys in the port's **CONTROLS → KEYS** panel too. Keep **Tap Jump** enabled for the default Jump button, or assign a dedicated jump key in both places.

Under **TOUCH**, choose **EDIT TOUCH LAYOUT** to drag controls, resize the selected control, or hide it. **RESET** restores the layout. Portrait and landscape keep separate arrangements.

Under **CONTROLLER**, assign each supported physical button to a game action. Controller availability depends on the controller profile exposed by iOS.

## Status

| Component | Version |
|---|---|
| iOS app | **1.1.2**, build **5** |
| Portable game | **1.3.1.2** |
| Ruffle | **0.6.0** |

Known limitations:

- Performance and Flash compatibility depend on Ruffle and the device. Some game content can still hit iOS memory limits. After repeated WebKit process termination, the app offers a retry instead of continuously reloading.
- The app blocks remote game requests for offline operation. Online multiplayer and other network-dependent game features are not supported.
- A downloaded IPA must be signed before installation. No signing certificate or provisioning profile is included.

## Building

Requires a Mac with **Xcode 16 or newer** and **Python 3.11 or newer**. The release build uses Xcode 27.0.

```sh
git clone https://github.com/DevZer0D4Y/SSF2-iOS.git
cd SSF2-iOS
python3 scripts/fetch-assets.py
bash scripts/make-ipa.sh
```

The downloader restores the original game and Ruffle into ignored folders and verifies every file against [`scripts/assets-manifest.json`](scripts/assets-manifest.json). The game is pinned to [`b3115cd`](https://github.com/VocalNutria9174/SSF2_Portable_Web/tree/b3115cd09c07fdce441d87e6d92e2f283f3432c4), and the runtime to [Ruffle 0.6.0](https://github.com/ruffle-rs/ruffle/releases/tag/v0.6.0).

The build script writes `build/SuperSmashFlash2-unsigned.ipa`. Set `OUT` and `DERIVED` to choose different output and build directories. Packaging removes source maps, Finder metadata, provisioning profiles, and signature files.

For a signed build, restore the assets, open `SSF2-iOS.xcodeproj` in Xcode, choose your team in **Signing & Capabilities**, then build for your device.

### Tests

The JavaScript checks need Node.js and do not need the game assets:

```sh
node tests/touch-controls.cjs
node tests/gpu-memory.cjs
python3 scripts/audit-source.py
```

## Source layout

| Path | Contents |
|---|---|
| [`SSF2-iOS/App.swift`](SSF2-iOS/App.swift) | iOS app lifecycle, audio, WebKit setup, suspension, and recovery |
| [`SSF2-iOS/GameSchemeHandler.swift`](SSF2-iOS/GameSchemeHandler.swift) | Offline bundled asset loader |
| [`SSF2-iOS/ControllerBridge.swift`](SSF2-iOS/ControllerBridge.swift) | Native gamepad input bridge |
| [`SSF2-iOS/Web/`](SSF2-iOS/Web/) | Game shell, touch controls, controller remapping, layout editor, and GPU memory handling |
| [`scripts/`](scripts/) | Pinned asset download, unsigned IPA packaging, and source audit |
| [`tests/`](tests/) | Touch, controller, layout, and texture memory tests |
| [`licenses/`](licenses/) | Ruffle's third-party licenses |

Game assets, the downloaded runtime, IPAs, build folders, device data, credentials, and local development files are excluded from the source repository. Release builds do not enable Web Inspector, write diagnostic files, or expose a device test command channel.

## Credits

- [McLeodGaming / Super Smash Flash](https://www.supersmashflash.com/), for the original game.
- [VocalNutria9174/SSF2_Portable_Web](https://github.com/VocalNutria9174/SSF2_Portable_Web), for the portable web distribution used by this port.
- [Ruffle](https://ruffle.rs) and its contributors, for the Flash runtime.

## License

The iOS wrapper, control deck, build scripts, and tests are licensed under the [MIT License](LICENSE). Ruffle keeps its [MIT](licenses/Ruffle-MIT.txt) and [Apache 2.0](licenses/Ruffle-Apache-2.0.txt) licenses. The game, characters, music, and other game assets remain the property of their respective owners; the wrapper's license does not apply to them.

This is an unofficial fan project, not affiliated with or endorsed by McLeodGaming or the owners of the characters represented in Super Smash Flash 2.

## Support and community

[Ko-Fi](https://ko-fi.com/dev_zer0) · [Discord](https://discord.gg/uFChheZEWX) · [YouTube](https://www.youtube.com/@develop_erZ)
