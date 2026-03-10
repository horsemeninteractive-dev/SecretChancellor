import { DiscordSDK } from "@discord/embedded-app-sdk";

export let discordSdk: DiscordSDK | null = null;

export const setupDiscordSdk = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has("frame_id")) {
    console.warn("frame_id not found in URL, Discord SDK will not be initialized");
    return;
  }
  discordSdk = new DiscordSDK(process.env.DISCORD_CLIENT_ID || "");
  await discordSdk.ready();
  console.log("Discord SDK is ready");
};
