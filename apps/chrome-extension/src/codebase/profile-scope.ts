export function pairedCodebaseProfile(
  installationId: string,
  profileId: string,
) {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(installationId) || !uuid.test(profileId))
    throw Error("MANAGEMENT_PROFILE");
  return JSON.stringify([installationId, profileId]);
}
