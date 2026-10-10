export type VisionPermissions = {
  contains(options: { origins: string[] }): Promise<boolean>;
  request(options: { origins: string[] }): Promise<boolean>;
};
export const requestVisionPermission = async (
  permissions?: VisionPermissions,
): Promise<boolean> => {
  if (!permissions) return false;
  const origins = ["<all_urls>"];
  try {
    if (await permissions.contains({ origins })) return true;
    return await permissions.request({ origins });
  } catch {
    return false;
  }
};
