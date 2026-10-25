require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const pollCommand = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create a customizable poll')
  .addStringOption(o => o.setName('question').setDescription('The poll question').setRequired(true).setMaxLength(180))
  .addStringOption(o => o.setName('options').setDescription('Options separated by | (2 to 5)').setRequired(true).setMaxLength(500))
  .addStringOption(o => o.setName('title').setDescription('Small heading shown above the question').setMaxLength(40))
  .addStringOption(o => o.setName('color').setDescription('Hex color, for example #ff69b4').setMaxLength(7))
  .addStringOption(o => o.setName('emojis').setDescription('Optional emojis separated by |, matching each option').setMaxLength(100))
  .addIntegerOption(o => o.setName('duration').setDescription('Poll duration in minutes (0 = no automatic close)').setMinValue(0).setMaxValue(10080))
  .addBooleanOption(o => o.setName('anonymous').setDescription('Hide voter names from the public results'))
  .addStringOption(o => o.setName('footer').setDescription('Custom footer text').setMaxLength(100));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    throw new Error('Set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in your .env file first.');
  }
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [pollCommand.toJSON()] });
  console.log('Registered /poll for your test server.');
})().catch(err => { console.error(err); process.exit(1); });
