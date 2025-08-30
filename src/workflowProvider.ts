import * as vscode from 'vscode';
import * as path from 'path';

export class WorkflowsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            if (element instanceof WorkflowItem) {
                return this.getGroupsForWorkflow(element as WorkflowItem);
            }
            if (element instanceof GroupItem) {
                return element.tabs;
            }
            return [];
        } else {
            const savedWorkflows = this.context.globalState.get<{ [name: string]: any[] }>('workflows', {});
            const workflowNames = Object.keys(savedWorkflows);
            return workflowNames.map(workflowName => new WorkflowItem(workflowName, vscode.TreeItemCollapsibleState.Collapsed));
        }
    }

    private getGroupsForWorkflow(workflowItem: WorkflowItem): vscode.TreeItem[] {
        const savedWorkflows = this.context.globalState.get<{ [name: string]: any[] }>('workflows', {});
        const workflow = savedWorkflows[workflowItem.label];
        if (!workflow) {
            return [];
        }

        const groupItems: GroupItem[] = [];
        for (const group of workflow) {
            const tabs = group.tabs.map((tab: any) => {
                if (tab.type === 'file' && tab.uri) {
                    const uri = vscode.Uri.parse(tab.uri);
                    return new TabItem(path.basename(uri.fsPath), tab, group.viewColumn, workflowItem.label);
                } else {
                    return new TabItem(tab.label, tab, group.viewColumn, workflowItem.label);
                }
            });
            groupItems.push(new GroupItem(`Group ${group.viewColumn}`, vscode.TreeItemCollapsibleState.Expanded, tabs));
        }
        return groupItems;
    }
}

class WorkflowItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = 'session';
    }
}

class GroupItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly tabs: TabItem[]
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.tabs.length} tabs`;
    }
}

class TabItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tabInfo: any,
        public readonly viewColumn: vscode.ViewColumn,
        public readonly workflowName: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'tab';
        this.command = {
            command: 'sparkshift.openTab',
            title: 'Open Tab',
            arguments: [this.tabInfo, this.viewColumn]
        };
        if (this.tabInfo.type === 'file') {
            const resourceUri = vscode.Uri.parse(this.tabInfo.uri);
            this.tooltip = resourceUri.fsPath;
            this.description = path.dirname(resourceUri.fsPath);
        } else {
            this.description = 'Special Tab';
        }
        this.id = `${this.workflowName}-${this.viewColumn}-${this.label}`;
    }
}