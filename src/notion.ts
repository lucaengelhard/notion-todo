import { ToDo } from "./types";
import {
  customMultiSelect,
  customSelect,
  dbKey,
  notion,
  rootFolder,
} from "./config";
import { toDoStore, notionToDoStore } from "./extension";
import { sanitizeIdString } from "./helpers";

export async function upDateNotionToDo(toDo: ToDo, id: string) {
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

  return response;
}

export async function notionToDoToCompleted(id: string, toDo: ToDo) {
  if (toDo.status === "Completed") {
    notionToDoStore.delete(id);
    return;
  }

  const localToDo = toDoStore.get(id);

  if (!localToDo) {
    console.log(
      `${toDo.toDo} (${toDo.path}) has no local comment -> moving to completed`
    );

    const res = await notion.pages.update({
      page_id: id,
      properties: {
        Status: {
          select: {
            name: "Completed",
          },
        },
      },
    });

    notionToDoStore.delete(id);

    return res;
  }
}

export async function createNotionTodo(toDo: ToDo) {
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

export async function getNotionToDos(): Promise<Map<string, ToDo>> {
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
      ],
    },
  });

  res.results.forEach(async (element: any) => {
    const toDo: ToDo = {
      toDo: element.properties.Name.title[0].plain_text,
      filename: element.properties["File Name"].rich_text[0].plain_text,
      path: element.properties["File Path"].rich_text[0].plain_text,
      status: element.properties.Status.select.name,
      position: JSON.parse(element.properties.Position.rich_text[0].plain_text),
      lastChanged: new Date(element.last_edited_time),
      notionUrl: element.url,
    };

    notionToDoStore.set(sanitizeIdString(element.id), toDo);
    //await notionToDoToCompleted(sanitizeIdString(element.id), toDo);
  });

  return notionToDoStore;
}
