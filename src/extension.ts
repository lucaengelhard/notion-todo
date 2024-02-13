// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import "dotenv/config";
import { Client } from "@notionhq/client";
import { ToDo } from "./types";

var toDoStore: ToDo[] = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("notion-todo is now active!");

  const workspaceFiles = await vscode.workspace.findFiles(
    "**/*.{ts,js}",
    "**/{node_modules,dist}/**"
  );

  workspaceFiles.forEach(async (file) => {
    await getToDos(file);
  });

  await getNotionToDos();

  context.subscriptions.push();
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function getToDos(fileUri: vscode.Uri) {
  //const file = await vscode.workspace.fs.readFile(fileUri);
  const file = await vscode.workspace.openTextDocument(fileUri);

  const regex = /\/\/\s*TODO:.*|\/\*\s*TODO:[\s\S]*?\*\//gm;
  const toDos = file.getText().match(regex);

  if (!toDos) {
    return;
  }

  toDos.forEach((toDo) => {
    const sanitizedToDO = toDo
      .replace(/\/\/\s*TODO:|\/\*\s*TODO:/gm, "")
      .replace("*/", "")
      .trim();

    const fileName = fileUri.path.split("/").pop();

    toDoStore.push({
      filename: fileName,
      path: fileUri.path,
      toDo: sanitizedToDO,
    });
  });
}

async function getNotionToDos() {
  const notion = new Client({
    auth: vscode.workspace
      .getConfiguration("vscodeNotion.notion")
      .get("apiKey"),
  });

  const dbKey: string | undefined = vscode.workspace
    .getConfiguration("vscodeNotion.notion")
    .get("dbKey");

  if (!dbKey) {
    throw new Error("no Notion Database Id given");
  }

  const res = await notion.databases.query({
    database_id: dbKey,
    filter: {
      property: "VS Code Todo",
      checkbox: {
        equals: true,
      },
    },
  });

  res.results.forEach((element: any) => {
    console.log(element.properties);

    const toDo: ToDo = {
      toDo: element.properties.Name.title[0].plain_text,
      filename: element.properties["File Name"].rich_text[0].plain_text,
      path: element.properties["File Path"].rich_text[0].plain_text,
      status: element.properties.Status.select.name,
      lines: element.properties.Line.number,
    };

    console.log(toDo);
  });
}
