# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Per-request routing from a text-only model to a vision-capable model of the
  same provider when the current turn carries an image.
- Configurable `provider`, `text`, `vision`, `variants`, `rescue` and
  `screenshotTools` options.
- Image detection in prompt attachments and in tool results.
- Detection of admission metadata attachments, so uploads from desktop and
  TUI clients route to the vision model as well.
- Tool result images route the next request. After a `read` of an image file
  or a screenshot on the text model, the next request of the turn uses the
  vision model and sees the stored image.
- A read instruction for screenshot tools that save the image only to a file.
  The `screenshotTools` option lists these tools.
- Unit tests for detection and routing decisions.

### Changed

- Check the supported OpenCode floor in source. The step order, the hooks and
  the stored message shapes are the same in 2.2.7 and 2.3.2, so the floor stays
  at 2.2.7.
- Correct the README: inline images from the screenshot tools are routed, not
  dropped. OpenCode stores them in the tool result before the note replaces
  them in a text-only request.

- State OpenCode Go as the default setup in the README. Remove the
  alternative-provider configuration example.
- Simplify installation to one command. Describe the `opencode-go/glm-5.3`
  activation condition as behaviour, not as a setup step.
- Decide from the stored messages of the current turn: the messages after the
  last `idle` marker. The plugin keeps no state between requests.
- Append the read instruction to a screenshot result. The original content
  stays in the result.
- Make the default `screenshotTools` list empty. A tool that returns an image
  needs no entry.
- Remove the `variants` default. Without the option, the plugin carries over
  each variant that the vision model has.
- If the image check fails, keep the selected model and write a warning to the
  log once.
- A disabled vision model no longer routes. The plugin checks the list of
  enabled models before the rewrite.
- Pin `@opencode/plugin` to `^2.2.7` instead of `latest`.
- Document all options, the turn rule and the limitations in the README.
- Test the plugin hooks with message fixtures that the OpenCode 2.3.2 schema
  accepts.

### Removed

- The `prompt` and `context` hooks and the module-level maps.
- The read pointer. An image read on the text model no longer gets a pointer
  text and a second read.
- `browse_screenshot` from the default `screenshotTools` list. OpenCode has no
  tool with this name.

### Fixed

- Keep an image turn on the vision model when a text prompt is steered into
  it. Before, each admitted prompt reset the image flag.
- Detect images in the message shapes that OpenCode 2.3.2 stores. Detection
  uses the MIME type, so a pasted image without a file extension also routes.
- Keep the selected model when the provider catalog has no vision model.
  Before, the request failed with `ModelUnavailableError`.
- Drop a variant that the vision model does not have. Before, the request
  failed with `VariantUnavailableError`.
- Route only requests on the configured provider and text model. Before, the
  read rescue also ran for a model with the same id from another provider.
