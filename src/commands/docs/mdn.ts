import { SlashCommandBuilder } from "@discordjs/builders";
import { deleteButton } from "../../utils/CommandUtils";
import { MessageActionRow, MessageEmbed, MessageSelectMenu } from "discord.js";
import { gunzipSync } from "zlib";
import { XMLParser } from "fast-xml-parser";
import { Command, MdnDoc } from "../../interfaces";
import { request } from "undici";
import flexsearch from "flexsearch";

interface SitemapEntry<T extends string | number> {
    loc: string;
    lastmod: T;
}
type Sitemap<T extends string | number> = SitemapEntry<T>[];

let sources = {
    index: null as unknown as flexsearch.Index,
    sitemap: null as unknown as Sitemap<number>,
    lastUpdated: null as unknown as number,
};

const MDN_BASE_URL = "https://developer.mozilla.org/en-US/docs/" as const;
const MDN_ICON_URL = "https://i.imgur.com/1P4wotC.png" as const;
const MDN_BLUE_COLOR = 0x83bfff as const;

const command: Command = {
    slashCommand: {
        data: new SlashCommandBuilder()
            .setName("mdn")
            .setDescription("Searches MDN documentation.")
            .addStringOption((opt) =>
                opt
                    .setName("query")
                    .setDescription("Enter the phrase you'd like to search for. Example: Array.filter")
                    .setRequired(true)
                    .setAutocomplete(true),
            )
            .addUserOption((option) =>
                option
                    .setName("target")
                    .setDescription("The user the documentation is intended to be sent for")
                    .setRequired(false),
            ),
        async run(interaction) {
            const query = interaction.options.getString("query")!;
            const target = interaction.options.getUser("target");

            const { index, sitemap } = await getSources();
            // Get the top 25 results
            const search: string[] = index.search(query, { limit: 25 }).map((id) => sitemap[<number>id].loc);
            const embed = new MessageEmbed()
                .setColor(MDN_BLUE_COLOR)
                .setAuthor({ name: "MDN Documentation", iconURL: MDN_ICON_URL })
                .setTitle(`Search for: ${query.slice(0, 243)}`);

            if (!search.length) {
                embed.setColor(0xff0000).setDescription("No results found...");
                await interaction.editReply({ embeds: [embed] }).catch(console.error);
                return;
            } else if (search.length === 1 || search.includes(query)) {
                // If there's an exact match
                const resultEmbed = await getSingleMDNSearchResults(search.includes(query) ? query : search[0]);
                if (!resultEmbed) {
                    await interaction.editReply({ content: "Couldn't find any results" }).catch(console.error);
                    return;
                }
                const sentMessage = await interaction.channel
                    ?.send({
                        content: `Sent by <@${interaction.user.id}> ${target ? `for <@${target.id}>` : ""}`,
                        embeds: [resultEmbed],
                    })
                    .catch(console.error);
                if (!sentMessage) {
                    await interaction.editReply("There was an error trying to send the message").catch(console.error);
                    return;
                }
                const deleteButtonRow = new MessageActionRow().addComponents([
                    deleteButton(interaction.user.id, sentMessage.id),
                ]);
                await interaction
                    .editReply({
                        content:
                            "Sent documentation for " + (query.length >= 100 ? query.slice(0, 100) + "..." : query),
                        components: [deleteButtonRow],
                    })
                    .catch(console.error);

                return;
            } else {
                // If there are multiple results, send a select menu from which the user can choose which one to send
                const selectMenuRow = new MessageActionRow().addComponents(
                    new MessageSelectMenu()
                        .setCustomId("mdnselect/" + interaction.user.id + (target ? "/" + target.id : ""))
                        .addOptions(
                            search.map((val) => {
                                const parsed = val.length >= 99 ? val.split("/").slice(-2).join("/") : val;
                                return { label: parsed, value: parsed };
                            }),
                        )
                        .setPlaceholder("Select documentation to send"),
                );
                await interaction
                    .editReply({
                        content: "Didn't find an exact match, please select one from below",
                        components: [selectMenuRow],
                    })
                    .catch(console.error);
                return;
            }
        },
    },
    selectMenus: [
        {
            custom_id: "mdnselect",
            async run(interaction) {
                const [, Initiator, target] = interaction.customId.split("/");
                const selectedValue = interaction.values[0];
                const resultEmbed = await getSingleMDNSearchResults(selectedValue);

                if (!resultEmbed) {
                    await interaction.editReply({ content: "Couldn't find any results" }).catch(console.error);
                    return;
                }

                // Send documentation
                const sentMessage = await interaction.channel
                    ?.send({
                        content: `Sent by <@${Initiator}> ${target ? `for <@${target}>` : ""}`,
                        embeds: [resultEmbed],
                    })
                    .catch(console.error);

                if (!sentMessage) {
                    await interaction.editReply("There was an error trying to send the message").catch(console.error);
                    return;
                }
                const deleteButtonRow = new MessageActionRow().addComponents([deleteButton(Initiator, sentMessage.id)]);
                // Remove the menu and update the ephemeral message
                await interaction
                    .editReply({ content: "Sent documentations for " + selectedValue, components: [deleteButtonRow] })
                    .catch(console.error);
            },
        },
    ],
    autocomplete: [
        {
            focusedOption: "query",
            async run(interaction, focusedOption) {
                const query = focusedOption.value as string;
                const { index, sitemap } = await getSources();
                // The limit for autocomplete options is 25
                const search = index.search(query, { limit: 25 }).map((id) => {
                    const val = sitemap[<number>id].loc;
                    // Values and names have a limit of 100 characters
                    const parsed = val.length >= 99 ? val.split("/").slice(-2).join("/") : val;
                    return { name: parsed, value: parsed };
                });
                await interaction.respond(search).catch(console.error);
            },
        },
    ],
};

