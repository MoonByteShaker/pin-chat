import type { PluginServerContext } from "@getpaseo/plugin/server";
import { pinChatSettings } from "./shared/pins";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(pinChatSettings);
  return () => {};
}
