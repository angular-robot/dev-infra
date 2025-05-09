workspace(
    name = "devinfra",
)

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

NODE_VERSION = "20.11.1"

# The PKG rules are needed to build tar packages for integration tests. The builtin
# rule in `@bazel_tools` is not Windows compatible and outdated.
http_archive(
    name = "rules_pkg",
    sha256 = "8c20f74bca25d2d442b327ae26768c02cf3c99e93fad0381f32be9aab1967675",
    urls = [
        "https://mirror.bazel.build/github.com/bazelbuild/rules_pkg/releases/download/0.8.1/rules_pkg-0.8.1.tar.gz",
        "https://github.com/bazelbuild/rules_pkg/releases/download/0.8.1/rules_pkg-0.8.1.tar.gz",
    ],
)

http_archive(
    name = "io_bazel_rules_sass",
    sha256 = "bff856619317a388292970a7d4bfea8c9e627a1886fe7132075d378d4067c09e",
    strip_prefix = "rules_sass-cbe5261f925751a465a1a54bf2147e5f696ec567",
    urls = [
        "https://github.com/bazelbuild/rules_sass/archive/cbe5261f925751a465a1a54bf2147e5f696ec567.zip",
    ],
)

# Fetch rules_nodejs and install its dependencies so we can install our npm dependencies.
http_archive(
    name = "build_bazel_rules_nodejs",
    sha256 = "709cc0dcb51cf9028dd57c268066e5bc8f03a119ded410a13b5c3925d6e43c48",
    urls = ["https://github.com/bazelbuild/rules_nodejs/releases/download/5.8.4/rules_nodejs-5.8.4.tar.gz"],
)

load("@build_bazel_rules_nodejs//:repositories.bzl", "build_bazel_rules_nodejs_dependencies")

build_bazel_rules_nodejs_dependencies()

load("@rules_nodejs//nodejs:repositories.bzl", "nodejs_register_toolchains")

nodejs_register_toolchains(
    name = "nodejs",
    node_repositories = {
        "20.11.1-darwin_arm64": ("node-v20.11.1-darwin-arm64.tar.gz", "node-v20.11.1-darwin-arm64", "e0065c61f340e85106a99c4b54746c5cee09d59b08c5712f67f99e92aa44995d"),
        "20.11.1-darwin_amd64": ("node-v20.11.1-darwin-x64.tar.gz", "node-v20.11.1-darwin-x64", "c52e7fb0709dbe63a4cbe08ac8af3479188692937a7bd8e776e0eedfa33bb848"),
        "20.11.1-linux_arm64": ("node-v20.11.1-linux-arm64.tar.xz", "node-v20.11.1-linux-arm64", "c957f29eb4e341903520caf362534f0acd1db7be79c502ae8e283994eed07fe1"),
        "20.11.1-linux_ppc64le": ("node-v20.11.1-linux-ppc64le.tar.xz", "node-v20.11.1-linux-ppc64le", "51343cacf5cdf5c4b5e93e919d19dd373d6ef43d5f2c666eae299f26e31d08b5"),
        "20.11.1-linux_s390x": ("node-v20.11.1-linux-s390x.tar.xz", "node-v20.11.1-linux-s390x", "b32616b705cd0ddbb230b95c693e3d7a37becc2ced9bcadea8dc824cceed6be0"),
        "20.11.1-linux_amd64": ("node-v20.11.1-linux-x64.tar.xz", "node-v20.11.1-linux-x64", "d8dab549b09672b03356aa2257699f3de3b58c96e74eb26a8b495fbdc9cf6fbe"),
        "20.11.1-windows_amd64": ("node-v20.11.1-win-x64.zip", "node-v20.11.1-win-x64", "bc032628d77d206ffa7f133518a6225a9c5d6d9210ead30d67e294ff37044bda"),
    },
    node_version = NODE_VERSION,
)

http_archive(
    name = "aspect_rules_js",
    sha256 = "83e5af4d17385d1c3268c31ae217dbfc8525aa7bcf52508dc6864baffc8b9501",
    strip_prefix = "rules_js-2.3.7",
    url = "https://github.com/aspect-build/rules_js/releases/download/v2.3.7/rules_js-v2.3.7.tar.gz",
)

