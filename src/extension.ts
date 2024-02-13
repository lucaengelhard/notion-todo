// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import "dotenv/config";
import { Client } from "@notionhq/client";
import { ToDo, customProp } from "./types";
import path from "path";

var toDoStore: ToDo[] = [];
const notion = new Client({
  auth: vscode.workspace.getConfiguration("vscodeNotion.notion").get("apiKey"),
});
const dbKey: string | undefined = vscode.workspace
  .getConfiguration("vscodeNotion.notion")
  .get("dbKey");

const rootFolder = vscode.workspace.workspaceFolders
  ? vscode.workspace.workspaceFolders[0]
  : undefined;

const customMultiSelect: customProp = {
  name: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Multi-Select Name"),
  property: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Multi-Select Property"),
};

const customSelect: customProp = {
  name: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Select Name"),
  property: vscode.workspace
    .getConfiguration("vscodeNotion.notion.additionalProps")
    .get("Custom Select Property"),
};

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  console.log("notion-todo is now active!");
  console.log(customMultiSelect);
  console.log(customSelect);

  const workspaceFiles = await vscode.workspace.findFiles(
    "**/*.{ts,js}",
    "**/{node_modules,dist}/**"
  );

  for (let i = 0; i < workspaceFiles.length; i++) {
    const file = workspaceFiles[i];
    await getToDos(file);
  }

  const notionToDos = await getNotionToDos();

  mergeToDos(notionToDos);

  context.subscriptions.push();
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function getToDos(fileUri: vscode.Uri) {
  //const file = await vscode.workspace.fs.readFile(fileUri);
  const file = await vscode.workspace.openTextDocument(fileUri);
  const lastChanged = new Date((await vscode.workspace.fs.stat(fileUri)).mtime);

  const regex = /\/\/\s*TODO:.*|\/\*\s*TODO:[\s\S]*?\*\//gm;

  const text = file.getText();

  let match;

  while ((match = regex.exec(text))) {
    const startPos = file.positionAt(match.index);
    const endPos = file.positionAt(match.index + match[0].length);

    const sanitizedToDO = match[0]
      .replace(/\/\/\s*TODO:|\/\*\s*TODO:/gm, "")
      .replace("*/", "")
      .trim();

    const fileName = fileUri.path.split("/").pop();

    let filePath = fileUri.path;

    if (rootFolder) {
      filePath = path.relative(rootFolder.uri.path, fileUri.path);
    }

    toDoStore.push({
      filename: fileName,
      path: filePath,
      toDo: sanitizedToDO,
      position: { start: startPos, end: endPos },
      lastChanged: lastChanged,
    });
  }
}

async function getNotionToDos(): Promise<ToDo[]> {
  let notionToDos: ToDo[] = [];

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
    const toDo: ToDo = {
      toDo: element.properties.Name.title[0].plain_text,
      filename: element.properties["File Name"].rich_text[0].plain_text,
      path: element.properties["File Path"].rich_text[0].plain_text,
      status: element.properties.Status.select.name,
      position: JSON.parse(element.properties.Position.rich_text[0].plain_text),
      lastChanged: new Date(element.last_edited_time),
      notionId: element.id,
    };

    notionToDos.push(toDo);
  });

  return notionToDos;
}

async function mergeToDos(notionToDos: ToDo[]) {
  for (let i = 0; i < 5 /*toDoStore.length*/; i++) {
    const toDo = toDoStore[i];
    let intersecting = false;

    for (let u = 0; u < notionToDos.length; u++) {
      const notionToDo = notionToDos[u];

      if (toDo.path === notionToDo.path) {
        if (
          toDo.position.start.line >= notionToDo.position.start.line &&
          toDo.position.start.line <= notionToDo.position.end.line
        ) {
          console.log(`${toDo.toDo} (${toDo.path}) is intersecting`);
          intersecting = true;

          if (toDo.lastChanged > notionToDo.lastChanged) {
            console.log(`VS Code Todo "${toDo.toDo}" is newer`);

            upDateNotionToDo(toDo, notionToDo);
          }
          if (toDo.lastChanged < notionToDo.lastChanged) {
            console.log(`Notion Todo "${toDo.toDo}" is newer`);

            toDoStore[i] = notionToDo;
          }
        }
      }
    }

    if (!intersecting) {
      console.log(`${toDo.toDo} (${toDo.path}) is not intersecting`);
      createNotionTodo(toDo);
    }
  }
}

async function upDateNotionToDo(toDo: ToDo, notionToDo: ToDo) {
  if (!notionToDo.notionId) {
    return;
  }

  const response = await notion.pages.update({
    page_id: notionToDo.notionId,
    properties: {
      Name: {
        title: [
          {
            text: {
              content: toDo.toDo,
            },
          },
        ],
      },
      Tags: {
        multi_select: [{ name: rootFolder ? rootFolder.name : "vscode" }],
      },
      ...(customSelect.name
        ? {
            [customSelect.name]: {
              select: {
                name: customSelect.property ? customSelect.property : "",
              },
            },
          }
        : {}),
      ...(customMultiSelect.name
        ? {
            [customMultiSelect.name]: {
              multi_select: [
                {
                  name: customMultiSelect.property
                    ? customMultiSelect.property
                    : "",
                },
              ],
            },
          }
        : {}),
    },
  });

  console.log("updated Notion");
}

async function createNotionTodo(toDo: ToDo) {
  if (!dbKey) {
    throw new Error("no Notion Database Id given");
  }

  const response = await notion.pages.create({
    parent: {
      type: "database_id",
      database_id: dbKey,
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: toDo.toDo,
            },
          },
        ],
      },
      "File Name": {
        rich_text: [
          {
            text: {
              content: toDo.filename ? toDo.filename : "",
            },
          },
        ],
      },
      "File Path": {
        rich_text: [
          {
            text: {
              content: toDo.path ? toDo.path : "",
            },
          },
        ],
      },
      Position: {
        rich_text: [
          {
            text: {
              content: JSON.stringify(toDo.position),
            },
          },
        ],
      },
      Status: {
        select: {
          name: "Not Started",
        },
      },
      Tags: {
        multi_select: [{ name: rootFolder ? rootFolder.name : "vscode" }],
      },
      ...(customSelect.name
        ? {
            [customSelect.name]: {
              select: {
                name: customSelect.property ? customSelect.property : "",
              },
            },
          }
        : {}),
      ...(customMultiSelect.name
        ? {
            [customMultiSelect.name]: {
              multi_select: [
                {
                  name: customMultiSelect.property
                    ? customMultiSelect.property
                    : "",
                },
              ],
            },
          }
        : {}),
    },
  });

  console.log("Notion ToDo created");
}
