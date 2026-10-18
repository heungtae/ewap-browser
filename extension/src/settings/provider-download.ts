export const downloadProviderExport = (
  response: Record<string, unknown>,
  id?: string,
): void => {
  const exported = response.export as {
    schema_version: number;
    providers: Record<string, unknown>;
  };
  if (id && !Object.hasOwn(exported.providers, id))
    throw new Error("먼저 Provider를 저장하세요.");
  const content = id
    ? {
        schema_version: exported.schema_version,
        providers: { [id]: exported.providers[id] },
      }
    : exported;
  const blob = new Blob([JSON.stringify(content, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "contextpilot-provider-public.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
