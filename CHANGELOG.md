# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0](https://github.com/bircni/compress-preview/compare/v0.3.0..v0.4.0) - 2026-05-14

### Added

- **(editor)** add configurable text extensions and extraction hardening - ([5b50edc](https://github.com/bircni/compress-preview/commit/5b50edc886e1ef7f44b51e741c55d133200d8c1f))
- **(webview)** add sorting controls and improve row accessibility - ([9bb2e38](https://github.com/bircni/compress-preview/commit/9bb2e3810031307a57ed0488df2a47f159aa81fb))

### Changed

- **(settings)** document custom text extension configuration - ([c6d1573](https://github.com/bircni/compress-preview/commit/c6d157345e1dbe186a4b68909dfb015038a112cf))

### Fixed

- **(editor)** ignore temp cleanup races - ([d95c21c](https://github.com/bircni/compress-preview/commit/d95c21c0ff1321ffbe9e80ea8b07e7ebd46e3acc))
- **(extract)** harden archive path handling and zip error flow - ([b008501](https://github.com/bircni/compress-preview/commit/b008501e5fe164e1a717d087090685e3c403e1f0))
- **(lint)** avoid import.meta in config - ([699d195](https://github.com/bircni/compress-preview/commit/699d195b0a119953a4cd18707839174ab42c2623))

### Internal

- **(archive)** enable openEntryReadStream zip test with yazl - ([a09d71c](https://github.com/bircni/compress-preview/commit/a09d71ce32e068a5c305ce961c7e1b4894311794))
- **(deps)** refresh tooling and actions - ([afa05a1](https://github.com/bircni/compress-preview/commit/afa05a10b8ba19318ca0485236af5ff3f35abcd1))
- **(lint)** fail on warnings - ([1b4a07a](https://github.com/bircni/compress-preview/commit/1b4a07a52a8f54e9b9891c5646d9e316731e5049))
- **(tests)** replace archiver fixtures with yazl and remove unused deps - ([f741fa8](https://github.com/bircni/compress-preview/commit/f741fa8b00ec01317290bb058d6ea9e497548eb8))
- **(vitest)** migrate from Jest to Vitest - ([9c6735d](https://github.com/bircni/compress-preview/commit/9c6735d5c30017caf228ec681fe86956a4a5d9fe))
- **(webview)** add browser-level html checks to validate and CI - ([14fe762](https://github.com/bircni/compress-preview/commit/14fe762b9a69050dcf68b991214cc27bd1aa36e4))
- tighten linting - ([021135e](https://github.com/bircni/compress-preview/commit/021135eca30415be12d1e89c5ebeb0214f125549))

## [0.3.0](https://github.com/bircni/compress-preview/compare/v0.2.0..v0.3.0) - 2026-04-02

### Added

- workspace settings, refresh and copy path, temp cache TTL - ([cbae39c](https://github.com/bircni/compress-preview/commit/cbae39c33472c33a2dbf37c2763de6a0fd6d4b0f))

### Internal

- **(coverage)** expand archive and editor coverage - ([a0e8fda](https://github.com/bircni/compress-preview/commit/a0e8fda41a512334b64dfb7d734f017583f77036))
- Fixes for Windows - ([39163fd](https://github.com/bircni/compress-preview/commit/39163fd8598229ef6b3e9d1e0079947efb0597a3))
- Update dependencies - ([0e2f9c7](https://github.com/bircni/compress-preview/commit/0e2f9c7038251e972fd50d1ac726fd0891a8207b))

## [0.2.0](https://github.com/bircni/compress-preview/compare/v0.1.0..v0.2.0) - 2026-03-15

### Added

- improve archive preview UX and format support - ([1a100d7](https://github.com/bircni/compress-preview/commit/1a100d7502924eb38dcc1f5a65576d31284604c4))

### Changed

- Update screenshot - ([5ba9ef7](https://github.com/bircni/compress-preview/commit/5ba9ef7b44b8cdb26df3c17fbd431277be857fac))

### Internal

- Update Agents.md - ([e1f03da](https://github.com/bircni/compress-preview/commit/e1f03da19b9fd4112e6b3a4263d06a9612b6dc1c))
- expand archive integration and smoke coverage - ([a181e0f](https://github.com/bircni/compress-preview/commit/a181e0f848033742235613c12c8de0ff013876f6))
- Update release generator - ([910c8bf](https://github.com/bircni/compress-preview/commit/910c8bffeb6138baa0b359d63447ee44f65bcd9b))

## [0.1.0] - 2026-03-15

### Changed

- Add example - ([8fc3feb](https://github.com/bircni/compress-preview/commit/8fc3feb0ef25e98e78563a9283c4443c05d4105d))

### Fixed

- Release script - ([453eaa3](https://github.com/bircni/compress-preview/commit/453eaa3ec9da314568d7260a00957243b81beea9))
- Enhance coverage - ([c326280](https://github.com/bircni/compress-preview/commit/c326280eec5919ff0fa16659756ef824b233e240))
- Move html in dedicated html item - ([401d7a9](https://github.com/bircni/compress-preview/commit/401d7a95b70f85129b427c1bc286245a7bd769c8))

### Internal

- Update package.json and README; improve test implementations - ([68503a5](https://github.com/bircni/compress-preview/commit/68503a5495250a54e624f5051719639e63c018b6))
- Add release call for npm - ([72d5c47](https://github.com/bircni/compress-preview/commit/72d5c472f1e10caa9b37753090ec5304f9307cb0))
- Renaming to compress-preview - ([c57728c](https://github.com/bircni/compress-preview/commit/c57728cbbbcddcc99d9e3f73b8c2c9dbb9db2837))
