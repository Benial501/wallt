// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WalltNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "WalltNative", targets: ["WalltNativePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", exact: "9.2.0")
    ],
    targets: [
        .target(
            name: "WalltNativePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")
            ],
            path: "ios/Sources/WalltNativePlugin")
    ]
)
