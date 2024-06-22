//Plugin reworked by JetDave, original version by MaskedMonkeyMan

// import BasePlugin from "./base-plugin.js";
import DiscordBasePlugin from './discord-base-plugin.js';
import { Layers } from "../layers/index.js"
import axios from "axios"
import Layer from '../layers/layer.js';
import fs from 'fs'
import path from 'path'
import process from 'process'
import SocketIOAPI from './socket-io-api.js';
import DBLog from './db-log.js';
import util from 'util';
// import DiscordServerStatus from './discord-server-status.js';
import Gamedig from 'gamedig';
import Sequelize, { NOW } from 'sequelize';
const { DataTypes, Op } = Sequelize;

export default class MapVote extends DiscordBasePlugin {
    static get description() {
        return "Map Voting plugin";
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix:
            {
                required: false,
                description: "command name to use in chat",
                default: "!vote"
            },
            entryFormat: {
                required: false,
                description: "The format of an entry in the voting list",
                default: '{map_name} {gamemode} {map_version} {factions} {main_assets}'
            },
            entriesAmount: {
                required: false,
                description: "Amount of entries generated for automatic votes",
                default: 6
            },
            automaticVoteStart: {
                required: false,
                description: "a map vote will automatically start after a new match if set to true",
                default: true
            },
            votingDuration: {
                required: false,
                description: "How long the voting will be active (in minutes). Set to 0 for unlimited time.",
                default: 0
            },
            minPlayersForVote:
            {
                required: false,
                description: 'number of players needed on the server for a vote to start',
                default: 40
            },
            voteWaitTimeFromMatchStart:
            {
                required: false,
                description: 'time in mins from the start of a round to the start of a new map vote',
                default: 15
            },
            voteBroadcastInterval:
            {
                required: false,
                description: 'broadcast interval for vote notification in mins',
                default: 7
            },
            automaticSeedingMode:
            {
                required: false,
                description: 'set a seeding layer if server has less than 20 players',
                default: true
            },
            numberRecentMapsToExlude: {
                required: false,
                description: 'random layer list will not include the n. recent maps',
                default: 4
            },
            numberRecentLayersToExclude: {
                required: false,
                description: 'REQUIRES DBLOG PLUGIN. avoids repeating the same layer of the same map',
                default: 4
            },
            gamemodeWhitelist: {
                required: false,
                description: 'random layer list will be generated with only selected gamemodes',
                default: [ "AAS", "RAAS", "INVASION" ]
            },
            layerFilteringMode: {
                required: false,
                description: "Select Whitelist mode or Blacklist mode",
                default: "blacklist"
            },
            layerLevelWhitelist: {
                required: false,
                description: 'random layer list will include only the whitelisted layers or levels. (acceptable formats: Gorodok/Gorodok_RAAS/Gorodok_AAS_v1)',
                default: []
            },
            layerLevelBlacklist: {
                required: false,
                description: 'random layer list will not include the blacklisted layers or levels. (acceptable formats: Gorodok/Gorodok_RAAS/Gorodok_AAS_v1)',
                default: []
            },
            applyBlacklistToWhitelist: {
                required: false,
                description: 'if set to true the blacklisted layers won\'t be included also in whitelist mode',
                default: true
            },
            factionsBlacklist: {
                required: false,
                description: "factions to exclude in map vote. ( ex: ['CAF'] )",
                default: []
            },
            minRaasEntries: {
                required: false,
                description: 'Minimum amount of RAAS layers in the vote list.',
                default: 2
            },
            minGamemodeEntries: {
                required: false,
                description: 'Minimum amount layers in the vote list per gamemode.',
                default: {
                    raas: 2,
                    aas: 2,
                    invasion: 0
                }
            },
            hideVotesCount: {
                required: false,
                description: 'hides the number of votes a layer received in broadcast message',
                default: false
            },
            hideEntryIndex: {
                required: false,
                description: 'hides the index number of an entry in the mapvote broadcast',
                default: false
            },
            showRerollOption: {
                required: false,
                description: 'vote option to restart the vote with random entries',
                default: false
            },
            showRerollOptionInCustomVotes: {
                required: false,
                description: 'enables/disables the reroll option only in custom votes. showRerollOption must be set to true',
                default: false
            },
            voteBroadcastMessage: {
                required: false,
                description: 'Message that is sent as broadcast to announce a vote',
                default: "✯ MAPVOTE ✯\nVote for the next map by writing in chat the corresponding number!"
            },
            voteWinnerBroadcastMessage: {
                required: false,
                description: 'Message that is sent as broadcast to announce the winning layer',
                default: "✯ MAPVOTE ✯\nThe winning layer is\n\n"
            },
            showWinnerBroadcastMessage: {
                required: false,
                description: 'Enables the broadcast at the end of the voting.',
                default: true
            },
            allowedSameMapEntries: {
                required: false,
                description: 'Allowed NUMBER of duplicate map entries in vote list',
                default: 1
            },
            logToDiscord: {
                required: false,
                description: 'Enables/disables vote logging to Discord',
                default: true
            },
            channelID: {
                required: false,
                description: 'The ID of the channel to log votes to.',
                default: '',
                example: '112233445566778899'
            },
            persistentDataFile: {
                required: false,
                description: 'Path to file in which to store important data that should be restored after a restart',
                default: ""
            },
            timezone: {
                required: false,
                description: "Timezone relative to UTC time. 0 for UTC, 2 for CEST (UTC+2), -1 (UTC-1) ",
                default: 0
            },
            minimumVotesToAcceptResult: {
                required: false,
                description: "Minimum votes per map to accept result.",
                default: 1
            },
            seedingGameMode: {
                required: false,
                description: "Gamemode used in seeding mode",
                default: "Seed"
            },
            instantSeedingModePlayerCount: {
                required: false,
                description: "Required player count to trigger an instant layer change to a seeding layer",
                default: 5
            },
            nextLayerSeedingModePlayerCount: {
                required: false,
                description: "Required player count to change the next layer to a seeding layer",
                default: 20
            },
            developersAreAdmins: {
                required: false,
                description: "Developers of this plugin are allowed to run admin commands in anychat",
                default: true
            },
            filterByMod: {
                required: false,
                description: "Array including mod prefixes",
                default: []
            },
            OWIMapLayerGSheetUrl: {
                required: false,
                description: "Map/Layers Google Sheet URL provided by OWI",
                default: "https://docs.google.com/spreadsheets/d/1wWB3eNBPLQ7VS9y7jtzyfL_I7LxgZmGVpr0O81b0P84/edit#gid=84736544"
            },
            timeFrames: {
                required: false,
                description: 'Array of timeframes to override options',
                default: []
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.prepareToMountSaved = this.prepareToMount;
        this.prepareToMount = (async () => {
            await this.prepareToMountSaved();
            await this.prepareToMountCustom();
        }).bind(this)

        this.options.timeFrames.forEach((e, key, arr) => { arr[ key ].id = key + 1 });

        if (this.options.allowedSameMapEntries < 1) this.options.allowedSameMapEntries = 1

        this.voteRules = {}; //data object holding vote configs
        this.nominations = []; //layer strings for the current vote choices
        this.trackedVotes = {}; //player votes, keyed by steam id
        this.tallies = []; //votes per layer, parellel with nominations
        this.votingEnabled = false;
        this.broadcastIntervalTask = null;
        this.firstBroadcast = true;
        this.newVoteTimeout = null;
        this.newVoteOptions = {
            steamid: null,
            cmdLayers: [],
            bypassRaasFilter: false
        };
        this.or_options = { ...this.options };
        this.autovotestart = null;
        this.lastMapUpdate = new Date();
        this.endVotingTimeout = null;
        this.timeout_ps = []
        this.rconLayers = ""

        this.lastNominationBroadcast = +(new Date(0));

        this.onNewGame = this.onNewGame.bind(this);
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
        this.onChatMessage = this.onChatMessage.bind(this);
        this.broadcastNominations = this.broadcastNominations.bind(this);
        this.beginVoting = this.beginVoting.bind(this);
        this.setSeedingMode = this.setSeedingMode.bind(this);
        this.logVoteToDiscord = this.logVoteToDiscord.bind(this);
        this.timeframeOptionOverrider = this.timeframeOptionOverrider.bind(this);
        this.savePersistentData = this.savePersistentData.bind(this);
        this.restorePersistentData = this.restorePersistentData.bind(this);
        this.endVotingGently = this.endVotingGently.bind(this);
        this.formatChoice = this.formatChoice.bind(this);
        this.updateNextMap = this.updateNextMap.bind(this);
        this.mapLayer = this.mapLayer.bind(this);
        this.getLayersFromStringId = this.getLayersFromStringId.bind(this);
        this.debugWebpage = this.debugWebpage.bind(this);
        this.serverQueryData = this.serverQueryData.bind(this);
        this.getTranslation = this.getTranslation.bind(this);
        this.createModel = this.createModel.bind(this);
        this.setVotesCount = this.setVotesCount.bind(this);
        this.getLayerHistoryForLevel = this.getLayerHistoryForLevel.bind(this);
        this.directMsgNominations = this.directMsgNominations.bind(this);
        this.formatFancyLayer = this.formatFancyLayer.bind(this);
        this.readLinesReverse = this.readLinesReverse.bind(this);
        this.getCurrentLayer = this.getCurrentLayer.bind(this);
        this.setCurrentLayer = this.setCurrentLayer.bind(this);
        this.onLogLine = this.onLogLine.bind(this);

        this.delay = util.promisify(setTimeout);

        this.DBLogPlugin;

        this.models = {};
        this.logsFilePath = path.join(this.server.options.logDir, 'SquadGame.log');

        this.broadcast = async (msg) => { await this.server.rcon.broadcast(msg); };
        this.warn = async (steamid, msg) => { await this.server.rcon.warn(steamid, msg); };

        process.on('uncaughtException', this.savePersistentData);
    }

    createModel(name, schema) {
        if (!this.DBLogPlugin) return;
        this.models[ name ] = this.DBLogPlugin.options.database.define(`MapVote_${name}`, schema, {
            timestamps: false
        });
        // this.verbose(1,'DBLogOptions', this.DBLogPlugin.options)
    }

    async prepareToMountCustom() {
        this.DBLogPlugin = this.server.plugins.find(p => p instanceof DBLog);
        if (!this.DBLogPlugin) return;

        await this.createModel('PlayerVotes', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            server: {
                type: DataTypes.INTEGER
            },
            level: {
                type: DataTypes.STRING
            },
            gamemode: {
                type: DataTypes.STRING
            },
            version: {
                type: DataTypes.INTEGER
            },
            layerid: {
                type: DataTypes.STRING
            },
            playerSteamID: {
                type: DataTypes.STRING
            },
            mod: {
                type: DataTypes.STRING,
                defaultValue: ""
            },
            match: {
                type: DataTypes.INTEGER
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
            }
        });

        await this.models.PlayerVotes.sync();
    }

