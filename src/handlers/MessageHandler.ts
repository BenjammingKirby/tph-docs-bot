import { EmbedBuilder, codeBlock } from "discord.js";
import type { Message } from "discord.js";
import { intervalToDuration, intervalObjToStr } from "../utils/DateUtils";

export async function messageHandler(message: Message<true>) {
    try {
        const clientUser = message.client.user!;
        // The regex for the bot's mention
        const mentionRegex = new RegExp(`^<@!?${clientUser.id}>$`);

        if (message.content.trim().match(mentionRegex)) {
            const pkgJSONPath = "../../package.json";
            const pkgJSON = await import(pkgJSONPath);
            const { version, description, dependencies } = pkgJSON;

            const uptime = intervalToDuration(Date.now() - (message.client.uptime ?? 0), Date.now());
            const statusEmbed = new EmbedBuilder()
                .setTitle(`${clientUser.username} (v${version})`)
                .setURL("https://github.com/the-programmers-hangout/tph-docs-bot/")
                .setColor(0xd250c7)
                .setDescription(description)
                .setThumbnail(clientUser.displayAvatarURL({ extension: "png", size: 256 }))
                .addFields(
                    {
                        name: "Currently Supported Docs",
                        value: ["discord.js", "Javascript (mdn)"].map((str) => `\`${str}\``).join(", "),
                    },

                    {
                        name: "Dependencies",
                        value: codeBlock("json", JSON.stringify(dependencies, undefined, 4)),
                    },
                    { name: "Uptime", value: `${intervalObjToStr(uptime)}` || "Just turned on" },
                    { name: "Ping", value: message.client.ws.ping + "ms", inline: true },
                    {
                        name: "Source",
                        value: "[Github](https://github.com/the-programmers-hangout/tph-docs-bot/)",
                        inline: true,
                    },
                    {
                        name: "Contributors",
                        value: "[Link](https://github.com/the-programmers-hangout/tph-docs-bot/graphs/contributors)",
                        inline: true,
                    },
                );

            await message.reply({ embeds: [statusEmbed] });
        }
    } catch (e) {
        console.error(e);
    }

    return;
}