// Export to reuse on the select menu handler
export async function getSingleMDNSearchResults(searchQuery: string) {
    // Search for the match once again
    const { index, sitemap } = await getSources();
    // Search one more time
    const secondSearch = index.search(searchQuery, { limit: 25 }).map((id) => sitemap[<number>id].loc);
    // Since it returns an array, the exact match might not be the first selection, if the exact match exists, fetch using that, if not get the first result
    const finalSelection = secondSearch.includes(searchQuery) ? searchQuery : secondSearch[0];
    const res = await request(`${MDN_BASE_URL + finalSelection}/index.json`).catch(console.error);
    if (!res || res?.statusCode !== 200) return null;
    const resJSON = await res.body.json?.().catch(console.error);
    if (!resJSON) return null;

    const doc: MdnDoc = resJSON.doc;

    return new MessageEmbed()
        .setColor(MDN_BLUE_COLOR)
        .setAuthor({ name: "MDN Documentation", iconURL: MDN_ICON_URL })
        .setColor(0xffffff)
        .setTitle(doc.pageTitle)
        .setURL(`https://developer.mozilla.org/${doc.mdn_url}`)
        .setThumbnail(MDN_ICON_URL)
        .setDescription(doc.summary);
}
export async function getSources(): Promise<typeof sources> {
    if (sources.lastUpdated && Date.now() - sources.lastUpdated < 43200000 /* 12 hours */) return sources;

    const res = await request("https://developer.mozilla.org/sitemaps/en-us/sitemap.xml.gz");
    if (res.statusCode !== 200) return sources; // Fallback to old sources if the new ones are not available for any reason
    const parsedSitemap = new XMLParser().parse(gunzipSync(await res.body.arrayBuffer()).toString());
    const sitemap: Sitemap<number> = parsedSitemap.urlset.url.map((entry: SitemapEntry<string>) => ({
        loc: entry.loc.slice(MDN_BASE_URL.length),
        lastmod: new Date(entry.lastmod).valueOf(),
    }));
    const index = new flexsearch.Index();
    sitemap.forEach((entry, idx) => index.add(idx, entry.loc));

    sources = { index, sitemap, lastUpdated: Date.now() };
    return sources;
}

export default command;
