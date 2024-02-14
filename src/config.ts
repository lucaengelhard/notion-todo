import { Client } from "@notionhq/client";
import * as vscode from "vscode";
import { customProp } from "./types";

export const notion = new Client({
  auth: vscode.workspace.getConfiguration("vscodeNotion.notion").get("apiKey"),
});

export const dbKey: string | undefined = vscode.workspace
  .getConfiguration("vscodeNotion.notion")
  .get("dbKey");

export const rootFolder = vscode.workspace.workspaceFolders
  ? vscode.workspace.workspaceFolders[0]
  : undefined;

export const customMultiSelect: customProp = {
  name: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Multi-Select Name"),
  property: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Multi-Select Property"),
};

export const customSelect: customProp = {
  name: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Select Name"),
  property: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Select Property"),
};
