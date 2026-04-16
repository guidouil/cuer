export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface Event {
  id: string;
  projectId: string;
  planId: string | null;
  taskId: string | null;
  type: string;
  payload: JsonValue;
  createdAt: string;
}
