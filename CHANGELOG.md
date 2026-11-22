# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Per-request routing from a text-only model to a vision-capable model of the
  same provider when the current turn carries an image.
- Configurable `provider`, `text`, `vision` and `variants` options.
- Image detection in prompt attachments and in tool results.
- Unit tests for detection and routing decisions.

### Changed

- State OpenCode Go as the default setup in the README. Remove the
  alternative-provider configuration example.
