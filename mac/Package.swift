// swift-tools-version:5.9
// The Mac side of PEA: the local gateway in Swift, with no third-party dependencies.
import PackageDescription

let package = Package(
    name: "PEAMac",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "PEAGatewayCore", targets: ["PEAGatewayCore"]),
        .executable(name: "pea-gateway", targets: ["pea-gateway"]),
    ],
    targets: [
        .target(name: "PEAGatewayCore"),
        .executableTarget(name: "pea-gateway", dependencies: ["PEAGatewayCore"]),
        .testTarget(name: "PEAGatewayCoreTests", dependencies: ["PEAGatewayCore"]),
    ]
)
