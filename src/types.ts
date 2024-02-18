import * as vscode from "vscode";
import { Status } from "./enums";

export interface ToDo {
  filename: string | undefined;
  path: string;
  toDo: string;
  status?: Status;
  position: { start: vscode.Position; end: vscode.Position };
  lastChanged: Date;
  notionUrl?: string;
}

export interface customProp {
  name?: string;
  property?: string;
}
