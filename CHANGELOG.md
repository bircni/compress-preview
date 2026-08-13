# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0](https://github.com/bircni/compress-preview/compare/v0.6.1..v0.7.0) - 2026-08-13

### Added

- **(archive)** increase list timeout on retry and report loaded count - ([339ab43](https://github.com/bircni/compress-preview/commit/339ab4305a6e63ddf5019821170b244c942c3eca))
- **(archive)** preview 7z, xz, bzip2, and zstd archives - ([7d6cd2f](https://github.com/bircni/compress-preview/commit/7d6cd2f380ac8b806c68062044a32f0b122ed2d4))
- **(extract)** extract selected paths in a single scan - ([b37cc21](https://github.com/bircni/compress-preview/commit/b37cc21f17496b6687ef186605aee4de0128449f))
- **(preview)** bound large text previews while streaming - ([40b3473](https://github.com/bircni/compress-preview/commit/40b347371d53528155852a28a6649e49ab2305b6))
- **(webview)** multi-select rows and extract the selection - ([149130b](https://github.com/bircni/compress-preview/commit/149130bfd5b46532cc60afb0aa084af7a44e7e84))
- **(webview)** virtualize the archive table - ([558c739](https://github.com/bircni/compress-preview/commit/558c739f7bd803ec52644864ebf8e60138a870a5))
- **(webview)** add keyboard navigation for the archive tree - ([e367daf](https://github.com/bircni/compress-preview/commit/e367daf9f3e522695f45af0445412d33820c1ded))

### Fixed

- **(extract)** merge or replace when extract-all hits an existing folder - ([5102ccd](https://github.com/bircni/compress-preview/commit/5102ccd87d538e8d184fafc447a3a0e50da12b32))
- **(extract)** update extract-all e2e for merge and replace - ([6a02c99](https://github.com/bircni/compress-preview/commit/6a02c99e7b7ea4413737172ebded4e4e54c6eb1f))
- **(webview)** classify text vs binary once in the extension host - ([00fc223](https://github.com/bircni/compress-preview/commit/00fc223d06e8117b6179fda0673456cc9a8e4b3b))
- **(webview)** size columns after the table is visible - ([dab6788](https://github.com/bircni/compress-preview/commit/dab6788eeb34b5511ced7fd3378634c64e4555d5))

### Internal

- **(deps)** update development dependencies ([#17](https://github.com/bircni/compress-preview/issues/17)) - ([d6fbf13](https://github.com/bircni/compress-preview/commit/d6fbf13bad8623e0f872ca5063e8096e31f90d9a))
- **(lint)** avoid object default params and dataset accessors - ([0006f98](https://github.com/bircni/compress-preview/commit/0006f9876607fc31d3c7cf5ca9c986935467a235))
- **(lint)** use dataset.path in keyboard navigation tests - ([b0a80fa](https://github.com/bircni/compress-preview/commit/b0a80fae944fb13ec20dd0f622dd2d9c3bc34417))
- keep list timeout and path helpers unexported - ([472ed89](https://github.com/bircni/compress-preview/commit/472ed890ee23f8f20d5b41ba9f6b9b33da23acac))

## [0.6.1](https://github.com/bircni/compress-preview/compare/v0.6.0..v0.6.1) - 2026-08-02

### Fixed

- show the entry file name on text preview tabs ([#16](https://github.com/bircni/compress-preview/issues/16)) - ([d99c597](https://github.com/bircni/compress-preview/commit/d99c5974d28a09d7624c8e01ce8f38c7af4100b2))

### Internal

- **(deps)** update dependencies and adapt to unicorn 72 - ([5740484](https://github.com/bircni/compress-preview/commit/574048457cf4808acb1cab592dba2121c30a7320))
- migrate from eslint/prettier to oxlint and oxfmt - ([10256c8](https://github.com/bircni/compress-preview/commit/10256c8291a291ecc56680007ce5da14367a05af))

## [0.6.0](https://github.com/bircni/compress-preview/compare/v0.5.0..v0.6.0) - 2026-06-14

### Added

- add more zip extensions ([#13](https://github.com/bircni/compress-preview/issues/13)) - ([553025c](https://github.com/bircni/compress-preview/commit/553025c53c9e40c5665fe06f0e166868f2c26814))

### Internal

- **(deps)** Update deps for security reasons ([#11](https://github.com/bircni/compress-preview/issues/11)) - ([b03ec6d](https://github.com/bircni/compress-preview/commit/b03ec6d29da306bd7dffa1ae99697bb033747940))
- project hygiene — unicorn, strict tsconfig, knip, re-enable e2e CI ([#12](https://github.com/bircni/compress-preview/issues/12)) - ([dd82fae](https://github.com/bircni/compress-preview/commit/dd82fae088c3b48a9050653145b1bd8f16feda94))

## [0.5.0](https://github.com/bircni/compress-preview/compare/v0.4.0..v0.5.0) - 2026-05-30

### Added

- **(webview)** native table UI with codicons and resizable columns - ([5138677](https://github.com/bircni/compress-preview/commit/51386778209a579468fa98d0ca863417ebeee2d6))

### Internal

- **(ci)** unify e2e workflow and update docs - ([5e4cb3e](https://github.com/bircni/compress-preview/commit/5e4cb3e46fb4ce6f758ce88c89c013b46887c1ad))
- **(e2e)** migrate extension-host and browser suites to Vitest - ([973e232](https://github.com/bircni/compress-preview/commit/973e2324070b878454abdca70176cb6d40fa85c2))
- **(webview)** add harness tests and expand unit coverage - ([f38bc55](https://github.com/bircni/compress-preview/commit/f38bc55251c0eb1e6a11ad821813a7ff3a393eb4))
- **(webview)** expand Playwright browser coverage - ([618d8c0](https://github.com/bircni/compress-preview/commit/618d8c065c018b96cc613d2315e60324d1c84aed))
- Update dependencies - ([5228624](https://github.com/bircni/compress-preview/commit/5228624de923b54071bffc849eac649aea90ab7c))
- Adjust unused deps - ([faa072e](https://github.com/bircni/compress-preview/commit/faa072e51725e5b129809382df4342905e43ab8a))

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
