export function wrapContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function summarizeList<T extends { [key: string]: unknown }>(
  items: T[],
  limit = 10,
) {
  const truncated = items.slice(0, limit);
  const meta =
    items.length > limit
      ? { note: `Showing ${limit} of ${items.length} items.` }
      : undefined;
  return meta ? { items: truncated, ...meta } : { items: truncated };
}
