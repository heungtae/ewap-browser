import { fail } from "../security/validation.js";
import type { ProviderMessage, WireApi } from "./types.js";
export const providerImageContent = (
  message: ProviderMessage,
  wire: WireApi,
): unknown => {
  if (!message.image_data_urls?.length) return message.content;
  if (message.role !== "user" || message.image_data_urls.length > 1)
    return fail("INVALID_ARGUMENT");
  const images = message.image_data_urls.map((url) => {
    if (
      url.length > 1_900_000 ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(url)
    )
      return fail("INVALID_ARGUMENT");
    return wire === "responses"
      ? { type: "input_image", image_url: url }
      : { type: "image_url", image_url: { url } };
  });
  return [
    {
      type: wire === "responses" ? "input_text" : "text",
      text: message.content,
    },
    ...images,
  ];
};
