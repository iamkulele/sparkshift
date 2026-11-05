import * as vscode from 'vscode';
import * as path from 'path';

export const WORKFLOWS_KEY = 'workflows';

const TREE_MIME = 'application/vnd.code.tree.sparkshift.workflows';
const URI_LIST_MIME = 'text/uri-list';

export interface TabInfo {
    uri?: string;
    isPreview: boolean;
    label: string;
    type: 'file' | 'other';
}

export interface TabGroupInfo {
    viewColumn: vscode.ViewColumn;
    tabs: TabInfo[];
    activeTabUri?: string;
    name?: string;
}

type WorkflowStore = { [workflowName: string]: TabGroupInfo[] };

function sameTab(a: TabInfo, b: TabInfo): boolean {
    if (a.uri || b.uri) {
        return a.uri === b.uri;
    }
    return a.label === b.label && a.type === b.type;
}

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
            const savedWorkflows = this.context.globalState.get<WorkflowStore>(WORKFLOWS_KEY, {});
            const workflowNames = Object.keys(savedWorkflows);
            return workflowNames.map(workflowName => new WorkflowItem(workflowName, vscode.TreeItemCollapsibleState.Collapsed));
        }
    }

    private getGroupsForWorkflow(workflowItem: WorkflowItem): vscode.TreeItem[] {
        const savedWorkflows = this.context.globalState.get<WorkflowStore>(WORKFLOWS_KEY, {});
        const workflow = savedWorkflows[workflowItem.label];
        if (!workflow) {
            return [];
        }

        const toTabItems = (group: TabGroupInfo, groupIndex: number): TabItem[] =>
            group.tabs.map((tab: TabInfo) => {
                if (tab.type === 'file' && tab.uri) {
                    const uri = vscode.Uri.parse(tab.uri);
                    return new TabItem(path.basename(uri.fsPath), tab, group.viewColumn, workflowItem.label, groupIndex);
                } else {
                    return new TabItem(tab.label, tab, group.viewColumn, workflowItem.label, groupIndex);
                }
            });

        if (workflow.length === 1) {
            return toTabItems(workflow[0], 0);
        }

        return workflow.map((group, groupIndex) =>
            new GroupItem(workflowItem.label, groupIndex, group, toTabItems(group, groupIndex)));
    }
}

export class WorkflowsDragAndDropController implements vscode.TreeDragAndDropController<vscode.TreeItem> {

    readonly dropMimeTypes = [TREE_MIME, URI_LIST_MIME];
    readonly dragMimeTypes = [TREE_MIME];

    constructor(private context: vscode.ExtensionContext, private provider: WorkflowsProvider) {
    }

    handleDrag(source: readonly vscode.TreeItem[], dataTransfer: vscode.DataTransfer): void {
        const tabItems = source.filter((item): item is TabItem => item instanceof TabItem);
        if (tabItems.length === 0) {
            return;
        }
        dataTransfer.set(TREE_MIME, new vscode.DataTransferItem(tabItems));
    }

    async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const savedWorkflows = this.context.globalState.get<WorkflowStore>(WORKFLOWS_KEY, {});

        let destWorkflowName: string | undefined;
        let destGroupIndex: number | undefined;
        if (target instanceof GroupItem) {
            destWorkflowName = target.workflowName;
            destGroupIndex = target.groupIndex;
        } else if (target instanceof WorkflowItem && savedWorkflows[target.label]?.length === 1) {
            destWorkflowName = target.label;
            destGroupIndex = 0;
        }
        if (destWorkflowName === undefined || destGroupIndex === undefined) {
            return;
        }

        const destGroup = savedWorkflows[destWorkflowName]?.[destGroupIndex];
        if (!destGroup) {
            return;
        }

        const touchedWorkflows = new Set<string>();
        let changed = false;

        const draggedItems = dataTransfer.get(TREE_MIME)?.value as TabItem[] | undefined;
        for (const item of draggedItems ?? []) {
            if (!(item instanceof TabItem)) {
                continue;
            }
            if (item.workflowName === destWorkflowName && item.groupIndex === destGroupIndex) {
                continue;
            }
            const sourceGroup = savedWorkflows[item.workflowName]?.[item.groupIndex];
            if (!sourceGroup) {
                continue;
            }
            if (destGroup.tabs.some(t => sameTab(t, item.tabInfo))) {
                continue;
            }
            const index = sourceGroup.tabs.findIndex(t => sameTab(t, item.tabInfo));
            if (index === -1) {
                continue;
            }
            sourceGroup.tabs.splice(index, 1);
            destGroup.tabs.push(item.tabInfo);
            touchedWorkflows.add(item.workflowName);
            changed = true;
        }

        const uriListItem = dataTransfer.get(URI_LIST_MIME);
        if (uriListItem) {
            const text = await uriListItem.asString();
            for (const line of text.split(/\r?\n/)) {
                const value = line.trim();
                if (!value) {
                    continue;
                }
                const uri = vscode.Uri.parse(value);
                if (uri.scheme !== 'file') {
                    continue;
                }
                const uriString = uri.toString();
                if (destGroup.tabs.some(t => t.uri === uriString)) {
                    continue;
                }
                destGroup.tabs.push({
                    uri: uriString,
                    isPreview: false,
                    label: path.basename(uri.fsPath),
                    type: 'file',
                });
                changed = true;
            }
        }

        if (!changed) {
            return;
        }

        for (const workflowName of touchedWorkflows) {
            const groups = savedWorkflows[workflowName];
            if (groups && groups.some(g => g.tabs.length === 0)) {
                const remaining = groups.filter(g => g.tabs.length > 0);
                if (remaining.length === 0) {
                    delete savedWorkflows[workflowName];
                } else {
                    savedWorkflows[workflowName] = remaining;
                }
            }
        }

        await this.context.globalState.update(WORKFLOWS_KEY, savedWorkflows);
        this.provider.refresh();
    }
}

export class WorkflowItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = 'session';
    }
}

export class GroupItem extends vscode.TreeItem {
    constructor(
        public readonly workflowName: string,
        public readonly groupIndex: number,
        group: TabGroupInfo,
        public readonly tabs: TabItem[]
    ) {
        super(group.name ?? `Group ${group.viewColumn}`, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'group';
        this.tooltip = `${this.tabs.length} tabs`;
    }
}

export class TabItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tabInfo: TabInfo,
        public readonly viewColumn: vscode.ViewColumn,
        public readonly workflowName: string,
        public readonly groupIndex: number
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'tab';
        this.command = {
            command: 'sparkshift.openTab',
            title: 'Open Tab',
            arguments: [this.tabInfo, this.viewColumn]
        };
        if (this.tabInfo.type === 'file' && this.tabInfo.uri) {
            const resourceUri = vscode.Uri.parse(this.tabInfo.uri);
            this.tooltip = resourceUri.fsPath;
            this.description = path.dirname(resourceUri.fsPath);
        } else {
            this.description = 'Special Tab';
        }
        this.id = `${this.workflowName}-${this.viewColumn}-${this.label}-${this.tabInfo.uri}`;
    }
}
