import { commandCooldownCheck, commandPermissionCheck } from "../utils/CommandUtils";
import glob from "fast-glob";
import type { Command, MyContext } from "../interfaces";
import type {
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Interaction,
    SelectMenuInteraction,
} from "discord.js";

export async function interactionCreateHandler(context: MyContext, interaction: Interaction<"cached">) {
    try {
        if (interaction.isChatInputCommand()) {
            await commandInteractionHandler(context, interaction);
        } else if (interaction.isButton()) {
            await buttonInteractionHandler(context, interaction);
        } else if (interaction.isStringSelectMenu()) {
            await selectMenuInteractionHandler(context, interaction);
        } else if (interaction.isAutocomplete()) {
            await autocompleteInteractionHandler(context, interaction);
        }
    } catch (e) {
        console.error(e);
    }
}
/**
 * Locally loads the commands to the context for further use
 * @param context
 * @returns
 */
export async function loadCommands(context: MyContext) {
    // Find all js files
    const files = await glob(`${__dirname}/../commands/**/*.js`.replace(/\\/g, "/"));
    await Promise.all(
        files.map(async (file) => {
            const { default: myCommandFile }: { default: Command } = await import(file).catch((err) => {
                console.error(err);
                // Since the return value gets destructured, an empty object is returned
                return {};
            });
            if (!myCommandFile) return;
            const { autocomplete, buttons, selectMenus, slashCommand } = myCommandFile;
            autocomplete?.forEach((autocom) =>
                context.commands.autocompletes.set(
                    myCommandFile.slashCommand?.data.name + "/" + autocom.focusedOption,
                    autocom,
                ),
            );
            buttons?.forEach((button) => context.commands.buttons.set(button.custom_id, button));
            selectMenus?.forEach((selectMenu) => context.commands.selectMenus.set(selectMenu.custom_id, selectMenu));
            slashCommand && context.commands.slashCommands.set(slashCommand.data.name, slashCommand);
        }),
    );
    return undefined;
}
async function commandInteractionHandler(context: MyContext, interaction: ChatInputCommandInteraction<"cached">) {
    await interaction.deferReply({ ephemeral: true }).catch(console.error);
    const command = context.commands.slashCommands.get(interaction.commandName);
    if (!command) return interaction.editReply({ content: "Command not found" }).catch(console.error);

    if (commandPermissionCheck(interaction, command)) return;
    if (commandCooldownCheck(interaction, command, context)) return;
    try {
        await command.run(interaction, context);
    } catch (e) {
        console.error(e);
        const errorMessage = "An error has occurred";
        await interaction[interaction.replied ? "editReply" : "reply"]?.({
            content: errorMessage,
        }).catch(console.error);
    }
}
async function buttonInteractionHandler(context: MyContext, interaction: ButtonInteraction<"cached">) {
    const buttonId = interaction.customId.split("/")[0];
    const button = context.commands.buttons.get(buttonId);
    if (button) {
        await button.run(interaction, context).catch(console.error);
        return;
    }
    await interaction[interaction.replied ? "editReply" : "reply"]?.({
        content: "Unknown Button",
        ephemeral: true,
    }).catch(console.error);
}
async function selectMenuInteractionHandler(context: MyContext, interaction: SelectMenuInteraction<"cached">) {
    await interaction.deferUpdate().catch(console.error);

    const menuId = interaction.customId.split("/")[0];
    const menu = context.commands.selectMenus.get(menuId);
    if (menu) {
        await menu.run(interaction, context).catch(console.error);
        return;
    }
    await interaction[interaction.replied ? "editReply" : "reply"]?.({
        content: "Unknown menu",
        ephemeral: true,
    }).catch(console.error);
}

async function autocompleteInteractionHandler(context: MyContext, interaction: AutocompleteInteraction<"cached">) {
    const focusedOption = interaction.options.getFocused(true);
    const autocom = context.commands.autocompletes.get(interaction.commandName + "/" + focusedOption.name);
    if (autocom) await autocom.run(interaction, focusedOption, context).catch(console.error);
}
