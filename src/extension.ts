// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("notion-todo is now active!");

  const currentDocLang = vscode.window.activeTextEditor?.document.languageId;

  const workspaceFiles = await vscode.workspace.findFiles(
    "**/*.{ts,js}",
    "**/{node_modules,dist}/**"
  );

  workspaceFiles.forEach(async (file) => {
    await getToDos(file);
  });

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
    console.log(toDo);
  });
}