load("@aspect_rules_js//js:repositories.bzl", "rules_js_dependencies")

rules_js_dependencies()

load("@aspect_rules_js//js:toolchains.bzl", "rules_js_register_toolchains")

rules_js_register_toolchains()

load("@build_bazel_rules_nodejs//:index.bzl", "yarn_install")

yarn_install(
    name = "npm",
    # Yarn Berry/v2+ expects `--immutable` instead of `--frozen-lockfile`.
    args = ["--immutable"],
    data = [
        "//:.yarn/patches/@angular-bazel-npm.patch",
        "//:.yarn/patches/@bazel-jasmine-npm.patch",
        "//:.yarn/patches/@octokit-graphql-schema-npm-15.3.0-4046a59648.patch",
        "//:.yarn/releases/yarn-4.9.1.cjs",
        "//:.yarnrc.yml",
    ],
    # Currently disabled due to:
    #  1. Missing Windows support currently.
    #  2. Incompatibilites with the `ts_library` rule.
    exports_directories_only = False,
    package_json = "//:package.json",
    yarn = "//:.yarn/releases/yarn-4.9.1.cjs",
    yarn_lock = "//:yarn.lock",
)

load("@npm//@bazel/protractor:package.bzl", "npm_bazel_protractor_dependencies")

npm_bazel_protractor_dependencies()

load("@io_bazel_rules_webtesting//web:repositories.bzl", "web_test_repositories")

web_test_repositories()

load("//bazel/browsers:browser_repositories.bzl", "browser_repositories")

browser_repositories()

load("@build_bazel_rules_nodejs//toolchains/esbuild:esbuild_repositories.bzl", "esbuild_repositories")

esbuild_repositories(
    npm_repository = "npm",
)

load("@rules_pkg//:deps.bzl", "rules_pkg_dependencies")

rules_pkg_dependencies()

load("@io_bazel_rules_sass//:defs.bzl", "sass_repositories")

sass_repositories(
    yarn_script = "//:.yarn/releases/yarn-1.22.17.cjs",
)

register_toolchains(
    "//bazel/git-toolchain:git_linux_toolchain",
    "//bazel/git-toolchain:git_macos_x86_toolchain",
    "//bazel/git-toolchain:git_macos_arm64_toolchain",
)

http_archive(
    name = "aspect_rules_ts",
    sha256 = "56858e1e4380948e2d5aca5ab2e96fc5ed788652a4a3b7036e8e4b6f019e63bd",
    strip_prefix = "rules_ts-3.5.3",
    url = "https://github.com/aspect-build/rules_ts/releases/download/v3.5.3/rules_ts-v3.5.3.tar.gz",
)

load("@aspect_rules_ts//ts:repositories.bzl", "rules_ts_dependencies")

rules_ts_dependencies(
    ts_integrity = "sha512-p1diW6TqL9L07nNxvRMM7hMMw4c5XOo/1ibL4aAIGmSAt9slTE1Xgw5KWuof2uTOvCg9BY7ZRi+GaF+7sfgPeQ==",
    ts_version_from = "//bazel:package.json",
)

load("//bazel:setup_dependencies_1.bzl", "setup_dependencies_1")

setup_dependencies_1()

load("//bazel:setup_dependencies_2.bzl", "setup_dependencies_2")

setup_dependencies_2()

# TODO: Move this to the setup scripts. E.g. following proposals like:
# go/ng:sharing-infra-code.
http_archive(
    name = "aspect_rules_esbuild",
    sha256 = "530adfeae30bbbd097e8af845a44a04b641b680c5703b3bf885cbd384ffec779",
    strip_prefix = "rules_esbuild-0.22.1",
    url = "https://github.com/aspect-build/rules_esbuild/releases/download/v0.22.1/rules_esbuild-v0.22.1.tar.gz",
)

load("@aspect_rules_esbuild//esbuild:dependencies.bzl", "rules_esbuild_dependencies")

rules_esbuild_dependencies()

load("@aspect_rules_esbuild//esbuild:repositories.bzl", "LATEST_ESBUILD_VERSION", "esbuild_register_toolchains")

esbuild_register_toolchains(
    name = "esbuild",
    esbuild_version = LATEST_ESBUILD_VERSION,
)
