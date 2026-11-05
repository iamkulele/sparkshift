import * as vscode from 'vscode';
import * as path from 'path';
import {
    WorkflowsProvider,
    WorkflowsDragAndDropController,
    TabInfo,
    TabGroupInfo,
    WORKFLOWS_KEY,
} from './workflowProvider';

export function activate(context: vscode.ExtensionContext) {

    console.log('Congratulations, your extension "sparkshift" is now active!');

    const workflowsProvider = new WorkflowsProvider(context);
    const workflowsTreeView = vscode.window.createTreeView('sparkshift.workflows', {
        treeDataProvider: workflowsProvider,
        dragAndDropController: new WorkflowsDragAndDropController(context, workflowsProvider),
        canSelectMany: true,
    });

    const saveWorkflowCommand = vscode.commands.registerCommand('sparkshift.saveWorkflow', async () => {
        const now = new Date();
        const defaultName = `Workflow ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}_${String(now.getMinutes()).padStart(2, '0')}_${String(now.getSeconds()).padStart(2, '0')}`;
        const workflowName = await vscode.window.showInputBox({
            prompt: 'Enter a name for this workflow',
            value: defaultName
        });
        if (!workflowName) {
            return;
        }

        await vscode.workspace.saveAll();

        const outputChannel = vscode.window.createOutputChannel("SparkShift");
        outputChannel.appendLine(`Saving workflow: ${workflowName}`);

        const tabGroups = vscode.window.tabGroups;
        const allGroups = tabGroups.all;
        const newSerializableGroups: TabGroupInfo[] = [];

        outputChannel.appendLine(`Found ${allGroups.length} tab groups.`);

        for (const group of allGroups) {
            const tabs: TabInfo[] = [];
            let activeTabUri: string | undefined;

            outputChannel.appendLine(`Processing group with view column: ${group.viewColumn} and ${group.tabs.length} tabs.`);

            for (const tab of group.tabs) {
                let uri: vscode.Uri | undefined;
                let type: 'file' | 'other' = 'other';
                if (tab.input instanceof vscode.TabInputText) {
                    uri = tab.input.uri;
                    type = 'file';
                } else if (tab.input instanceof vscode.TabInputNotebook) {
                    uri = tab.input.uri;
                    type = 'file';
                } else {
                    const input = tab.input as { uri?: vscode.Uri };
                    if (input && input.uri) {
                        uri = input.uri;
                        type = 'file';
                    }
                }

                if (uri) {
                    const uriString = uri.toString();
                    tabs.push({ uri: uriString, isPreview: tab.isPreview, label: tab.label, type });
                    outputChannel.appendLine(`Found tab: ${uriString}`);
                    if (tab.isActive) {
                        activeTabUri = uriString;
                    }
                } else {
                    tabs.push({ isPreview: tab.isPreview, label: tab.label, type: 'other' });
                    outputChannel.appendLine(`Found special tab: ${tab.label}`);
                }
            }

            if (tabs.length > 0) {
                newSerializableGroups.push({
                    viewColumn: group.viewColumn,
                    tabs,
                    activeTabUri,
                });
                outputChannel.appendLine(`Added group to workflow with ${tabs.length} tabs.`);
            }
        }

        const savedWorkflows = context.globalState.get<{ [name: string]: TabGroupInfo[] }>(WORKFLOWS_KEY, {});
        const existingGroups = savedWorkflows[workflowName];

        let finalGroups: TabGroupInfo[];
        let message: string;

        if (existingGroups) {
            const mergeConfirmation = await vscode.window.showWarningMessage(
                `Workflow '${workflowName}' already exists. Do you want to merge the current tabs into it?`,
                { modal: true },
                'Merge'
            );
            if (mergeConfirmation !== 'Merge') {
                return;
            }
            
            outputChannel.appendLine(`Merging into existing workflow: ${workflowName}`);
            const merged = [...existingGroups];

            for (const newGroup of newSerializableGroups) {
                const existingGroup = merged.find(g => g.viewColumn === newGroup.viewColumn);
                if (existingGroup) {
                    for (const newTab of newGroup.tabs) {
                        const tabExists = existingGroup.tabs.some(existingTab => existingTab.uri === newTab.uri);
                        if (!tabExists) {
                            existingGroup.tabs.push(newTab);
                        }
                    }
                    if (newGroup.activeTabUri) {
                        existingGroup.activeTabUri = newGroup.activeTabUri;
                    }
                } else {
                    merged.push(newGroup);
                }
            }
            finalGroups = merged;
            message = `Workflow '${workflowName}' merged!`;

        } else {
            finalGroups = newSerializableGroups;
            message = `Workflow '${workflowName}' saved!`;
        }

        outputChannel.appendLine(`Saving ${finalGroups.length} groups to workflow.`);

        savedWorkflows[workflowName] = finalGroups;
        await context.globalState.update(WORKFLOWS_KEY, savedWorkflows);

        workflowsProvider.refresh();
        vscode.window.showInformationMessage(message);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    const openSavedGroup = async (group: TabGroupInfo): Promise<void> => {
        for (const tab of group.tabs) {
            try {
                if (tab.uri) {
                    await vscode.window.showTextDocument(vscode.Uri.parse(tab.uri), {
                        viewColumn: group.viewColumn,
                        preserveFocus: true,
                        preview: tab.isPreview,
                    });
                } else if (tab.label === 'Settings') {
                    await vscode.commands.executeCommand('workbench.action.openSettings');
                } else if (tab.label === 'Welcome') {
                    await vscode.commands.executeCommand('workbench.action.showWelcomePage');
                }
            } catch (error) {
                console.error(`Failed to open tab ${tab.label}:`, error);
                vscode.window.showWarningMessage(`Could not restore tab: ${tab.label}`);
            }
        }
    };

    const activateSavedGroup = async (group: TabGroupInfo): Promise<void> => {
        if (!group.activeTabUri) {
            return;
        }
        try {
            const activeTab = group.tabs.find(t => t.uri === group.activeTabUri);
            if (activeTab?.uri) {
                await vscode.window.showTextDocument(vscode.Uri.parse(activeTab.uri), {
                    viewColumn: group.viewColumn,
                    preserveFocus: false,
                    preview: false,
                });
            }
        } catch (error) {
            console.error(`Failed to activate tab ${group.activeTabUri}:`, error);
            vscode.window.showWarningMessage(`Could not activate tab: ${group.activeTabUri}`);
        }
    };

    const restoreWorkflowCommand = vscode.commands.registerCommand('sparkshift.restoreWorkflow', async (workflowItem?: { label: string }) => {
        let workflowName: string | undefined;

        if (workflowItem) {
            workflowName = workflowItem.label;
        } else {
            const savedWorkflows = context.globalState.get<{ [name: string]: any[] }>(WORKFLOWS_KEY, {});
            const workflowNames = Object.keys(savedWorkflows);
            if (workflowNames.length === 0) {
                vscode.window.showInformationMessage('No saved workflows to restore.');
                return;
            }
            workflowName = await vscode.window.showQuickPick(workflowNames, { placeHolder: 'Select a workflow to restore' });
        }

        if (!workflowName) {
            return;
        }

        const savedWorkflows = context.globalState.get<{ [name: string]: any[] }>(WORKFLOWS_KEY, {});
        const savedGroups = savedWorkflows[workflowName];

        if (!savedGroups || savedGroups.length === 0) {
            vscode.window.showInformationMessage('No saved tab groups to restore.');
            return;
        }

        const restoreAnyway = "Restore and Don't Ask Again";
        const confirmBeforeRestore = vscode.workspace.getConfiguration('sparkshift').get('confirmBeforeRestore', true);
        if (confirmBeforeRestore) {
            const choice = await vscode.window.showWarningMessage(
                'Restoring this workflow will close all currently open editors and replace them with the saved layout.',
                { modal: true },
                'Restore',
                restoreAnyway
            );
            if (choice === undefined) {
                return;
            }
            if (choice === restoreAnyway) {
                await vscode.workspace.getConfiguration('sparkshift').update('confirmBeforeRestore', false, vscode.ConfigurationTarget.Global);
            }
        }

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        for (const group of savedGroups) {
            await openSavedGroup(group);
        }

        // After all tabs are opened, iterate again to set the active tab for each group.
        for (const group of savedGroups) {
            await activateSavedGroup(group);
        }

        vscode.window.showInformationMessage(`Workflow '${workflowName}' restored!`);
    });

    const restoreGroupCommand = vscode.commands.registerCommand('sparkshift.restoreGroup', async (groupItem: { workflowName: string; groupIndex: number }) => {
        if (!groupItem) {
            return;
        }
        const savedWorkflows = context.globalState.get<{ [name: string]: TabGroupInfo[] }>(WORKFLOWS_KEY, {});
        const group = savedWorkflows[groupItem.workflowName]?.[groupItem.groupIndex];
        if (!group) {
            return;
        }

        await openSavedGroup(group);
        await activateSavedGroup(group);
    });

    const renameGroupCommand = vscode.commands.registerCommand('sparkshift.renameGroup', async (groupItem: { workflowName: string; groupIndex: number }) => {
        if (!groupItem) {
            return;
        }
        const savedWorkflows = context.globalState.get<{ [name: string]: TabGroupInfo[] }>(WORKFLOWS_KEY, {});
        const group = savedWorkflows[groupItem.workflowName]?.[groupItem.groupIndex];
        if (!group) {
            return;
        }

        const currentName = group.name ?? `Group ${group.viewColumn}`;
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter a new name for this group',
            value: currentName
        });
        if (newName === undefined) {
            return;
        }

        const trimmedName = newName.trim();
        if (trimmedName === currentName) {
            return;
        }

        group.name = trimmedName || undefined;
        await context.globalState.update(WORKFLOWS_KEY, savedWorkflows);
        workflowsProvider.refresh();
    });

    const refreshWorkflowsCommand = vscode.commands.registerCommand('sparkshift.refreshWorkflows', () => {
        workflowsProvider.refresh();
    });

    const hasSameNameOpenTab = (viewColumn: vscode.ViewColumn, fileName: string): boolean => {
        const group = vscode.window.tabGroups.all.find(g => g.viewColumn === viewColumn);
        if (!group) {
            return false;
        }
        return group.tabs.some(tab => {
            const uri = (tab.input as { uri?: vscode.Uri } | undefined)?.uri;
            return path.basename(uri?.fsPath ?? tab.label) === fileName;
        });
    };

    const openTabCommand = vscode.commands.registerCommand('sparkshift.openTab', async (tabInfo: TabInfo, viewColumn: vscode.ViewColumn) => {
        try {
            if (tabInfo.uri) {
                const uri = vscode.Uri.parse(tabInfo.uri);
                const fileName = path.basename(uri.fsPath);
                const document = await vscode.workspace.openTextDocument(uri);
                const preview = !hasSameNameOpenTab(viewColumn, fileName);
                await vscode.window.showTextDocument(document, { viewColumn, preview });
            }
        } catch (error) {
            console.error(`Failed to open tab ${tabInfo.label}:`, error);
            vscode.window.showWarningMessage(`Could not open tab: ${tabInfo.label}`);
        }
    });

    const deleteWorkflowCommand = vscode.commands.registerCommand('sparkshift.deleteWorkflow', async (workflowItem: { label: string }) => {
        const workflowName = workflowItem.label;
        const savedWorkflows = context.globalState.get<{ [name: string]: any[] }>(WORKFLOWS_KEY, {});
        delete savedWorkflows[workflowName];
        await context.globalState.update(WORKFLOWS_KEY, savedWorkflows);
        workflowsProvider.refresh();
        vscode.window.showInformationMessage(`Workflow '${workflowName}' deleted.`);
    });

    const renameWorkflowCommand = vscode.commands.registerCommand('sparkshift.renameWorkflow', async (workflowItem: { label: string }) => {
        const oldWorkflowName = workflowItem.label;
        const newWorkflowName = await vscode.window.showInputBox({
            prompt: 'Enter a new name for this workflow',
            value: oldWorkflowName
        });

        if (!newWorkflowName || newWorkflowName === oldWorkflowName) {
            return;
        }

        const savedWorkflows = context.globalState.get<{ [name: string]: any[] }>(WORKFLOWS_KEY, {});
        savedWorkflows[newWorkflowName] = savedWorkflows[oldWorkflowName];
        delete savedWorkflows[oldWorkflowName];
        await context.globalState.update(WORKFLOWS_KEY, savedWorkflows);
        workflowsProvider.refresh();
    });

    const deleteTabCommand = vscode.commands.registerCommand('sparkshift.deleteTab', async (tabItem: any) => {
        const { workflowName, viewColumn, tabInfo } = tabItem;
        const savedWorkflows = context.globalState.get<{ [name: string]: TabGroupInfo[] }>(WORKFLOWS_KEY, {});
        const workflow = savedWorkflows[workflowName];
        if (!workflow) {
            return;
        }

        const group = workflow.find(g => g.viewColumn === viewColumn);
        if (!group) {
            return;
        }

        group.tabs = group.tabs.filter(t => tabInfo.uri ? t.uri !== tabInfo.uri : t.label !== tabInfo.label);

        if (group.tabs.length === 0) {
            const groupIndex = workflow.findIndex(g => g.viewColumn === viewColumn);
            if (groupIndex > -1) {
                workflow.splice(groupIndex, 1);
            }
        }

        if (workflow.length === 0) {
            delete savedWorkflows[workflowName];
        }

        await context.globalState.update(WORKFLOWS_KEY, savedWorkflows);
        workflowsProvider.refresh();
    });

    const editTabPathCommand = vscode.commands.registerCommand('sparkshift.editTabPath', async (tabItem: any) => {
        if (!tabItem?.tabInfo?.uri) {
            return;
        }
        const { workflowName, viewColumn, tabInfo } = tabItem;

        const currentPath = vscode.Uri.parse(tabInfo.uri).fsPath;
        const newPath = await vscode.window.showInputBox({
            prompt: 'Enter the new absolute file path',
            value: currentPath
        });
        if (!newPath || newPath === currentPath) {
            return;
        }
        if (!path.isAbsolute(newPath)) {
            vscode.window.showWarningMessage('Please enter an absolute file path.');
            return;
        }

        const newUri = vscode.Uri.file(newPath);
        try {
            await vscode.workspace.fs.stat(newUri);
        } catch {
            vscode.window.showWarningMessage(`File not found: ${newPath}`);
            return;
        }

        const oldUriString = tabInfo.uri;
        const savedWorkflows = context.globalState.get<{ [name: string]: TabGroupInfo[] }>(WORKFLOWS_KEY, {});
        const group = savedWorkflows[workflowName]?.find(g => g.viewColumn === viewColumn);
        const tab = group?.tabs.find(t => t.uri === oldUriString);
        if (!group || !tab) {
            return;
        }

        const newUriString = newUri.toString();
        tab.uri = newUriString;
        tab.label = path.basename(newPath);
        if (group.activeTabUri === oldUriString) {
            group.activeTabUri = newUriString;
        }

        await context.globalState.update(WORKFLOWS_KEY, savedWorkflows);
        workflowsProvider.refresh();
    });

    context.subscriptions.push(
        workflowsTreeView,
        saveWorkflowCommand,
        restoreWorkflowCommand,
        refreshWorkflowsCommand,
        openTabCommand,
        deleteWorkflowCommand,
        renameWorkflowCommand,
        deleteTabCommand,
        editTabPathCommand,
        restoreGroupCommand,
        renameGroupCommand
    );
}

export function deactivate() {}
