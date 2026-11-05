# Change Log

All notable changes to the "Workflow" extension will be documented in this file.

## [0.1.3] - 2026-11-05

-   Added drag and drop: drag files from the Explorer into a group, or drag tabs between groups.
-   Renamed the `WORKFLOWS` view to `Workflows`.
-   Added "Edit File Path..." to change the path of a file stored in a group.
-   Added "Rename Group" and "Restore Group".
-   Workflows with a single group no longer show a "Group N" node; their files are listed directly under the workflow.
-   Added a confirmation before restoring a workflow, with a "Restore and Don't Ask Again" option and the `sparkshift.confirmBeforeRestore` setting.
-   Opening a file from a workflow uses a preview tab; if a file with the same name is already open in the same editor group, it opens as a pinned, non-preview tab instead.

## [0.1.2] - 2025-08-31

-   Fixed a bug where saving a workflow after moving a file would cause a duplicate registration error.
-   Fixed a bug where deleting a tab could delete multiple tabs with the same name.

## [0.1.1] - 2025-08-31

-   Fixed a bug where Save Workflow command show literally, not an Icon nearby main Editor "More Actions..."

## [0.1.0] - 2025-08-30

-   Initial release of the "Workflow" extension.
-   Save and restore workflows, including tab groups, open tabs, and their preview state.
-   Rename, delete, and merge workflows.
-   Delete individual tabs from a saved workflow.
-   Keyboard shortcut for saving a workflow (`Ctrl+Alt+S` or `Cmd+Alt+S`).
-   "Save Workflow" command available in the "More Actions" menu.