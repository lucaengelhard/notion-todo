import * as vscode from "vscode";
import "dotenv/config";

import { ToDo } from "./types";

import {
  getFilePath,
  getNotionIdFromUrl,
  getWorkspaceFiles,
  regExFindTodo,
  regExNotionLink,
  sanitizeIdString,
  sanitizeToDoString,
  sanitizeUrlString,
} from "./helpers";
import {
  createNotionTodo,
  getNotionToDos,
  notionToDoToCompleted,
  upDateNotionToDo,
} from "./notion";

export var workspaceFiles: vscode.Uri[] = [];
export var toDoStore: Map<string, ToDo> = new Map();
export var notionToDoStore: Map<string, ToDo> = new Map();

var extensionIsSaving = false;

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  console.log("notion-todo is now active!");

  await initialLoad();
  /*
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
  });*/
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function initialLoad() {
  workspaceFiles = await getWorkspaceFiles();
  notionToDoStore = await getNotionToDos();
  toDoStore = await getToDos();

  notionToDoStore.forEach(async (toDo, id) => {
    await notionToDoToCompleted(id, toDo);
  });

  console.log({ local: toDoStore, notion: notionToDoStore });

  //vscode.window.showInformationMessage("Initial load of notion todos done");
}

async function getToDos() {
  for (let i = 0; i < workspaceFiles.length; i++) {
    await parseFile(workspaceFiles[i]);
  }

  return toDoStore;
}

async function parseFile(fileUri: vscode.Uri) {
  const file = await vscode.workspace.openTextDocument(fileUri);
  const fileName = fileUri.path.split("/").pop();
  const filePath = getFilePath(fileUri);
  const lastChanged = new Date((await vscode.workspace.fs.stat(fileUri)).mtime);
  const text = file.getText();

  let match;
  while ((match = regExFindTodo.exec(text))) {
    const localToDo: ToDo = {
      toDo: sanitizeToDoString(match[0]),
      position: {
        start: file.positionAt(match.index),
        end: file.positionAt(match.index + match[0].length),
      },
      filename: fileName,
      path: filePath,
      lastChanged: lastChanged,
    };

    //Check if there is a notion url attached to the comment
    const notionUrlMatches = regExNotionLink.exec(match[0]);

    //If there is a notionUrl attached, check in the notionStore if the todo was completed
    if (notionUrlMatches) {
      localToDo.notionUrl = sanitizeUrlString(notionUrlMatches[0]);

      const id = getNotionIdFromUrl(localToDo.notionUrl);
      const notionToDo = notionToDoStore.get(id);

      if (!notionToDo) {
        //TODO: create notion todo and update id in both stores
      }

      console.log(notionToDo?.status);

      if (notionToDo && notionToDo.status === "Completed") {
        localToDo.status = "Completed";
        await modifyComment(localToDo);
        toDoStore.delete(id);
        continue;
      }

      if (notionToDo) {
        const mergedToDo = await mergeToDos(localToDo, notionToDo, id);
        toDoStore.set(id, mergedToDo);
      } else {
        toDoStore.set(id, localToDo);
      }
    } else {
      const res: any = await createNotionTodo(localToDo);

      const id = sanitizeIdString(res.id);
      localToDo.notionUrl = sanitizeUrlString(res.url);

      toDoStore.set(id, localToDo);
      notionToDoStore.set(id, localToDo);
      await modifyComment(localToDo);
    }
  }
}

async function mergeToDos(toDo: ToDo, notionToDo: ToDo, id: string) {
  let mergedToDo: ToDo;
  if (notionToDo.lastChanged > toDo.lastChanged) {
    console.log(`Notion Todo "${toDo.toDo}" is newer`);
    toDoStore.set(id, notionToDo);

    mergedToDo = notionToDo;
  } else {
    console.log(`VS Code Todo "${toDo.toDo}" is newer`);
    upDateNotionToDo(toDo, id);
    notionToDoStore.set(id, toDo);
    mergedToDo = toDo;
  }

  await modifyComment(mergedToDo);

  return mergedToDo;
}

async function modifyComment(toDo: ToDo) {
  const commentstart = "//";

  if (!vscode.workspace.workspaceFolders) {
    throw new Error("No Workspace Folders Open");
  }

  let replacementString = `${commentstart}TODO: ${toDo.toDo} (${toDo.notionUrl})`;

  const endPosition = new vscode.Position(
    toDo.position.end.line,
    replacementString.length
  );

  const startPositon = new vscode.Position(
    toDo.position.start.line,
    toDo.position.start.character
  );

  if (toDo.status === "Completed") {
    replacementString = " ";
  }

  const range = new vscode.Range(startPositon, endPosition);
  const edit = new vscode.WorkspaceEdit();

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
