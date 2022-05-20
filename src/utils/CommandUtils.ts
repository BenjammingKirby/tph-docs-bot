import { Permissions, Formatters, MessageButton, Client } from "discord.js";
import type { CommandInteraction, Snowflake, ButtonInteraction } from "discord.js";
import type { Command, MyContext } from "../interfaces";

export const deleteButton = (initiatorId: Snowflake, messageId: Snowflake) =>
    new MessageButton()
        .setCustomId("deletebtn/" + initiatorId + "/" + messageId)
        .setEmoji("🗑")
        .setStyle("SECONDARY");

export const deleteButtonHandler = async (interaction: ButtonInteraction<"cached">) => {
    const buttonIdSplit = interaction.customId.split("/");
    const commandInitiatorId = buttonIdSplit[1];
    interaction.customId.replace("deletebtn/", "");
    const replyMessageId = buttonIdSplit[2];
    // If the button clicker is the command initiator
    if (interaction.user.id === commandInitiatorId) {
        await interaction.channel?.messages.delete(replyMessageId).catch(console.error);
        await interaction.update({ components: [] }).catch(console.error);
        // (interaction.message as Message).delete().catch(console.error);
    } else
        await interaction
            .reply({
                content: "Only the command initiator is allowed to delete this message",
                ephemeral: true,
            })
            .catch(console.error);
};
/**
 * Checks if the bot or a user has the needed permissions to run a command
 * @param interaction
 * @param command
 * @returns Whether to cancel the command
 */
// * Note that as of writing, slash commands can override permissions
export function commandPermissionCheck(interaction: CommandInteraction, command: Command["slashCommand"]): boolean {
    if (!command) return true;

    const { user } = interaction;
    // If the channel is a dm
    // if it's a partial, channel.type wouldn't exist
    if (!interaction.inGuild() || !interaction.channel) {
        if (command.guildOnly) {
            interaction.editReply("This is a guild exclusive command, not to be executed in a dm").catch(console.error);
            // For guild only commands that were executed in a dm, cancel the command
            return true;
        }
        // If it's not a guild only command, since permissions aren't a thing on dms, allow execution
        return false;
    }
    if (command.botPermissions) {
        const botPermissions = new Permissions(command.botPermissions);
        // The required permissions for the bot to run the command, missing in the channel.
        const missingPermissions =
            interaction.channel.permissionsFor((interaction.client as Client<true>).user)?.missing(botPermissions) ??
            [];

        if (missingPermissions.length > 0) {
            interaction
                .editReply(
                    `In order to run this command, I need the following permissions: ${missingPermissions
                        .map((perm) => `\`${perm}\``)
                        .join(", ")}`,
                )
                .catch(console.error);
            return true;
        }
    }
    if (command.authorPermissions) {
        const authorPermissions = new Permissions(command.authorPermissions);
        // The required permissions for the user to run the command, missing in the channel.
        const missingPermissions = interaction.channel.permissionsFor(user.id)?.missing(authorPermissions) ?? [];
        if (missingPermissions.length > 0) {
            interaction
                .editReply(
                    `In order to run this command, you need: ${missingPermissions
                        .map((perm) => `\`${perm}\``)
                        .join(", ")}`,
                )
                .catch(console.error);
            return true;
        }
    }
    // By default, allow execution;
    return false;
}
export function commandCooldownCheck(
    interaction: CommandInteraction,
    command: Command["slashCommand"],
    context: MyContext,
): boolean {
    const { user } = interaction;
    if (command?.cooldown) {
        const id = user.id + "/" + interaction.commandName;
        const existingCooldown = context.cooldownCounter.get(id);
        if (existingCooldown) {
            if (Date.now() >= existingCooldown) {
                context.cooldownCounter.delete(id);
                return false;
            }
            interaction
                .editReply(
                    //TODO revert to using custom logic to send remaining time as the discord timestamp formatting isn't very descriptive
                    `Please wait ${Formatters.time(existingCooldown, "R")} before using the command again`,
                )
                .catch(console.error);
            return true;
        }
        context.cooldownCounter.set(user.id + "/" + interaction.commandName, Date.now() + command.cooldown);
    }
    return false;
}