    async mount() {
        await this.updateLayerList();
        this.restorePersistentData();
        this.server.on('NEW_GAME', this.onNewGame);
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        this.server.on('UPDATED_SERVER_INFORMATION', (info) => this.setCurrentLayer(info.currentLayer));
        // this.server.on('PLAYER_CONNECTED', () => this.beginVoting());
        this.server.on('ROUND_ENDED', this.endVotingGently)
        setTimeout(() => {
            this.verbose(1, 'Enabled late listeners.');
            this.server.on('PLAYER_CONNECTED', this.setSeedingMode);
            this.server.on('PLAYER_DISCONNECTED', this.setSeedingMode);
        }, 5 * 1000) // wait 10 seconds to be sure to have an updated player list
        this.verbose(1, 'Map vote was mounted.');
        this.verbose(1, "Blacklisted Layers/Levels: " + this.options.layerLevelBlacklist.join(', '))
        // await this.checkUpdates();
        this.timeframeOptionOverrider();
        setInterval(this.timeframeOptionOverrider, 1 * 60 * 1000)
        setInterval(this.savePersistentData, 20 * 1000)
        this.debugWebpage();

        this.getCurrentLayer();

        this.server.logParser.logReader.reader.on('line', this.onLogLine)

        // setTimeout(async () => {
        //     console.log((await this.getLayerHistoryForLevel('Gorodok')).map(l => l.layerClassname))
        // }, 2000)
    }

    async unmount() {
        this.server.removeEventListener('NEW_GAME', this.onNewGame);
        this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
        this.server.removeEventListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        clearInterval(this.broadcastIntervalTask);
        this.verbose(1, 'Map vote was un-mounted.');
    }

    async serverQueryData(info) {
        if (info) {
            this.server.playerCount = info.playerCount;
            this.setSeedingMode();
        }
        // this.verbose(1, 'A2S Player Count:', this.server.playerCount)
        if (
            this.server.layerHistory[ 0 ].layer &&
            this.server.currentLayer
        ) return;

        let a2sError = false;
        const queryParams = {
            type: 'squad',
            host: this.server.options.host,
            port: this.server.options.queryPort
        }
        // await this.delay(1000);
        const data = await Gamedig.query(queryParams).catch(e => {
            this.verbose(2, 'Could not complete A2S query. Error:', queryParams, e)
            a2sError = e;
        });
        if (a2sError) return;
        const currentLayerId = data.map;
        // const currentLayer = Layers.layers.find((l) => l.layerid == currentLayerId);
        const currentLayer = Layers.layers.find(l => l.layerid == currentLayerId);

        if (!this.server.currentLayer) this.server.currentLayer = currentLayer;
        if (!this.server.layerHistory[ 0 ].layer?.layerid) this.server.layerHistory[ 0 ].layer = currentLayer;

        // if (!this.server.nextLayer) {
        //     const rconNextLayerMatch = (await this.server.rcon.execute('ShowNextMap')).replace(/ \(.+\)$/, '').match(/Next level is .+\, layer is (.+) (.+) (.+)$/);
        //     this.verbose(1, 'RCON next layer', rconNextLayerMatch)
        //     if (rconNextLayerMatch) {
        //         const nextLayer = Layers.layers.find(l => l.name == rconNextLayerMatch[ 1 ] && l.gamemode == rconNextLayerMatch[ 2 ] && l.version.replace(/[^\d]/, '') == rconNextLayerMatch[ 3 ].replace(/[^\d]/, ''))
        //         this.verbose(1, 'FOUND Next Layer', nextLayer)
        //         this.server.nextLayer = nextLayer;
        //     }
        // }
        // let discordServerStatusPlugin = this.server.plugins.find(p => p instanceof DiscordServerStatus);
        // discordServerStatusPlugin.updateStatus();

        this.verbose(1, 'Current Layer', currentLayer?.layerid)
    }

    debugWebpage() {
        let socketIo = this.server.plugins.find(p => p instanceof SocketIOAPI);
        if (!socketIo) {
            this.verbose(1, 'SocketIOAPI Plugin has not been found. HTTP Server could not be enabled.')
            return;
        }
        try {
            socketIo.httpServer.on('request', async (req, res) => {
                this.verbose(2, 'Request', req.url)
                if (req.method == 'GET' && req.url == '/mapvote/debug/layerHistory') {
                    // this.verbose(1, `Sending response to "${req.url}"`)
                    res.setHeader('Content-Type', 'application/json');
                    res.write(JSON.stringify(this.server.layerHistory, null, 2))
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/debug/layers') {

                    // this.verbose(1, `Sending response to "${req.url}"`)
                    res.setHeader('Content-Type', 'application/json');
                    res.write(JSON.stringify(Layers.layers, null, 2))
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/debug/currentLayer') {

                    // this.verbose(1, `Sending response to "${req.url}"`)
                    res.setHeader('Content-Type', 'application/json');
                    res.write(JSON.stringify(this.server.currentLayer, null, 2))
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/debug/nextLayer') {
                    res.setHeader('Content-Type', 'application/json');
                    res.write(JSON.stringify(this.server.nextLayer, null, 2))
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/debug/rconLayers') {
                    res.setHeader('Content-Type', 'application/json');
                    res.write(this.rconLayers)
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/debug/currentVote') {
                    res.setHeader('Content-Type', 'application/json');
                    // res.write(this.nomination.map((v,i)=>({layerId: v, votes: this.trackedVotes[i], layer: Layers.})))
                    res.write(JSON.stringify({
                        nominations: this.nominations,
                        trackedVotes: this.trackedVotes,
                        tallies: this.tallies,
                        votingEnabled: this.votingEnabled,
                        factionStrings: this.factionStrings,
                        firstBroadcast: this.firstBroadcast
                    }))
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/command/start') {
                    res.setHeader('Content-Type', 'application/json');

                    if (this.votingEnabled) {
                        res.write("false")
                        return;
                    }
                    this.beginVoting(true);

                    res.write("true")
                    res.end();
                } else if (req.method == 'GET' && req.url == '/mapvote/command/broadcast') {
                    res.setHeader('Content-Type', 'application/json');

                    if (!this.votingEnabled) {
                        res.write("false")
                        return;
                    }
                    this.lastNominationBroadcast = +(new Date(0))
                    this.broadcastNominations();

                    res.write("true")
                    res.end();
                }
            })
        } catch (error) {
            this.verbose(1, 'Unable to start debug webpages', error)
        }
    }

