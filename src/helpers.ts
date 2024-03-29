import * as vscode from "vscode";
import { rootFolder } from "./config";
import path from "path";

export const regExFindTodo = /\/\/\s*TODO:.*|\/\*\s*TODO:[\s\S]*?\*\//gm;
export const regExReplaceComments = /\/\/\s*TODO:|\/\*\s*TODO:/gm;
export const regExNotionLink = /\((.*?)\)[^()]*$/gm;
export const regExNotionId = /[^-]*$/gm;

export async function getWorkspaceFiles() {
  return await vscode.workspace.findFiles(
    "**/*.{ts,js}",
    "**/{node_modules,dist}/**"
  );
}

export function getToDoIdsInFile(text: string) {
  let ids: Set<string> = new Set();
  let match;
  while ((match = regExFindTodo.exec(text))) {
    const notionUrlMatches = /\((.*?)\)[^()]*$/gm.exec(match[0]);

    if (notionUrlMatches) {
      const id = getNotionIdFromUrl(notionUrlMatches[0]);
      ids.add(id);
    }
  }

  return ids;
}

export function sanitizeToDoString(string: string): string {
  return string
    .replace(regExReplaceComments, "")
    .replace("*/", "")
    .replace(regExNotionLink, "")
    .trim();
}

export function getFilePath(fileUri: vscode.Uri): string {
  let filePath = fileUri.path;

  if (rootFolder) {
    filePath = path.relative(rootFolder.uri.path, fileUri.path);
  }

  return filePath;
}

export function sanitizeIdString(string: string): string {
  return string
    .replaceAll("-", "")
    .replaceAll("'", "")
    .replaceAll(")", "")
    .replaceAll("(", "");
}

export function sanitizeUrlString(string: string): string {
  return string.replaceAll("(", "").replaceAll(")", "");
}

export function getNotionIdFromUrl(url: string): string {
  const notionIdMatches = url.match(regExNotionId);

  if (!notionIdMatches) {
    return "no id defined";
  } else {
    return sanitizeIdString(notionIdMatches[0]);
  }
}
