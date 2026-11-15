// swift-tools-version:5.9
// The Mac side of PEA: the local gateway and its menu-bar launcher, with no third-party dependencies.
import PackageDescription

let package = Package(
    name: "PEAMac",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "PEAGatewayCore", targets: ["PEAGatewayCore"]),
        .executable(name: "pea-gateway", targets: ["pea-gateway"]),
        .executable(name: "PEAMac", targets: ["PEAMac"]),
    ],
    targets: [
        .target(name: "PEAGatewayCore"),
        .executableTarget(name: "pea-gateway", dependencies: ["PEAGatewayCore"]),
        .target(name: "PEALauncherCore", dependencies: ["PEAGatewayCore"]),
        .executableTarget(name: "PEAMac", dependencies: ["PEAGatewayCore", "PEALauncherCore"]),
        .testTarget(name: "PEAGatewayCoreTests", dependencies: ["PEAGatewayCore"]),
        .testTarget(name: "PEALauncherCoreTests", dependencies: ["PEALauncherCore"]),
    ]
)
