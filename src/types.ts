import * as vscode from "vscode";

export interface ToDo {
  filename: string | undefined;
  path: string;
  toDo: string;
  status?: string;
  position: { start: vscode.Position; end: vscode.Position };
  lastChanged: Date;
  notionUrl?: string;
}

export interface customProp {
  name?: string;
  property?: string;
}