    async onNewGame() {
        for (let x of this.timeout_ps)
            clearTimeout(x)
        this.timeout_ps = [];

        if (this.options.automaticVoteStart) this.autovotestart = setTimeout(this.beginVoting, toMils(this.options.voteWaitTimeFromMatchStart));


        // this.endVotingTimeout = setTimeout(async () => {
        //     this.endVoting();
        //     this.trackedVotes = {};
        //     this.tallies = [];
        //     this.nominations = [];
        //     this.factionStrings = [];
        //     // setTimeout(() => this.setSeedingMode(true), 10000);
        // }, 10000)
    }

    async onPlayerDisconnected() {
        if (!this.votingEnabled) return;
        await this.server.updatePlayerList();
        this.clearVote();
        if (new Date() - this.lastMapUpdate > 5 * 1000) this.updateNextMap();
    }
    async timeframeOptionOverrider() {
        const orOpt = { ...this.or_options };
        const utcDelay = parseFloat(this.options.timezone);
        let timeNow = new Date(0, 0, 0, new Date().getUTCHours() + utcDelay, new Date().getUTCMinutes());
        timeNow = new Date(0, 0, 0, timeNow.getHours(), timeNow.getMinutes())

        // console.log(timeNow, timeNow.toTimeString(), timeNow.toLocaleTimeString())
        this.verbose(1, `Current time (UTC${(utcDelay >= 0 ? '+' : '') + utcDelay}) ${timeNow.toLocaleTimeString('en-GB').split(':').splice(0, 2).join(':')} `)

        const activeTimeframes = orOpt.timeFrames.filter(tfFilter);
        let logTimeframe = "Active Time Frames: ";
        let activeTfIds = [];
        this.options = { ...this.or_options };
        for (let atfK in activeTimeframes) {
            const atf = activeTimeframes[ atfK ];
            activeTfIds.push(atf.name || atf.id);
            for (let o in atf.overrides) {
                this.options[ o ] = atf.overrides[ o ];
            }
        }
        this.verbose(1, logTimeframe + activeTfIds.join(', '));

        function tfFilter(tf, key, arr) {
            const tfStartSplit = [ parseInt(tf.start.split(':')[ 0 ]), parseInt(tf.start.split(':')[ 1 ]) ];
            const tfEndSplit = [ parseInt(tf.end.split(':')[ 0 ]), parseInt(tf.end.split(':')[ 1 ]) ];

            const tfStart = new Date(0, 0, 0, ...tfStartSplit)
            const tfStart2 = new Date(0, 0, 0, 0, 0)
            const tfEnd = new Date(0, 0, 0, ...tfEndSplit)
            const tfEnd2 = new Date(0, 0, 0, 24, 0)

            // console.log(timeNow, tfStart, tfEnd, tfStart2 <= timeNow, timeNow < tfEnd)

            return (tfStart <= timeNow && timeNow < tfEnd) || (tfStart > tfEnd && ((tfStart <= timeNow && timeNow < tfEnd2) || (tfStart2 <= timeNow && timeNow < tfEnd)))
        }
    }

    async setSeedingMode(isNewGameEvent = false, tries = 0) {
        this.options.seedingGameMode = this.options.seedingGameMode.toLowerCase();
        // this.msgBroadcast("[MapVote] Seeding mode active")
        const baseDataExist = this && this.options && this.server && this.server.players;

        if (!baseDataExist) {
            if (tries < 3) {
                return this.setSeedingMode(isNewGameEvent, tries++)

            } else {
                console.log("[MapVote][1] Bad data (this/this.server/this.options). Seeding mode skipped to prevent errors.");
                return;
            }
        }

        await new Promise((res, rej) => this.server.once('UPDATED_SERVER_INFORMATION', res))

        if (this.options.automaticSeedingMode) {
            this.verbose(1, "Checking seeding mode");
            const maxSeedingModePlayerCount = Math.max(this.options.nextLayerSeedingModePlayerCount, this.options.instantSeedingModePlayerCount);
            if (this.server.playerCount >= 1 && this.server.playerCount < maxSeedingModePlayerCount) {
                // if (+(new Date()) - +this.server.layerHistory[ 0 ].time > 30 * 1000) {
                const sanitizedLayers = Layers.layers.filter((l) => l.layerid && l.map &&
                    (this.options.filterByMod.length == 0 || this.options.filterByMod.find(m => l.mod?.toLowerCase() == m.toLowerCase()))
                );
                const seedingMaps = sanitizedLayers.filter((l) => l.layerid && l.gamemode?.toLowerCase() == this.options.seedingGameMode && !this.options.layerLevelBlacklist.find((fl) => l.layerid.toLowerCase().startsWith(fl.toLowerCase())))

                const rndMap = randomElement(seedingMaps);
                if (this.server.currentLayer) {
                    if (!this.server.currentLayer.gamemode.match(new RegExp(this.options.seedingGameMode, 'i'))) {
                        if (this.server.playerCount <= this.options.instantSeedingModePlayerCount) {
                            const newCurrentMap = rndMap.layerid;
                            this.verbose(1, 'Going into seeding mode.');
                            this.endVoting();
                            this.server.rcon.execute(`AdminChangeLayer ${newCurrentMap} `);
                        }
                    }
                } else this.verbose(1, "Bad data (currentLayer). Seeding mode for current layer skipped to prevent errors.");

                if (this.server.nextLayer) {
                    const nextMaps = seedingMaps.filter((l) => (!this.server.currentLayer || l.layerid != this.server.currentLayer.layerid))
                    let rndMap2;
                    do rndMap2 = randomElement(nextMaps);
                    while (rndMap2.layerid == rndMap.layerid)

                    if (this.server.playerCount < this.options.nextLayerSeedingModePlayerCount && this.server.nextLayer.gamemode.toLowerCase() != "seed") {
                        const newNextMap = rndMap2.layerid;
                        this.endVoting();
                        this.server.rcon.execute(`AdminSetNextLayer ${newNextMap} `);
                    }
                } else this.verbose(1, "Bad data (nextLayer). Seeding mode for next layer skipped to prevent errors.");
                // } else this.verbose(1, `Waiting 30 seconds from mapchange before entering seeding mode`);
            } else this.verbose(1, `Player count doesn't allow seeding mode (${this.server.playerCount}/${maxSeedingModePlayerCount})`);
        } else this.verbose(1, "Seeding mode disabled in config");
    }

