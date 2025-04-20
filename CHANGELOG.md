# Dryer Lint Change Log

## 1.4.1 

Significantly improve performance for finding the rule sets that match a given file. 
Previously, we used a glob search to find all the files that matched each rule set's glob pattern, then checked if the current file was in it. 
Now, instead, we simply check if the current file matches the pattern. 

In informal testing, the time required to find the matching rule sets changed from nearly a second to <10 milliseconds.

## 1.4 

Use caching for each document to store the list of RuleSets. 
This significantly improves performance for diagnostic refreshes.

## 1.3 

- Add ability to toggle individual rule sets via inline comments.
- Add a "Dryer Lint: Fix All" command that applies fixes for all rules in a file. 
- Change to using Webpack for compiling and bundling Typescript code.
- Improved performance by tracking not updating an editor's diagnostics unless the content has been changed.
- FIX: Fixed a bug where "fix all" (for a single rule or for the "Fix All" command) would fail if any of the edits overlapped.

## 1.2 

* Introduced Rule Sets so that rules for different languages can be defined.
* Added file globs to allow users to filter rule sets so that they only apply to files that match a given pattern.
* Reorganized the Dryer Lint configurations so that rules are given as a list of rule sets in the `"dryerLint.ruleSets"` setting instead of the (now deprecated) `"dryer-lint"` setting.
* Made some improvements to make fixes more reliable.
* Updated to ES2021 and updated package dependencies to remove some out-of-date packages. 

## 1.1
- Update the Quick Fix menu to show a separate item for each rule violation and a "Fix all" item for any rule that is violated multiple times. The items show what rule is being violated. The global "Fix all" item from previous versions was removed because it generally did not work well.
- Deleted code for "sorting" fixes.
- Restructured how "fixes" are generated, by using the initial regex match instead of searching again for the pattern in the matched text. This is important because the old method of searching in the matched text fails when using lookheads or lookbehinds that depend on text that is not included in the match.
- Removed "m" from the regex flags to allow matching the beginning of a multiline string when using "maxLines" greater than 1. 
- Made some improvements to when the diagnostics are refreshed.
- Added a status bar message when diagnostics are refreshed, showing the time required. This helps to alert users when Dryer Lint is degrading editor performance.
- Made the inline enable/disable comment lines formatting more permissive, and added an error alert when a comment is invalid.

## 1.0
- Change name to Dryer Lint.
- Update README and logo.
- Modify `packages.json` to limit the events that activate the extension, reducing overhead.

This also incorporates the changes listed under relint v0.7.0:
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