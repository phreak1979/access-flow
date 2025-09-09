// Simple helpers for client-only JSON edit flows

export async function readJsonFile<T = unknown>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
