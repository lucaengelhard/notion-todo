import * as vscode from "vscode";

export interface ToDo {
  filename: string | undefined;
  path: string;
  toDo: string;
  status?: string;
  position: { start: vscode.Position; end: vscode.Position };
  lastChanged: Date;
  notionId?: string;
}

export interface customProp {
  name?: string;
  property?: string;
}
