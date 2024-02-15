// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import "dotenv/config";

import { ToDo, customProp } from "./types";
import path from "path";
import {
  customMultiSelect,
  customSelect,
  dbKey,
  notion,
  rootFolder,
} from "./config";

var toDoStore: Map<string, ToDo> = new Map();

var extensionIsSaving = false;

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  console.log("notion-todo is now active!");

  const initalWorkSpaceFiles = await getWorkSpaceFiles();

  for (let i = 0; i < initalWorkSpaceFiles.length; i++) {
    const file = initalWorkSpaceFiles[i];
    await getToDos(file);
  }

  const initialNotionToDos = await getNotionToDos();

  mergeToDos(initialNotionToDos);

  const interval = setInterval(async () => {
    vscode.window.showInformationMessage("Updating Notion ToDos (Interval)");

    const workspaceFiles = await getWorkSpaceFiles();
    for (let i = 0; i < workspaceFiles.length; i++) {
      const file = workspaceFiles[i];
      await getToDos(file);
    }
    const notionToDos = await getNotionToDos();
    mergeToDos(notionToDos);
  }, 300000);

  vscode.workspace.onDidSaveTextDocument(async (event) => {
    if (!extensionIsSaving) {
      console.log("Saved File -> Updating Notion ToDos");
      await updateTodos(event.uri);
    } else {
      console.log("extension is currently saving");
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function getToDos(fileUri: vscode.Uri) {
  //const file = await vscode.workspace.fs.readFile(fileUri);
  const file = await vscode.workspace.openTextDocument(fileUri);
  const lastChanged = new Date((await vscode.workspace.fs.stat(fileUri)).mtime);

  const regExFindTodo = /\/\/\s*TODO:.*|\/\*\s*TODO:[\s\S]*?\*\//gm;
  const regExReplaceComments = /\/\/\s*TODO:|\/\*\s*TODO:/gm;
  const regExNotionLink = /\((.*?)\)[^()]*$/gm;
  const regExNotionId = /[^-]*$/gm;

  const text = file.getText();

  let match;

  while ((match = regExFindTodo.exec(text))) {
    const startPos = file.positionAt(match.index);
    const endPos = file.positionAt(match.index + match[0].length);

    const sanitizedToDO = match[0]
      .replace(regExReplaceComments, "")
      .replace("*/", "")
      .replace(regExNotionLink, "")
      .trim();

    const fileName = fileUri.path.split("/").pop();

    let filePath = fileUri.path;

    if (rootFolder) {
      filePath = path.relative(rootFolder.uri.path, fileUri.path);
    }

    const notionUrlMatches = regExNotionLink.exec(match[0]);

    let notionId: string;
    let notionUrl: string;

    if (!notionUrlMatches) {
      const notionToDo: ToDo = {
        filename: fileName,
        path: filePath,
        toDo: sanitizedToDO,
        position: { start: startPos, end: endPos },
        lastChanged: lastChanged,
      };
      const res: any = await createNotionTodo(notionToDo);

      notionId = res.id.replaceAll("-", "");
      notionUrl = res.url;
    } else {
      notionUrl = notionUrlMatches[1];

      const notionIdMatches = notionUrl.match(regExNotionId);

      if (!notionIdMatches) {
        notionId = "no id defined";
      } else {
        notionId = notionIdMatches[0].replace("'", "").replaceAll("-", "");
      }
    }

    toDoStore.set(notionId.replaceAll("-", ""), {
      filename: fileName,
      path: filePath,
      toDo: sanitizedToDO,
      position: { start: startPos, end: endPos },
      lastChanged: lastChanged,
      notionUrl: notionUrl,
    });
  }
}

async function getNotionToDos(): Promise<Map<string, ToDo>> {
  let notionToDos: Map<string, ToDo> = new Map();

  if (!dbKey) {
    throw new Error("no Notion Database Id given");
  }

  const res = await notion.databases.query({
    database_id: dbKey,
    filter: {
      and: [
        {
          property: "VS Code Todo",
          checkbox: {
            equals: true,
          },
        },
        {
          property: "Tags",
          multi_select: {
            contains: rootFolder ? rootFolder.name : "vscode",
          },
        },
        {
          property: "Status",
          select: {
            does_not_equal: "Completed",
          },
        },
      ],
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
      notionUrl: element.url,
    };

    notionToDos.set(element.id.replaceAll("-", ""), toDo);
  });

  await notionToDosToCompleted(notionToDos);

  return notionToDos;
}

async function mergeToDos(notionToDos: Map<string, ToDo>) {
  toDoStore.forEach((toDo, localId) => {
    const id = localId.replaceAll("-", "");

    const notionToDo = notionToDos.get(id);

    if (notionToDo) {
      if (notionToDo.lastChanged > toDo.lastChanged) {
        console.log(`Notion Todo "${toDo.toDo}" is newer`);
        toDoStore.set(id, notionToDo);
      }

      if (notionToDo.lastChanged <= toDo.lastChanged) {
        console.log(`VS Code Todo "${toDo.toDo}" is newer`);
        upDateNotionToDo(toDo, id);
      }
    } else {
      console.log(`${toDo.toDo} (${toDo.path}) is not intersecting`);
      //createNotionTodo(toDo);
    }
  });
  await modifyComments();
  vscode.window.showInformationMessage("Updating Notion ToDos done");
}

async function upDateNotionToDo(toDo: ToDo, id: string) {
  const response = await notion.pages.update({
    page_id: id,
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
      "VS Code Todo": {
        checkbox: true,
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

async function notionToDosToCompleted(notionToDos: Map<string, ToDo>) {
  notionToDos.forEach(async (toDo, key, map) => {
    const localToDo = toDoStore.get(key);

    if (!localToDo) {
      console.log(
        `${toDo.toDo} (${toDo.path}) has no local comment -> moving to completed`
      );

      notionToDos.delete(key);

      const res = await notion.pages.update({
        page_id: key,
        properties: {
          Status: {
            select: {
              name: "Completed",
            },
          },
        },
      });
    }
  });
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
      "VS Code Todo": {
        checkbox: true,
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

  return response;
}

async function modifyComments() {
  const commentstart = "//";
  const iterator = toDoStore.entries();

  for (let i = 0; i < toDoStore.size; i++) {
    if (!vscode.workspace.workspaceFolders) {
      throw new Error("No Workspace Folders Open");
    }

    const toDo: ToDo = iterator.next().value[1];

    const replacementString =
      commentstart + `TODO: ${toDo.toDo} (${toDo.notionUrl})`;

    //console.log({ [toDo.path]: toDo.position.start.line });

    const startPositon = new vscode.Position(
      toDo.position.start.line,
      toDo.position.start.character
    );

    //console.log({ start: startPositon });

    const endPosition = new vscode.Position(
      toDo.position.end.line,
      replacementString.length
    );

    //console.log({ end: endPosition });

    const range = new vscode.Range(startPositon, endPosition);
    const edit = new vscode.WorkspaceEdit();

    //console.log(range.start.line);
    //console.log(range);

    edit.replace(
      vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, toDo.path),
      range,
      replacementString
    );

    const edited = await vscode.workspace.applyEdit(edit);
    if (edited) {
      extensionIsSaving = true;
      const saved = await vscode.workspace.save(
        vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, toDo.path)
      );
      console.log(`${saved} saved`);

      extensionIsSaving = false;
    }
  }
}

async function getWorkSpaceFiles() {
  return await vscode.workspace.findFiles(
    "**/*.{ts,js}",
    "**/{node_modules,dist}/**"
  );
}

async function updateTodos(uri: vscode.Uri) {
  vscode.window.showInformationMessage(
    `Updating Notion ToDos\n(${uri.path.split("/").pop()})`
  );
  const fileToDos = await getToDos(uri);
  const notionToDos = await getNotionToDos();
  mergeToDos(notionToDos);
}
