require('dotenv').config();
const {
  Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionsBitField
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const polls = new Map(); // In-memory storage; active polls reset if the bot restarts.
const DEFAULT_COLOR = 0x5865F2;
const MAX_OPTIONS = 5;

function makeEmbed(poll) {
  const total = poll.votes.size;
  const counts = poll.options.map((_, i) => [...poll.votes.values()].filter(v => v === i).length);
  const lines = poll.options.map((option, i) => {
    const count = counts[i];
    const pct = total ? Math.round(count / total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `${poll.emojis[i] || '▫️'} **${option}**\n${poll.closed ? `${bar}  ${pct}% · ${count} vote${count === 1 ? '' : 's'}` : `${count} vote${count === 1 ? '' : 's'}`}`;
  });
  const embed = new EmbedBuilder()
    .setColor(poll.color)
    .setTitle(`${poll.closed ? '🔒' : '📊'} ${poll.title || 'POLL'}`)
    .setDescription(`**${poll.question}**\n\n${lines.join('\n\n')}`)
    .addFields({ name: 'Total votes', value: String(total), inline: true }, { name: 'Status', value: poll.closed ? 'Closed' : 'Open', inline: true })
    .setFooter({ text: poll.footer || 'Click a button to vote · You can change your vote' });
  if (poll.endsAt) embed.setTimestamp(new Date(poll.endsAt));
  return embed;
}

function makeRows(poll) {
  const rows = [];
  for (let start = 0; start < poll.options.length; start += 5) {
    const row = new ActionRowBuilder();
    poll.options.slice(start, start + 5).forEach((option, offset) => {
      const i = start + offset;
      row.addComponents(new ButtonBuilder()
        .setCustomId(`poll:${poll.id}:${i}`)
        .setLabel(`${poll.emojis[i] ? poll.emojis[i] + ' ' : ''}${option}`.slice(0, 80))
        .setStyle(poll.votes.size && [...poll.votes.values()].includes(i) ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(poll.closed));
    });
    rows.push(row);
  }
  return rows;
}

async function refreshPoll(poll) {
  try {
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(poll.messageId);
    await message.edit({ embeds: [makeEmbed(poll)], components: makeRows(poll) });
  } catch (error) { console.error('Could not update poll message:', error.message); }
}

client.once(Events.ClientReady, c => console.log(`Poll bot online as ${c.user.tag}`));

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'poll') {
      if (!interaction.inGuild()) return interaction.reply({ content: 'Polls can only be created inside a server.', ephemeral: true });
      const question = interaction.options.getString('question', true).trim();
      const options = interaction.options.getString('options', true).split('|').map(s => s.trim()).filter(Boolean);
      if (options.length < 2 || options.length > MAX_OPTIONS || options.some(s => s.length > 70)) {
        return interaction.reply({ content: 'Provide 2–5 options separated by |. Each option must be 70 characters or fewer.', ephemeral: true });
      }
      if (new Set(options.map(s => s.toLowerCase())).size !== options.length) {
        return interaction.reply({ content: 'Each option must be unique.', ephemeral: true });
      }
      let color = DEFAULT_COLOR;
      const rawColor = interaction.options.getString('color');
      if (rawColor) {
        if (!/^#?[0-9a-fA-F]{6}$/.test(rawColor)) return interaction.reply({ content: 'Color must be a hex value like #ff69b4.', ephemeral: true });
        color = parseInt(rawColor.replace('#', ''), 16);
      }
      const emojis = (interaction.options.getString('emojis') || '').split('|').map(s => s.trim());
      if (emojis.length && emojis.some(Boolean) && emojis.length !== options.length) {
        return interaction.reply({ content: 'If you set emojis, provide one emoji per option, separated by |.', ephemeral: true });
      }
      const duration = interaction.options.getInteger('duration') ?? 0;
      const poll = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        question, options, emojis: options.map((_, i) => emojis[i] || ''),
        title: interaction.options.getString('title') || 'POLL', color,
        footer: interaction.options.getString('footer') || '',
        anonymous: interaction.options.getBoolean('anonymous') ?? false,
        votes: new Map(), closed: false, channelId: interaction.channelId,
        messageId: null, endsAt: duration ? Date.now() + duration * 60000 : null,
        creatorId: interaction.user.id
      };
      const message = await interaction.reply({ embeds: [makeEmbed(poll)], components: makeRows(poll), fetchReply: true });
      poll.messageId = message.id;
      polls.set(poll.id, poll);
      if (duration > 0) setTimeout(async () => {
        const current = polls.get(poll.id);
        if (current && !current.closed) { current.closed = true; await refreshPoll(current); }
      }, duration * 60000).unref?.();
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('poll:')) {
      const [, pollId, optionText] = interaction.customId.split(':');
      const poll = polls.get(pollId);
      if (!poll) return interaction.reply({ content: 'This poll is no longer active (the bot may have restarted).', ephemeral: true });
      if (poll.closed) return interaction.reply({ content: 'This poll is closed.', ephemeral: true });
      const optionIndex = Number(optionText);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) return interaction.reply({ content: 'Invalid poll option.', ephemeral: true });
      poll.votes.set(interaction.user.id, optionIndex);
      await interaction.deferUpdate();
      await refreshPoll(poll);
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong. Check the bot console for details.', ephemeral: true }).catch(() => {});
    }
  }
});

if (!process.env.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.');
client.login(process.env.DISCORD_TOKEN);
