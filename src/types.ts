import * as vscode from "vscode";

export type Status = "No Status" | "Not Started" | "In Progress" | "Completed";

export type ToDo = {
  filename: string | undefined;
  path: string;
  toDo: string;
  status?: Status;
  position: { start: vscode.Position; end: vscode.Position };
  lastChanged: Date;
  notionUrl?: string;
};

export type customProp = {
  name?: string;
  property?: string;
};
