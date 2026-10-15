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
- Local game saves and control settings, automatic suspension when the app enters the background, and a tap-to-resume screen.
- Fullscreen landscape play with overlay controls and an optional framed deck.
- Deferred, compressed WebGL texture uploads to reduce the game's GPU memory use on iOS.

## Requirements

- An iPhone or iPad running **iOS/iPadOS 16 or later**.
- A sideloading tool to sign and install the IPA, such as ESign, AltStore, SideStore, or Sideloadly.
- Enough free storage for the IPA and installed app. The game assets alone occupy roughly 750 MB.

## Installation

1. Download `SuperSmashFlash2-1.1.8-unsigned.ipa` from the [latest release](https://github.com/DevZer0D4Y/SSF2-iOS/releases/latest).
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
| **PAUSE** | **Space** | Game pause (match the game’s Pause binding) |
| **START / OK** | **Space** | Confirm where the game accepts it |
| **MENU** | — | Open the app control panel and suspend the game |

If you change the game's bindings in **Options → Controls**, change the matching keys in the port's **CONTROLS → KEYS** panel too. Keep **Tap Jump** enabled for the default Jump button, or assign a dedicated jump key in both places.

The former Escape button is now **MENU**, which opens a working app menu. To exit a match, use the game’s pause menu. Under **DISPLAY**, fullscreen is enabled by default in landscape; turn it off to restore the framed deck. Portrait keeps the game above the controls.

Under **TOUCH**, choose **EDIT TOUCH LAYOUT** to drag controls, resize the selected control, or hide it. **RESET** restores the layout. Portrait and landscape keep separate arrangements.

Under **CONTROLLER**, assign each supported physical button to a game action. Controller availability depends on the controller profile exposed by iOS.

## Version 1.1.8 changes

- Uses binary requests over the existing offline URL scheme for the sprite cache. The former JavaScript prompt bridge could interrupt Web Audio while thousands of sprites loaded; cache operations no longer invoke dialog handling or create base64/JSON copies of each sprite.
- Enables the game’s existing sequential resource loader, reducing overlapping asset decoding during startup and character/stage loading. The build derives the movie from the verified original by changing exactly one boolean instruction; the downloaded original remains intact.
- Native cache failures stop loading and show recovery instead of silently retaining the entire sprite cache in WebKit RAM.
- In a macOS WebKit comparison, the old build’s startup WebAssembly allocation reached about 784 MB; the sequential/binary build completed startup at about 624 MB. The title/menu remained responsive and a Ness/Mario battle loaded. These measurements cover WebAssembly allocation, not total process memory or physical-iPhone results.
- A UIKit Mac Catalyst test passed 1,000 byte-exact binary cache round trips, 500 transient lifecycle/audio notifications, background suspension and one-tap resume. Native cache, texture and loader-patch tests passed.

The repeated Resume fix remains in place. Startup reliability, headphone output and longer-session stability still need verification on affected iPhones. Memory use remains substantial, especially in matches.

## Version 1.1.7 changes

- Audio interruptions, headphone route changes and transient inactivity no longer show the game's Resume screen. On iOS, app backgrounding owns suspension; temporary WebKit visibility changes do not pause the runtime.
- Removed the audio activation feedback path. Playback policy is set before audio starts, and user input still unlocks suspended Web Audio contexts. Foreground entry activates the native audio session once, without repeatedly reacting to route notifications.
- Repeated suspension is harmless, and background events before the first start do not replace LET'S PLAY with Resume.
- New installations start with lower-memory rendering, including CSS-resolution output and low quality. The lower-memory sprite cache now targets 64 MB instead of 96 MB to reduce startup pressure.
- A UIKit Mac Catalyst check of the shipped native controller passed 1,000 trusted sprite-cache prompts and 500 transient lifecycle/audio notifications without pausing, followed by background suspension and one-tap resume. JavaScript checks cover visibility changes, pending audio resumes and the reduced cache budget. Startup termination on affected physical iPhones still needs verification; lower memory use does not guarantee every crash is resolved.

## Version 1.1.6 changes

- User taps and key presses explicitly resume Ruffle's Web Audio contexts. Starting the game loop alone does not unlock sound. The Ruffle unmute overlay is visible as a fallback.
- The native playback audio session is activated, and headphone route changes, app activation and audio interruptions are handled.
- The native Restart game button has a definite layout width and remains enabled while a replacement page loads. Rapid duplicate taps are ignored briefly rather than disabling the button.
- The shipped recovery-view component was tapped twice successfully in a UIKit Mac Catalyst test app. Audio unlock, interruption and retry logic passed automated tests; headphone output still needs checking on affected iPhones.

Restart recreates the Flash runtime and returns to the title screen. It cannot resume a match from a terminated WebKit process. Completed save data and control settings remain in the persistent store. These changes do not establish that the earlier memory-related crashes are eliminated.

## Version 1.1.5 changes

- A native **Restart game** screen handles WebKit termination, graphics-context loss and sprite-cache read failures, including failures while the app is in the background.
- Restart disposes the old WebView, stops its controller polling and creates a fresh game page. Temporary sprites are cleared; the persistent save-data store stays in use.
- Failed loads allow a retry; repeated failures require a deliberate restart rather than an automatic reload loop.

There is **no play-time limit**. Free storage and RAM/graphics memory are different resources. This release improves recovery from a blank screen; it does not prove that every underlying crash has been eliminated. A restarted match is lost.

## Version 1.1.4 changes

- Compressed sprites are paged to session-only native disk storage, reducing the JavaScript heap used during startup and character/stage loading.
- Static sprite textures use a GPU cache targeting 128 MB, 96 MB on low-memory startup, and 64 MB after a memory warning. Inactive textures reload through stable handles when used again.
- Render targets, mipmaps and partially modified textures remain outside eviction so cached originals cannot overwrite gameplay effects.

The scratch cache is discarded on app exit and reuses freed storage. Keep at least **1 GB of free device storage** for normal play; long sessions may need more. Since version 1.1.8, unavailable native scratch storage opens recovery instead of falling back to a large RAM cache. The cache limits static sprite residency, not all game memory. Ruffle still retains some movie resources, and this release needs testing on affected physical iPhones. A native macOS WebKit integration test reached a Ness battle, returned to character selection, switched to Link and another stage, and reached the next battle without a process termination or sprite-cache error.

## Version 1.1.3 changes

- Space is the default Pause key; existing Enter pause bindings migrate once.
- MENU replaces the Escape-based Back button and suspends the runtime while settings are open.
- D-pad editing captures the drag pointer, supports upward movement, and resets its transform correctly.
- Fullscreen landscape play is enabled by default.
- Deferred textures release their original pixel buffers, upload staging memory is reused, and recovery lowers rendering resolution.

## Status

| Component | Version |
|---|---|
| iOS app | **1.1.8**, build **11** |
| Portable game | **1.3.1.2** |
| Ruffle | **0.6.0** |

Known limitations:

- Performance and Flash compatibility depend on Ruffle and the device. Some game content can still hit iOS memory limits. Texture compression releases original bitmap buffers, and rendering resolution is capped to reduce effect-buffer memory. A memory warning or WebKit process termination enables persistent lower-memory rendering; repeated termination offers a retry. This mitigates memory pressure but does not guarantee every device or match will avoid a crash.
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

The build script writes `build/SuperSmashFlash2-unsigned.ipa`. Set `OUT` and `DERIVED` to choose different output and build directories. The downloader also derives `SSF2Portable-ios.swf` using the checked `scripts/patch-game.py` patch. The native shell loads that copy in both Xcode and IPA builds; the verified original remains intact. The script excludes the large Web folder from Xcode’s resource-copy phase and clones it directly into the package on APFS. Packaging strips debug symbols and embedded local build paths, removes source maps, Finder metadata, provisioning profiles, and signature files, and audits the final IPA.

For a signed build, restore the assets, open `SSF2-iOS.xcodeproj` in Xcode, choose your team in **Signing & Capabilities**, then build for your device.

### Tests

The JavaScript checks need Node.js and do not need the game assets:

```sh
node tests/touch-controls.cjs
node tests/touch-controls.cjs --native
node --expose-gc tests/gpu-memory.cjs
node tests/rendering.cjs
node tests/gpu-cache.cjs
node tests/gpu-cache.cjs --disk
node tests/gpu-cache.cjs --disk --low-memory
node tests/gpu-recovery.cjs
node tests/audio.cjs
python3 scripts/audit-source.py
```

After restoring the game assets, verify the one-instruction loader patch with `python3 tests/game-patch.py`.

The native cache can be checked on macOS with:

```sh
xcrun swiftc SSF2-iOS/TextureStore.swift tests/texture-store.swift -o /tmp/ssf2-texture-tests
/tmp/ssf2-texture-tests
```

## Source layout

| Path | Contents |
|---|---|
| [`SSF2-iOS/App.swift`](SSF2-iOS/App.swift) | iOS app lifecycle, audio, WebKit setup, suspension, and recovery |
| [`SSF2-iOS/RecoveryView.swift`](SSF2-iOS/RecoveryView.swift) | Native restart control |
| [`SSF2-iOS/TextureStore.swift`](SSF2-iOS/TextureStore.swift) | Session-only native sprite storage |
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
