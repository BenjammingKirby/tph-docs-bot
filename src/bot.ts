import "dotenv/config";
import {
    Client,
    Collection,
    type Interaction,
    LimitedCollection,
    type Message,
    IntentsBitField,
    Partials,
    ActivityType,
} from "discord.js";
import { MyContext } from "./interfaces";
import { loadCommands, interactionCreateHandler } from "./handlers/InteractionCreateHandler";
import { messageHandler } from "./handlers/MessageHandler";
import { deleteButtonHandler } from "./utils/CommandUtils";

(async function () {
    const context: MyContext = {
        client: new Client({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMessages,
                IntentsBitField.Flags.MessageContent,
            ],
            presence: {
                activities: [{ type: ActivityType.Playing, name: "Read the docs" }],
                status: "online",
            },
            // For DMs, a partial channel object is received, in order to receive dms, CHANNEL partials must be activated
            partials: [Partials.Channel],
            makeCache: (manager) => {
                //! Disabling these caches will break djs functionality
                const unsupportedCaches = [
                    "GuildManager",
                    "ChannelManager",
                    "GuildChannelManager",
                    "RoleManager",
                    "PermissionOverwriteManager",
                ];
                if (unsupportedCaches.includes(manager.name)) return new Collection();
                // Disable every supported cache
                return new LimitedCollection({ maxSize: 0 });
            },
            allowedMentions: { parse: ["users"] },
        }),
        commands: {
            autocompletes: new Collection(),
            buttons: new Collection(),
            selectMenus: new Collection(),
            slashCommands: new Collection(),
        },
        cooldownCounter: new Collection(),
    };
    const docsBot = context.client;
    await loadCommands(context);
    // Add delete button handler
    context.commands.buttons.set("deletebtn", { custom_id: "deletebtn", run: deleteButtonHandler });

    docsBot.on("error", console.error);
    docsBot.on("warn", console.warn);

    docsBot.once("ready", (client) => {
        console.info(`Logged in as ${client.user.tag} (${client.user.id})`);
    });

    docsBot.on("messageCreate", (message) => messageHandler(message as Message<true>));
    docsBot.on("interactionCreate", (interaction) =>
        interactionCreateHandler(context, interaction as Interaction<"cached">),
    );

    docsBot.login(process.env.TOKEN);
})();