    async onChatMessage(info) {
        const { steamID, name: playerName } = info;
        const message = info.message.toLowerCase();
        //check to see if this message has a command prefix
        if (!message.startsWith(this.options.commandPrefix) && isNaN(message))
            return;

        const commandSplit = (isNaN(message) ? message.substring(this.options.commandPrefix.length).trim().split(' ') : [ message ]);
        let cmdLayers = commandSplit.slice(1);
        for (let k in cmdLayers) cmdLayers[ k ] = cmdLayers[ k ].toLowerCase();
        const subCommand = commandSplit[ 0 ];
        if (!isNaN(subCommand)) // if this succeeds player is voting for a map
        {

            const mapNumber = parseInt(subCommand); //try to get a vote number
            if (this.nominations[ mapNumber ]) {
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                await this.registerVote(steamID, mapNumber, playerName);
                this.updateNextMap();
            } else
                await this.warn(steamID, "Please vote a valid option");
            return;
        }

        const isAdmin = info.chat === "ChatAdmin" || (steamID === "76561198419229279" && this.options.developersAreAdmins);
        switch (subCommand) // select the sub command
        {
            case "choice": //sends choices to player in the from of a warning
            case "choices": //sends choices to player in the from of a warning
            case "result": //sends player the results in a warning
            case "results": //sends player the results in a warning
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                await this.directMsgNominations(steamID);
                return;
            case "start": //starts the vote again if it was canceled
                if (!isAdmin) return;

                if (this.votingEnabled) {
                    await this.warn(steamID, "Voting is already enabled");
                    return;
                }
                this.beginVoting(true, steamID, cmdLayers);
                return;
            case "restart": //starts the vote again if it was canceled
                if (!isAdmin) return;
                this.endVoting();
                this.beginVoting(true, steamID, cmdLayers);
                return;
            case "cancel": //cancels the current vote and wont set next map to current winnner
                if (!isAdmin) return;

                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.endVoting();
                await this.warn(steamID, "Ending current vote");
                return;
            case "end": //gently ends the current vote and announces the winner layer
                if (!isAdmin) return;

                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.endVotingGently(steamID);
                return;
            case "cancelauto": //cancels the current vote and wont set next map to current winnner
                if (!isAdmin) return;

                if (!this.autovotestart) {
                    await this.warn(steamID, "There is no automatic vote start scheduled");
                    return;
                }
                clearTimeout(this.autovotestart);
                this.autovotestart = null;
                await this.warn(steamID, "Ending current vote");
                return;
            case "broadcast":
                if (!isAdmin) return;
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.lastNominationBroadcast = +(new Date(0))
                this.broadcastNominations();
                return;
            case "endmatch":
                if (!isAdmin) return;
                this.server.rcon.execute(`AdminEndMatch`)
                return;
            case "setvotes":
            case "changevotes":
                if (!isAdmin) return;
                this.setVotesCount(+commandSplit[ 1 ], +commandSplit[ 2 ])
                this.warn(steamID, `Set ${this.nominations[ +commandSplit[ 1 ] ]} to ${+commandSplit[ 2 ]} votes`)
                return;
            case "simulate":
                this.populateNominations(steamID, [], false, 10, true)
                return;
            case "getlayer":
                this.warn(steamID, `INPUT: ${commandSplit[ 1 ]} \nOUTPUT: \n   ${this.getLayersFromStringId(commandSplit[ 1 ]).map(l => l.layerid).join('; ')}`)
                return;
            case "help": //displays available commands
                let msg = "";
                msg += (`!vote\n > choices\n > results\n`);
                if (isAdmin) msg += (`\n Admin only:\n > start\n > restart\n > cancel\n > broadcast\n > endmatch\n > setvotes`);

                await this.warn(steamID, msg + `\nMapVote SquadJS plugin built by JetDave`);
                return;
            case "endsqjs":
            case "closesqjs":
            case "stopesqjs":
            case "restartsqjs":
                if (!isAdmin) return;
                await this.warn(steamID, "Saving persistent data.\nTerminating SquadJS process.\nIf managed by a process manager it will automatically restart.")
                this.savePersistentData(steamID);
                process.exit(0);
                return;
            default:
                //give them an error
                await this.warn(steamID, `Unknown vote subcommand: ${subCommand}`);
                return;
        }

    }

    setVotesCount(index, newCount) {
        this.tallies[ index ] = parseInt(newCount)
    }

    updateNextMap() //sets next map to current mapvote winner, if there is a tie will pick at random
    {
        if (!this.votingEnabled) return;
        this.lastMapUpdate = new Date();
        let cpyWinners = this.currentWinners;
        let skipSetNextMap = false;
        if (cpyWinners.find(e => e == this.nominations[ 0 ])) {
            if (cpyWinners.length > 1) {
                delete cpyWinners[ cpyWinners.indexOf(this.nominations[ 0 ]) ]
                cpyWinners = cpyWinners.filter(e => e != null)
            }
            else {
                skipSetNextMap = true;
                if (this.newVoteTimeout == null) {
                    this.newVoteTimeout = setTimeout(() => {
                        if (this.currentWinners.find(e => e == this.nominations[ 0 ]) && this.currentWinners.length == 1) {
                            this.newVoteTimeout = null;
                            this.endVoting()
                            this.broadcast("The previous Map Vote has been canceled and a new one has been generated!")
                            this.beginVoting(true, this.newVoteOptions.steamid, this.newVoteOptions.cmdLayers)
                        }
                    }, 2 * 60 * 1000)
                    setTimeout(this.broadcastNominations, 1 * 60 * 1000)
                }
            }
        }
        const nextMap = randomElement(cpyWinners);
        if (!skipSetNextMap) {
            const baseDataExist = this && this.server;
            const layerDataExist = this.server.nextLayer && this.server.nextLayer.layerid;
            if (baseDataExist && (!layerDataExist || this.server.nextLayer.layerid != nextMap)) {
                this.server.rcon.execute(`AdminSetNextLayer ${nextMap}`);
                this.server.nextLayer = Layers.layers.find(l => l.layerid == nextMap);
            }
            else console.log("[MapVote][1] Bad data (this/this.server). Next layer not set to prevent errors.");
        }
        return nextMap;
    }

    matchLayers(builtString) {
        return Layers.layers.filter(element => element.layerid.includes(builtString));
    }

    getMode(nomination, currentMode) {
        const mapName = nomination.map;
        let modes = nomination.modes;
        let mode = modes[ 0 ];

        if (mode === "Any")
            modes = this.voteRules.modes;

        if (this.voteRules.mode_repeat_blacklist.includes(currentMode)) {
            modes = modes.filter(mode => !mode.includes(currentMode));
        }

        while (modes.length > 0) {
            mode = randomElement(modes);
            modes = modes.filter(elem => elem !== mode);
            if (this.matchLayers(`${mapName}_${mode}`).length > 0)
                break;
        }

        return mode;
    }

