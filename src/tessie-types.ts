export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type QueryScalar = string | number | boolean;
export type QueryPayload = Record<string, QueryScalar | undefined>;
