# Workflow

This extension allows you to save and restore your workflows in Visual Studio Code. A workflow consists of the groups of tabs you have open, including their layout and preview state.

## Features

*   **Save Workflow**: Save your current tab groups and their tabs as a named workflow.
*   **Restore Workflow**: Restore a previously saved workflow, reopening all its tabs in their original groups and layout.
*   **Rename Workflow**: Rename a saved workflow.
*   **Delete Workflow**: Delete a saved workflow.
*   **Merge Workflows**: If you save a workflow with an existing name, you can merge the new tabs into the existing workflow.
*   **Delete Individual Tabs**: You can delete individual tabs from a saved workflow.

## How to Use

1.  **Save a Workflow**:
    *   Use the keyboard shortcut `Ctrl+Alt+S` (or `Cmd+Alt+S` on macOS).
    *   Click the "Save Workflow" icon in the editor title bar (in the "More Actions" menu).
    *   Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run the "Workflow: Save Workflow" command.
    *   Enter a name for your workflow.

2.  **Restore a Workflow**:
    *   Open the Command Palette.
    *   Run the "Workflow: Restore Workflow..." command.
    *   Select a workflow from the list.

3.  **Manage Workflows**:
    *   In the Explorer view, you will see a "WORKFLOWS" section.
    *   Right-click on a workflow to rename or delete it.
    *   Right-click on a tab within a workflow to delete it.

## Publishing to the Marketplace

To publish this extension to the Visual Studio Marketplace, you will need to use the `vsce` command-line tool.

1.  **Install `vsce`**:
    ```bash
    npm install -g vsce
    ```

2.  **Create a Publisher**:
    *   Go to the [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage) and create a publisher.
    *   Create a new Azure DevOps organization if you don't have one already.
    *   Create a Personal Access Token (PAT) with the "Marketplace (publish)" scope.

3.  **Update `package.json`**:
    *   Add your publisher ID to the `publisher` field in the `package.json` file:
        ```json
        "publisher": "your-publisher-id"
        ```

4.  **Publish**:
    *   Log in to your publisher account:
        ```bash
        vsce login your-publisher-id
        ```
    *   Package and publish the extension:
        ```bash
        vsce publish
