# Dryer Lint Change Log

## 1.0
- Change name to Dryer Lint.
- Update README and logo.
- Modify `packages.json` to limit the events that activate the extension, reducing overhead.

This also incorporates the changes listed under relint v0.7.0 that have not yet been merged into the relint project, as of March 4, 2025:
- Add ability to disable/enable Dryer Lint via inline comments.
- Allow group match replacement in diagnostic messages.
- Make regex case-sensitive by default. To make a pattern case-sensitive, set the new `"caseInsensitive"` option to true.
- Show error messages and status bar item for invalid rules.


# Relint Change Log

Changes to the “relint” extension prior to forking the Dryer Lint project are listed here.

## 0.1.0
- Initial release

## 0.1.1
- Fix contribution points

## 0.1.2
- Reload diagnostics when config changes

## 0.1.3
- Reload code actions when config changes

## 0.1.4
- Apply fixes recursively

## 0.1.5
- Polish and fixes

## 0.2.0
- Add reordering support

## 0.3.0
- Improve reordering and fix diagnostics issues

## 0.3.1
- Fix issue where some diagnostics are skipped

## 0.4.0
- Improve recursive fixes and merge diagnostics with the same name

## 0.4.1
- Recursive fixes are only done for rules in the same group

## 0.4.2
- Update README

## 0.4.3
- Improve performance

## 0.4.4
- Add new config `maxLines` to enable optimizations

## 0.5.0
- Refactor `datastructures` to improve performance

## 0.5.1
- Fix crash on unsupported language

## 0.6.0
- Don't diagnose files outside of project and allow multiple languages per rule

## 0.6.1
- Update README and add icon

## 0.7.0
- Add ability to disable/enable Relint via inline comments.
- Allow group match replacement in diagnostic messages.
- Make regex case-sensitive by default. To make a pattern case-sensitive, set the new `"caseInsensitive"` option to true.
- Show error messages and status bar item for invalid rules.