    //TODO: right now if version is set to "Any" no caf layers will be selected
    async populateNominations(steamid = null, cmdLayers = [], bypassRaasFilter = false, tries = 10, simulate = false) //gets nomination strings from layer options
    {
        this.options.gamemodeWhitelist.forEach((e, k, a) => a[ k ] = e.toUpperCase());
        // this.nominations.push(builtLayerString);
        // this.tallies.push(0);

        const translations = {
            // 'United States Army': "USA",
            // 'United States Marine Corps': "USMC",
            // 'Russian Ground Forces': "RUS",
            // 'British Army': "GB",
            // 'British Armed Forces': "GB",
            // 'Canadian Army': "CAF",
            // 'Australian Defence Force': "AUS",
            // 'Irregular Militia Forces': "MIL",
            // 'Middle Eastern Alliance': "MEA",
            // 'Insurgent Forces': "INS",
            'Unknown': "Unk"
        }

        if (!simulate) {
            this.nominations = [];
            this.tallies = [];
            this.factionStrings = [];
        }
        let rnd_layers = [];

        const sanitizedLayers = Layers.layers.filter((l) => l.layerid && l.map &&
            (this.options.filterByMod.length == 0 || this.options.filterByMod.find(m => l.mod?.toLowerCase() == m.toLowerCase()))
        );
        const maxOptions = this.options.showRerollOption ? 20 : 21;
        const optionAmount = Math.min(maxOptions, this.options.entriesAmount);

        // const recentlyPlayedMaps = this.objArrToValArr(this.server.layerHistory.slice(0, this.options.numberRecentMapsToExlude), "layer", "map", "name");
        const recentlyPlayedMaps = this.server.layerHistory.slice(0, this.options.numberRecentMapsToExlude).map(l => l.layer?.map?.name);
        this.verbose(1, "Recently played maps: " + recentlyPlayedMaps.join(', '));//recentlyPlayedMaps.filter((l) => l && l.map && l.map.name).map((l) => l.map.name).join(', '))

        const isRandomVote = !cmdLayers || cmdLayers.length == 0;
        if (isRandomVote) {
            for (let gm of Object.keys(this.options.minGamemodeEntries)) {
                for (let i = 0; i < +this.options.minGamemodeEntries[ gm ] && cmdLayers.length < optionAmount; i++)
                    cmdLayers.push(`*_${gm}`);
            }
            while (cmdLayers.length < optionAmount)
                cmdLayers.push(`*`);

        }
        // this.warn(steamid, `Random vote: ${isRandomVote}: ${cmdLayers.join('; ')}`)

        if (cmdLayers.length == 1) while (cmdLayers.length < optionAmount) cmdLayers.push(cmdLayers[ 0 ])

        let iterationLayersCount = [];

        if (cmdLayers.length <= maxOptions) {
            let i = 1;
            for (let cl of cmdLayers) {
                const cls = cl.toLowerCase().split('_');
                const fLayers = sanitizedLayers.filter((l) => (
                    ((cls[ 0 ] && cls[ 0 ] != '*') || rnd_layers.filter(l2 => l2.map.name == l.map.name).length < this.options.allowedSameMapEntries) &&
                    ((cls[ 0 ] && cls[ 0 ] != '*') || ![ this.server.currentLayer?.map?.name, ...recentlyPlayedMaps ].includes(l.map.name)) &&
                    (
                        (
                            (this.options.layerFilteringMode.toLowerCase() == "blacklist" && !this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))) ||
                            (
                                this.options.layerFilteringMode.toLowerCase() == "whitelist"
                                && this.options.layerLevelWhitelist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))
                                && !(this.options.applyBlacklistToWhitelist && this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid)))
                            )
                        ) || cls[ 2 ]
                    )

                    // && (
                    //     (cls[ 0 ] == "*" || l.layerid.toLowerCase().startsWith(cls[ 0 ]))
                    //     || (cls[ 0 ].toLowerCase().startsWith('f:') && [ this.getTranslation(l.teams[ 0 ]), this.getTranslation(l.teams[ 1 ]) ].includes(cls[ 0 ].substring(2).toUpperCase()))
                    // )
                    // && (l.gamemode?.toLowerCase().startsWith(cls[ 1 ]) || (!cls[ 1 ] && this.options.gamemodeWhitelist.includes(l.gamemode?.toUpperCase())))
                    // && (!cls[ 2 ] || l.version.toLowerCase().startsWith("v" + cls[ 2 ].replace(/v(0*)/i, '')))
                    // // && !(this.options.factionsBlacklist.find((f) => [ this.getTranslation(l.teams[ 0 ]), this.getTranslation(l.teams[ 1 ]) ].includes(f)))

                    && this.getLayersFromStringId(cl, l)
                    && (cls[ 2 ] || !(
                        this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))
                        || this.options.factionsBlacklist.find((f) => [ this.getTranslation(l.teams[ 0 ]), this.getTranslation(l.teams[ 1 ]) ].includes(f))
                    ))
                ));
                iterationLayersCount.push(fLayers.length);
                // this.warn(steamid, `SanLayer: ${sanitizedLayers.filter(l => (
                //     (
                //         (
                //             (this.options.layerFilteringMode.toLowerCase() == "blacklist" && !this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))) ||
                //             (
                //                 this.options.layerFilteringMode.toLowerCase() == "whitelist"
                //                 && this.options.layerLevelWhitelist.find((fl) => this.getLayersFromStringId(fl).find(fl => fl.layerid == l.layerid))
                //                 // && !(this.options.applyBlacklistToWhitelist && this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).find(fl => fl.layerid == l.layerid)))
                //             )
                //         ) || cls[ 2 ]
                //     )
                // )).length}`)
                if (fLayers.length == 0) continue;
                // this.verbose(1, 'fLayers', fLayers.map(l => l.layerid));
                // this.verbose(1, 'rnd_layers', rnd_layers.map(l => l.layerid));
                let l, maxtries = 20;

                do l = randomElement(fLayers);
                while (
                    rnd_layers.filter(lf => lf.map.name == l.map.name).length > (this.options.allowedSameMapEntries - 1)
                    && rnd_layers.filter(lf => lf.layerid == l.layerid).length > 1
                    // && ((await this.getLayerHistoryForLevel(l.layerid.split('_')[ 0 ], +this.numberRecentLayersToExclude)).find(dbL => dbL.layerClassname == l.layerid) || cls[ 2 ])
                    && --maxtries >= 0
                )

                if (l) {
                    rnd_layers.push(l);
                    if (!simulate) {
                        this.nominations[ i ] = l.layerid
                        this.tallies[ i ] = 0;
                        this.factionStrings[ i ] = this.getTranslation(l.teams[ 0 ]) + "-" + this.getTranslation(l.teams[ 1 ]);
                        i++;
                    }
                }
            }

            if (rnd_layers.length == 0) {
                this.warn(steamid, `Could not start a vote due to randomized layer list being filtered to 0`)
                return;
            }
            // this.warn(steamid, `Iteration layers count: ${iterationLayersCount.join('; ')}`);
        }
        else if (steamid) {
            this.warn(steamid, "You cannot start a vote with more than " + maxOptions + " options");
            return;
        }

        if (simulate && steamid) {
            this.verbose(1, 'Simulation', rnd_layers)
            this.warn(steamid, 'Simulation\n', rnd_layers.map(l => l.layerid).join('\n'));
            return;
        }

        if (this.options.showRerollOption && (isRandomVote || this.options.showRerollOptionInCustomVotes)) {
            // if (this.nominations.length > 5) {
            //     this.nominations.splice(6, 1);
            //     this.tallies.splice(6, 1);
            //     this.factionStrings.splice(6, 1);
            // }

            this.newVoteOptions.steamid = steamid;
            this.newVoteOptions.bypassRaasFilter = bypassRaasFilter;
            this.newVoteOptions.cmdLayers = cmdLayers;

            this.nominations[ 0 ] = "Reroll vote list with random options"
            this.tallies[ 0 ] = 0;
            this.factionStrings[ 0 ] = "";
        }

        if (this.nominations[ 1 ] != "")
            this.server.rcon.execute(`AdminSetNextLayer ${this.nominations[ 1 ]} `);

    }

    getTranslation(layer) {
        if (translations[ layer.faction ]) return translations[ layer.faction ]
        else if (layer.faction) {
            const f = layer.faction.split(' ');
            let fTag = "";
            if (f.length == 1)
                return layer.faction
            f.forEach((e) => { fTag += e[ 0 ] || '' });
            return fTag.toUpperCase();
        } else return "Unknown"
    }

    //checks if there are enough players to start voting, if not binds itself to player connected
    //when there are enough players it clears old votes, sets up new nominations, and starts broadcast
    async beginVoting(force = false, steamid = null, cmdLayers = []) {
        if (!this.options.automaticVoteStart && !force) return;
        this.lastNominationBroadcast = +(new Date(0));

        this.verbose(1, "Starting vote")
        const playerCount = this.server.players.length;
        const minPlayers = this.options.minPlayersForVote;

        if (this.votingEnabled) //voting has already started
            return;


        if (playerCount < minPlayers && !force) {
            // this.autovotestart = setTimeout(() => { this.beginVoting(force, steamid, cmdLayers) }, 60 * 1000)
            this.server.once('PLAYER_CONNECTED', () => this.beginVoting());
            return;
        }

        if (this.options.votingDuration > 0) this.timeout_ps.push(setTimeout(this.endVotingGently, this.options.votingDuration * 60 * 1000))

        // these need to be reset after reenabling voting
        this.trackedVotes = {};
        this.tallies = [];

        await this.populateNominations(steamid, cmdLayers);

        this.votingEnabled = true;
        this.firstBroadcast = true;
        this.broadcastNominations();
        this.broadcastIntervalTask = setInterval(this.broadcastNominations, toMils(this.options.voteBroadcastInterval));
    }

    async endVotingGently(steamID = null) {
        if (!this.votingEnabled) return;

        const winningLayerId = this.updateNextMap();
        if (!winningLayerId) {
            this.verbose(1, 'No winning layer available', winningLayerId)
            return;
        }
        const winnerLayer = Layers.layers.find((l) => l.layerid == winningLayerId);
        const fancyWinner = this.formatFancyLayer(winnerLayer);

        // this.verbose(1, "Winning layer", winnerLayer, fancyWinner)

        if (this.options.showWinnerBroadcastMessage) this.broadcast(this.options.voteWinnerBroadcastMessage + fancyWinner);

        if (this.options.logToDiscord) {
            await this.sendDiscordMessage({
                embed: {
                    title: `Vote winner: ${fancyWinner}`,
                    color: 16761867,
                    fields: [
                        {
                            name: 'Map',
                            value: winnerLayer.map.name,
                            inline: true
                        },
                        {
                            name: 'Gamemode',
                            value: winnerLayer.gamemode,
                            inline: true
                        },
                        {
                            name: 'Version',
                            value: winnerLayer.version,
                            inline: true
                        },
                        {
                            name: 'LayerID',
                            value: winnerLayer.layerid,
                            inline: false
                        },
                        {
                            name: 'Team 1',
                            value: winnerLayer.teams[ 0 ].faction,
                            inline: true
                        },
                        {
                            name: 'Team 2',
                            value: winnerLayer.teams[ 1 ].faction,
                            inline: true
                        },
                    ],
                    image: {
                        url: `https://squad-data.nyc3.cdn.digitaloceanspaces.com/main/${winnerLayer.layerid}.jpg`
                    },
                },
                timestamp: (new Date()).toISOString()
            });
        }

        this.endVoting();
        if (steamID) await this.warn(steamID, "Voting terminated!");

        return true;
    }

    endVoting() {
        this.votingEnabled = false;
        this.broadcastIntervalTask = clearInterval(this.broadcastIntervalTask);
        this.newVoteTimeout = clearTimeout(this.newVoteTimeout);
        this.endVotingTimeout = clearTimeout(this.endVotingTimeout);
    }
    objArrToValArr(arr, ...key) {
        let vet = [];
        for (let o of arr) {
            let obj = o;
            for (let k of key) {
                if (obj[ k ])
                    obj = obj[ k ];
            }
            vet.push(obj);
        }
        return vet;
    }
    //sends a message about nominations through a broadcast
    //NOTE: max squad broadcast message length appears to be 485 characters
    //Note: broadcast strings with multi lines are very strange
    async broadcastNominations() {
        if (Date.now() - this.lastNominationBroadcast < 30_000) return;
        if (this.nominations.length > 0 && this.votingEnabled) {
            this.lastNominationBroadcast = Date.now();
            await this.broadcast(this.options.voteBroadcastMessage);
            let allNominationStrings = []
            let nominationStrings = [];

            for (let choice = 1; choice < this.nominations.length; choice++) {
                choice = Number(choice);
                let vLayer = Layers.layers.find(e => e.layerid == this.nominations[ choice ]);

                const formattedChoice = this.formatChoice(choice, this.formatFancyLayer(vLayer), this.tallies[ choice ], (this.options.hideVotesCount || this.firstBroadcast))
                nominationStrings.push(formattedChoice);
                allNominationStrings.push(formattedChoice);

                if (nominationStrings.length == 3) {
                    await this.broadcast(nominationStrings.join("\n"));
                    nominationStrings = [];
                }
            }

            if (this.nominations[ 0 ]) nominationStrings.push(this.formatChoice(0, this.nominations[ 0 ], this.tallies[ 0 ], (this.options.hideVotesCount || this.firstBroadcast)))
            await this.broadcast(nominationStrings.join("\n"));

            if (this.firstBroadcast)
                await this.logVoteToDiscord(allNominationStrings.join("\n"))
            this.firstBroadcast = false;
        }
        //const winners = this.currentWinners;
        //await this.msgBroadcast(`Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }
    formatFancyLayer(layer) {
        const factionString = this.getTranslation(layer.teams[ 0 ]) + "-" + this.getTranslation(layer.teams[ 1 ]);

        const helis = layer.teams[ 0 ].numberOfHelicopters + layer.teams[ 1 ].numberOfHelicopters
        const tanks = layer.teams[ 0 ].numberOfTanks + layer.teams[ 1 ].numberOfTanks
        let assets = [];
        if (helis > 0) assets.push('Helis');
        if (tanks > 0) assets.push('Tanks');
        const vehiclesString = assets.join('-');

        return this.options.entryFormat
            .replace(/\{map_name\}/i, layer.map.name.replace(new RegExp(`${layer.mod} ?`), ''))
            .replace(/\{gamemode\}/i, layer.gamemode)
            .replace(/\{map_version\}/i, layer.version)
            .replace(/\{version\}/i, layer.version)
            .replace(/\{factions\}/i, factionString)
            .replace(/\{main_assets\}/i, vehiclesString)
            .replace(/\{time\}/i, layer.time || '')
    }

    getLayersFromStringId(stringid, findLayer) {
        stringid = stringid.toUpperCase();
        this.options.gamemodeWhitelist = this.options.gamemodeWhitelist.map(e => e.toUpperCase());
        // this.verbose(1, 'Looking for layer', stringid)
        const cls = stringid.split('_');

        let ret;
        const findOrFilter = findLayer ? 'find' : 'filter';

        if (stringid.match(/^\/.+\/$/)) {
            const reg = new RegExp(stringid.replace(/^\//, '').replace(/\/.{0,}$/, ''), 'i')
            ret = Layers.layers[ findOrFilter ](l => l.layerid.match(reg))
        } else {
            if (cls.length <= 3) ret = Layers.layers[ findOrFilter ]((l) => (
                (
                    !findLayer || findLayer.layerid == l.layerid
                )
                && (
                    (cls[ 0 ] == "*" || l.layerid.toUpperCase().startsWith(cls[ 0 ]))
                    || (cls[ 0 ].startsWith('F:') && [ this.getTranslation(l.teams[ 0 ])?.toUpperCase(), this.getTranslation(l.teams[ 1 ])?.toUpperCase() ].includes(cls[ 0 ].substring(2)))
                )
                && (
                    l.gamemode?.toUpperCase().startsWith(cls[ 1 ]) || ((!cls[ 1 ] || cls[ 1 ] == '*') && this.options.gamemodeWhitelist.find(g => g.toUpperCase() == l.gamemode?.toUpperCase()))
                )
                && (
                    (!cls[ 2 ] || cls[ 2 ] == '*') || parseInt(l.version.replace(/v(0*)/i, '')) == parseInt(cls[ 2 ].replace(/v(0*)/i, ''))
                )
            ));
            else ret = Layers.layers[ findOrFilter ]((l) => ((cls[ 0 ] == "*" || l.mod?.toUpperCase().startsWith(cls[ 0 ].toUpperCase())) && (cls[ 1 ] == "*" || l.map.name.toUpperCase().startsWith(cls[ 1 ])) && (l.gamemode?.toUpperCase().startsWith(cls[ 2 ]) || (!cls[ 2 ] && this.options.gamemodeWhitelist.includes(l.gamemode?.toUpperCase()))) && (!cls[ 3 ] || parseInt(l.version.toUpperCase().replace(/v(0*)/i, '')) == parseInt(cls[ 3 ].replace(/v(0*)/i, ''))) && (!cls[ 4 ] || cls[ 4 ] == l.layerid.split('_')[ 4 ]?.toUpperCase())))
        }
        // this.verbose(1,"layers from string",stringid,cls,ret)
        return ret;
    }

    async directMsgNominations(steamID) {
        let strMsg = "";
        for (let choice in this.nominations) {
            choice = Number(choice);

            // let vLayer = Layers.layers.find(e => e.layerid == this.nominations[ choice ]);
            // const allVecs = vLayer.teams[0].vehicles.concat(vLayer.teams[1].vehicles);
            // const helis = vLayer?.teams[ 0 ].numberOfHelicopters || 0 + vLayer?.teams[ 1 ].numberOfHelicopters || 0
            // const tanks = vLayer?.teams[ 0 ].numberOfTanks || 0 + vLayer?.teams[ 1 ].numberOfTanks || 0
            // let assets = [];
            // if (helis > 0) assets.push('Helis');
            // if (tanks > 0) assets.push('Tanks');
            // const vehiclesString = ' ' + assets.join('-');
            // await this.msgDirect(steamID, formatChoice(choice, this.nominations[ choice ], this.tallies[ choice ]));
            strMsg += (steamID, this.formatChoice(choice, this.nominations[ choice ], this.tallies[ choice ])) + "\n";
        }
        strMsg.trim();
        if (steamID) this.warn(steamID, strMsg)
        else this.verbose(1, 'Unable to warn due to null steamID')
        // const winners = this.currentWinners;
        // await this.msgDirect(steamID, `Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }

    //counts a vote from a player and adds it to tallies
    async registerVote(steamID, nominationIndex, playerName) {
        // nominationIndex -= 1; // shift indices from display range
        if (nominationIndex < 0 || nominationIndex > this.nominations.length) {
            await this.warn(steamID, `[Map Vote] ${playerName}: invalid map number, typ !vote results to see map numbers`);
            return;
        }

        const previousVote = this.trackedVotes[ steamID ];
        this.trackedVotes[ steamID ] = nominationIndex;

        this.tallies[ nominationIndex ] += 1;
        if (previousVote !== undefined)
            this.tallies[ previousVote ] -= 1;
        await this.warn(steamID, `Registered vote: ${this.nominations[ nominationIndex ].replace(/\_/gi, ' ').replace(/\sv\d{1,2}/gi, '')} ${this.factionStrings[ nominationIndex ]} ` + (this.options.hideVotesCount ? `` : `(${this.tallies[ nominationIndex ]} votes)`));

        if (!this.DBLogPlugin) return;

        const votedLayer = Layers.layers.find(l => l.layerid == this.nominations[ nominationIndex ]);
        const matchId = this.DBLogPlugin?.match?.id || 0;
        // this.verbose(1, 'DBLogPlugin', this.DBLogPlugin)

        await this.models.PlayerVotes.destroy({
            where: {
                match: +matchId,
                playerSteamID: steamID
            }
        })

        await this.models.PlayerVotes.create({
            server: +this.options.overrideServerID || +this.server.id,
            level: votedLayer.map.name,
            gamemode: votedLayer.gamemode,
            version: +votedLayer.version.replace(/v(0*)/, ''),
            layerid: votedLayer.layerid,
            mod: votedLayer.mod || '',
            match: +matchId,
            playerSteamID: steamID
        }).catch(e => {
            this.verbose(1, 'Could not create player vote record in database. Error:', e)
        })

        // await this.msgDirect(steamID, `Registered vote`);// ${this.nominations[ nominationIndex ]} ${this.factionStrings[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.nominations[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.factionStrings[ nominationIndex ]}`);
        // await this.msgDirect(steamID, `${this.tallies[ nominationIndex ]} votes`);
    }

    async getLayerHistoryForLevel(level, length = 10) {
        if (!this.DBLogPlugin) {
            this.verbose(1, 'DBLog plugin not found, unable to find layer history for level:', level)
            return;
        };

        const history = this.DBLogPlugin.models.Match.findAll({
            where: {
                layerClassname: {
                    [ Op.like ]: `${level}%`,
                }
            },
            limit: length,
            order: [
                [ 'id', 'DESC' ]
            ]
        })

        return history;
    }

    async logVoteToDiscord(message) {
        if (!this.options.logToDiscord) return
        return await this.sendDiscordMessage({
            embed: {
                title: 'Vote Started',
                color: 16761867,
                fields: [
                    {
                        name: 'Options:',
                        value: `${message}`
                    }
                ]
            },
            timestamp: (new Date()).toISOString()
        });
    }

    //removes a players vote if they disconnect from the sever
    clearVote() {
        const currentPlayers = this.server.players.map((p) => p.steamID);
        for (const steamID in this.trackedVotes) {
            if (!(currentPlayers.includes(steamID))) {
                const vote = this.trackedVotes[ steamID ];
                this.tallies[ vote ] -= 1;
                delete this.trackedVotes[ steamID ];
            }
        }
    }

    restorePersistentData() {
        this.verbose(1, `Restoring persistent data from: ${this.options.persistentDataFile}`)

        if (this.options.persistentDataFile == "") return;

        if (!fs.existsSync(this.options.persistentDataFile)) return;

        let bkData = fs.readFileSync(this.options.persistentDataFile);
        if (bkData == "") return;

        try {
            bkData = JSON.parse(bkData)
        } catch (e) {
            this.verbose(1, "Error restoring persistent data", e)
            return
        }
        if (bkData.manualRestartSender && bkData.manualRestartSender != "") {
            (async () => {
                await this.warn(bkData.manualRestartSender, `SquadJS has completed the restart.\nPersistent data restored.`)
                this.verbose(1, `Restart confirmation sent to SteamID: "${bkData.manualRestartSender}"`)
            })()
        }

        for (let k in bkData.server) this.server[ k ] = bkData.server[ k ];

        const maxSecondsDiffierence = 180
        if ((new Date() - new Date(bkData.saveDateTime)) / 1000 > maxSecondsDiffierence) return

        this.verbose(1, "Restoring data:", bkData)

        // if (bkData.custom.layerHistory) this.server.layerHistory = Layers.layers.filter(l => bkData.custom.layerHistory.includes(l.layerid));
        this.verbose(1, "Recently played maps: " + this.server.layerHistory.map((l) => l.layer?.map?.name).join(', '))

        for (let k in bkData.plugin) this[ k ] = bkData.plugin[ k ];
        if (this.votingEnabled) {
            this.broadcastIntervalTask = setInterval(this.broadcastNominations, toMils(this.options.voteBroadcastInterval));
        }
    }


    savePersistentData(steamID = null) {
        if (this.options.persistentDataFile == "") return;

        const saveDt = {
            custom: {
                // layerHistory: this.server.layerHistory.slice(0, this.options.numberRecentMapsToExlude * 2).filter(l => l && l.layerid).map(l => l.layerid),
            },
            server: {
                layerHistory: this.server.layerHistory.slice(0, 10)
            },
            plugin: {
                nominations: this.nominations,
                trackedVotes: this.trackedVotes,
                tallies: this.tallies,
                votingEnabled: this.votingEnabled,
                factionStrings: this.factionStrings,
                firstBroadcast: this.firstBroadcast
            },
            manualRestartSender: steamID,
            saveDateTime: new Date()
        }
        // this.verbose(1, `Saving persistent data to: ${this.options.persistentDataFile}\n`, saveDt.server.layerHistory)

        fs.writeFileSync(this.options.persistentDataFile, JSON.stringify(saveDt, null, 2))
    }

    //calculates the current winner(s) of the vote and returns thier strings in an array
    get currentWinners() {
        const ties = [];

        let highestScore = -Infinity;
        const allScoreZero = this.tallies.find(s => s > 0) ? false : true;
        for (let choice in this.tallies) {
            const score = this.tallies[ choice ];
            if (score >= this.options.minimumVotesToAcceptResult || allScoreZero) {
                if (score < highestScore)
                    continue;
                else if (score > highestScore) {
                    highestScore = score;
                    ties.length = 0;
                    ties.push(choice);
                }
                else // equal
                    ties.push(choice);
            }
            this.verbose(1, 'Ties', ties, ties.map(i => this.nominations[ i ]))
        }

        return ties.map(i => this.nominations[ i ]);
    }

    async updateLayerList() {
        // Layers.layers = [];

        if (!Layers.layers instanceof Array) {
            this.verbose(1, `Could not update layer list. Re-trying in 1 second.`)
            setTimeout(this.updateLayerList, 1000);
            return;
        }

        this.verbose(1, 'Pulling updated layer list...');
        const response = await axios.get(
            'https://raw.githubusercontent.com/Squad-Wiki/squad-wiki-pipeline-map-data/master/completed_output/_Current%20Version/finished.json'
        );

        for (const layer of response.data.Maps) {
            if (!Layers.layers.find((e) => e.layerid == layer.rawName)) Layers.layers.push(new Layer(layer));
        }

        const gSheetUrlSanitized = this.options.OWIMapLayerGSheetUrl
            .match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\/]+/)[ 0 ]
            + '/gviz/tq?tqx=out:csv&sheet=Map%20Layers'

        const sheetCsv = (await axios.get(gSheetUrlSanitized), { timeout: 5000 }).data?.replace(/\"/g, '')?.split('\n') || []//.map((l) => l.split(','))
        // this.verbose(1, 'Sheet', sheetCsv)
        sheetCsv.shift();
        // this.verbose(1, 'Sheet', Layers.layers.length, sheetCsv.length, sheetCsv.find(l => l.includes("Manicouagan_RAAS_v1")))

        this.rconLayers = await this.server.rcon.execute('ListLayers')
        let rconLayers = this.rconLayers.split('\n') || [];
        rconLayers.shift();

        if (rconLayers.length > 0) {
            for (const rawLayer of rconLayers) {
                const layer = rawLayer.split(' ')[ 0 ];
                const versionRegex = /_v0(\d)$/i;
                const versionMatching = layer.match(versionRegex);
                const versionNumber = !!versionMatching ? +versionMatching[ 1 ] : null;

                const existingLayer = Layers.layers.find((e,) => e?.layerid == layer || (!!versionNumber && e?.layerid == layer.replace(versionRegex, `_v${versionNumber}`)));
                // if (layer == "Manicouagan_RAAS_v01") this.verbose(1, 'Layer', existingLayer)

                const genLayer = this.mapLayer(rawLayer);

                if (!genLayer) {
                    this.verbose(1, `Unable to parse: ${layer}`)
                    continue;
                }

                if (existingLayer && genLayer) {
                    if (layer != existingLayer.layerid) existingLayer.layerid = layer

                    for (let propKey in genLayer)
                        if ([ undefined, null ].includes(existingLayer[ propKey ])) {
                            // this.verbose(1, `Updating layer "${layer}" missing property "${propKey}": ${genLayer[ propKey ]}`)
                            existingLayer[ propKey ] = genLayer[ propKey ];
                        }

                    if (existingLayer.version == "TBD") existingLayer.version = genLayer.version
                }


                let newLayer = existingLayer || genLayer
                // if(layer.startsWith('GC')) this.verbose(1, 'layer', newLayer)
                if (!newLayer) continue;

                if (sheetCsv.length > 0) {
                    const csvLayer = sheetCsv.find(l => l.includes(newLayer?.layerid))?.split(',');
                    // this.verbose(1,'Newlayer', newLayer)
                    // console.log(newLayer.layerid, csvLayer);
                    if (csvLayer) {
                        if (csvLayer[ 8 ]) newLayer.teams[ 0 ].faction = csvLayer[ 8 ]
                        newLayer.teams[ 0 ].name = newLayer.teams[ 0 ].faction
                        if (csvLayer[ 10 ]) newLayer.teams[ 0 ].numberOfTanks = parseNumberOfAssets(csvLayer[ 10 ])
                        if (csvLayer[ 11 ]) newLayer.teams[ 0 ].numberOfHelicopters = parseNumberOfAssets(csvLayer[ 11 ])
                        if (csvLayer[ 7 ]) newLayer.teams[ 0 ].commander = csvLayer[ 7 ].toLowerCase() == 'yes'

                        if (csvLayer[ 12 ]) newLayer.teams[ 1 ].faction = csvLayer[ 12 ]
                        newLayer.teams[ 1 ].name = newLayer.teams[ 1 ].faction
                        newLayer.teams[ 1 ].numberOfTanks = newLayer.teams[ 0 ].numberOfTanks
                        newLayer.teams[ 1 ].numberOfHelicopters = newLayer.teams[ 0 ].numberOfHelicopters
                        newLayer.teams[ 1 ].commander = newLayer.teams[ 0 ].commander
                    }
                }

                if (Layers._layers && Layers._layers instanceof Map)
                    Layers._layers.set(newLayer.layerid, newLayer);
                else if (!existingLayer)
                    Layers.layers.push(newLayer);
            }
        }

        // Layers.layers = Layers.layers.filter(layer => rconLayers.find(l => l.toLowerCase().startsWith(layer.layerid?.toLowerCase())))

        this.verbose(1, 'Layer list updated', Layers.layers.length, 'total layers');
        // this.verbose(1, 'Layers', Layers.layers.filter(l => l.layerid.startsWith('GC')));

        function parseNumberOfAssets(string) {
            if (string.trim() == '') return 0;
            // console.log('Assets', string)
            return /^x?(\d+)/.exec(string)[ 1 ]
        }
    }

    mapLayer(layerid) {
        const l = layerid.replace(/Whitebox_Test/i, 'Whitebox');

        const layerIdParsers = [
            /^(?<level>[^_]+)_(?<gamemode>[^_]+)_(?<version>v\d+)?$/i,
            /^(?<mod>[^_]+)_(?<level>Talil_Outskirts|(?:[^_]+))_(?<gamemode>[^_]+)_(?<time>[^_]+)_(?<team1>[a-z]+)v(?<team2>[a-z]+) \(Steel_Division\)/i,
            /^(?<level>[^_]+)_(?<gamemode>[^_]+)_(?<version>.+)_(?<mod>[^_]+) \(SquadOriginal\)/,
            /^(?<mod>[^_]+)_(?<level>[^_]+)_(?<gamemode>[^_]+)_(?<version>.+)/i
        ]

        let gl;

        for(let reg of layerIdParsers){
            gl = reg.exec(l)?.groups;
            if(gl) break;
        }

        // this.verbose(1, 'Parsed layer', l, gl)
        if (!gl || Object.keys(gl).length < 3) return;

        if (!gl.level) this.verbose(1, 'Empty level', gl)

        let teams = []
        for (const t of [ 'team1', 'team2' ]) {
            teams.push({
                faction: gl[ t ] || 'Unknown',
                name: gl[ t ] || 'Unknown',
                tickets: 0,
                commander: false,
                vehicles: [],
                numberOfTanks: 0,
                numberOfHelicopters: 0
            });
        }
        // this.verbose(1, 'teams', teams)

        const finLayerId = layerid.split(' ')[ 0 ];

        if (gl.time)
            if (gl.time == 'D') gl.time = 'Day'
            else gl.time = 'Night'

        return {
            name: l.split(' ')[ 0 ].replace(/_/g, ' '),
            classname: finLayerId,
            layerid: finLayerId,
            map: {
                name: gl.level
            },
            mod: gl.mod || '',
            gamemode: gl.gamemode,
            version: gl.version,
            size: '0.0x0.0 km',
            sizeType: 'Playable Area',
            numberOfCapturePoints: 0,
            time: gl.time,
            lighting: {
                name: 'Unknown',
                classname: 'Unknown'
            },
            teams: teams
        }
    }

    formatChoice(choiceIndex, mapString, currentVotes, hideVoteCount) {
        let entryIndex = `${choiceIndex}➤ `;
        if (this.options.hideEntryIndex) entryIndex = "";
        return `${entryIndex}${mapString} ` + (!hideVoteCount ? `(${currentVotes})` : "");
        // return `${choiceIndex + 1}❱ ${mapString} (${currentVotes} votes)`
    }

    /**
     * 
     * @param {any[][]} regexArray 
     * @returns {string}
     */
    readLinesReverse(regexArray) {
        const filePath = this.logsFilePath;
        const fd = fs.openSync(filePath, 'r');
        const bufferSize = 1024;
        let buffer = Buffer.alloc(bufferSize);
        let leftOver = '';
        let bytesRead;
        let position = fs.statSync(filePath).size - bufferSize;
        let result = false;

        while (position > -1) {
            bytesRead = fs.readSync(fd, buffer, 0, bufferSize, position);
            const text = buffer.slice(0, bytesRead).toString() + leftOver;
            let arr = text.split('\n');
            // @ts-ignore
            leftOver = arr.shift();
            arr.reverse();

            for (const line of arr) {
                for (const regex of regexArray) {
                    // @ts-ignore
                    result = line.match(regex[ 0 ])
                    if (result) {
                        result = result[ regex[ 1 ] ].trim();
                        break;
                    }
                }
                if (result) break;
            }

            if (result) break;
            position -= bufferSize;
        }

        if (!result && leftOver) {
            for (const regex of regexArray) {
                // @ts-ignore
                result = leftOver.match(regex[ 0 ]);
                if (result) {
                    result = result[ regex[ 1 ] ].trim();
                    break;
                }
            }
        }

        fs.closeSync(fd);
        // @ts-ignore
        return result;
    }
    /**
     * 
     * @returns {String}
     */
    getCurrentLayer() {
        const regexes = [
            [ /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/, 2 ],
            [ /\[(.+)\].+LogWorld: SeamlessTravel to: .+\/([^\/]+)$/, 2 ]
        ]
        const res = this.readLinesReverse(regexes);
        // @ts-ignore
        this.verbose(1, 'Current Layer', res)
        this.setCurrentLayer(res)
        return res;
    }

    setCurrentLayer(layer) {
        this.server.currentLayer = Layers.layers.find(l => l.layerid == layer)
    }

    onLogLine(line) {
        let regMatch;

        regMatch = line.match(/\[(.+)\].+LogWorld: SeamlessTravel to: .+\/([^\/]+)$/)
        if (regMatch) return this.setCurrentLayer(regMatch[ 2 ])
    }
}

function randomElement(array) {
    return array[ Math.floor(Math.random() * array.length) ];
}

function toMils(min) {
    return min * 60 * 1000;
}

const translations = {
    // 'United States Army': "USA",
    // 'United States Marine Corps': "USMC",
    // 'Russian Ground Forces': "RUS",
    // 'British Army': "GB",
    // 'British Armed Forces': "GB",
    // 'Canadian Army': "CAF",
    // 'Australian Defence Force': "AUS",
    // 'Irregular Militia Forces': "MIL",
    // 'Middle Eastern Alliance': "MEA",
    // 'Insurgent Forces': "INS",
    'Russian Airborne Forces': "VDV",
    'Unknown': "Unk"
}