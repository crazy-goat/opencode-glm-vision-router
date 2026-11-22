# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Per-request routing from a text-only model to a vision-capable model of the
  same provider when the current turn carries an image.
- Configurable `provider`, `text`, `vision` and `variants` options.
- Image detection in prompt attachments and in tool results.
- Detection of admission metadata attachments, so uploads from desktop and
  TUI clients route to the vision model as well.
- Rescue of image reads on the text model: the `execute.after` tool hook
  replaces the image result of `read` with a pointer text and routes the next
  request to the vision model, which reads the file again and sees the image.
- Screenshot routing: the same hook arms the vision flag when
  `browse_screenshot` or `browser_screenshot` returns an image on the text
  model. The stored image reaches the next request without a repeat read; a
  screenshot saved only as a file carries a read instruction for the saved
  path. The `screenshotTools` option lists the handled tool names.
- Unit tests for detection and routing decisions.

### Changed

- Correct the README: inline images from the screenshot tools are routed, not
  dropped. OpenCode stores them in the tool result before the note replaces
  them in a text-only request.

- State OpenCode Go as the default setup in the README. Remove the
  alternative-provider configuration example.
- Simplify installation to one command. Describe the `opencode-go/glm-5.3`
  activation condition as behaviour, not as a setup step.
