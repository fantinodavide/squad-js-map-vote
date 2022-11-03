//Plugin reworked by JetDave, original version by MaskedMonkeyMan

// import BasePlugin from "./base-plugin.js";
import DiscordBasePlugin from './discord-base-plugin.js';

import fs from "fs";
import { Layers } from "../layers/index.js"
import axios from "axios"
import { time } from 'console';

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
            minRaasEntries: {
                required: false,
                description: 'Minimum amount of RAAS layers in the vote list.',
                default: 2
            },
            hideVotesCount: {
                required: false,
                description: 'hides the number of votes a layer received in broadcast message',
                default: false
            },
            showRerollOption: {
                required: false,
                description: 'vote option to restart the vote with random entries',
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
            allowedSameMapEntries: {
                required: false,
                description: 'Allowed NUMBER of duplicate map entries in vote list',
                default: 1
            },
            logToDiscord: {
                required: false,
                description: 'Enables/disables vote logging to Discord',
                default: false
            },
            channelID: {
                required: false,
                description: 'The ID of the channel to log votes to.',
                default: '',
                example: '112233445566778899'
            },
            timezone: {
                required: false,
                description: "Timezone relative to UTC time. 0 for UTC, 2 for CEST (UTC+2), -1 (UTC-1) ",
                default: 0
            },
            timeFrames: {
                required: false,
                description: 'Array of timeframes to override options',
                default: []
            },
            voteLengthSeconds: {
                required: false,
                description: 'Seconds for vote to last before ending. 0 to disable feature.',
                default: 0
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.options.timeFrames.forEach((e, key, arr) => { arr[ key ].id = key + 1 });

        this.voteRules = {}; //data object holding vote configs
        this.nominations = []; //layer strings for the current vote choices
        this.trackedVotes = {}; //player votes, keyed by steam id
        this.tallies = []; //votes per layer, parellel with nominations
        this.votingEnabled = false;
        this.onConnectBound = false;
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
        this.timeout_ps = []

        this.onNewGame = this.onNewGame.bind(this);
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
        this.onChatMessage = this.onChatMessage.bind(this);
        this.broadcastNominations = this.broadcastNominations.bind(this);
        this.beginVoting = this.beginVoting.bind(this);
        this.setSeedingMode = this.setSeedingMode.bind(this);
        this.logVoteToDiscord = this.logVoteToDiscord.bind(this);
        this.timeframeOptionOverrider = this.timeframeOptionOverrider.bind(this);

        this.broadcast = (msg) => { this.server.rcon.broadcast(msg); };
        this.warn = (steamid, msg) => { this.server.rcon.warn(steamid, msg); };
    }

    async mount() {
        this.server.on('NEW_GAME', this.onNewGame);
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        setTimeout(() => {
            this.verbose(1, 'Enabled late listeners.');
            this.server.on('PLAYER_CONNECTED', this.setSeedingMode);
        }, 10 * 1000) // wait 10 seconds to be sure to have an updated player list
        this.verbose(1, 'Map vote was mounted.');
        this.verbose(1, "Blacklisted Layers/Levels: " + this.options.layerLevelBlacklist.join(', '))
        // await this.checkUpdates();
        this.timeframeOptionOverrider();
        setInterval(this.timeframeOptionOverrider, 1 * 60 * 1000)
    }

    async unmount() {
        this.server.removeEventListener('NEW_GAME', this.onNewGame);
        this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
        this.server.removeEventListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        clearInterval(this.broadcastIntervalTask);
        this.verbose(1, 'Map vote was un-mounted.');
    }

    async onNewGame() {
        for (let x of this.timeout_ps) clearTimeout(this.timeout_ps.pop())
        setTimeout(async () => {
            this.endVoting();
            this.trackedVotes = {};
            this.tallies = [];
            this.nominations = [];
            this.factionStrings = [];
            if (this.options.automaticVoteStart) this.autovotestart = setTimeout(this.beginVoting, toMils(this.options.voteWaitTimeFromMatchStart));
            setTimeout(() => this.setSeedingMode(true), 10000);
        }, 10000)
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
    setSeedingMode(isNewGameEvent = false) {
        // setTimeout(()=>{this.msgDirect('76561198419229279',"MV\ntest\ntest")},1000)
        // this.msgBroadcast("[MapVote] Seeding mode active")
        const baseDataExist = this && this.options && this.server && this.server.players;
        if (baseDataExist) {
            this.verbose(1, "Checking seeding mode");
            if (this.options.automaticSeedingMode) {
                if (this.server.players.length >= 1 && this.server.players.length < 40) {
                    const seedingMaps = Layers.layers.filter((l) => l.layerid && l.gamemode.toUpperCase() == "SEED" && !this.options.layerLevelBlacklist.find((fl) => l.layerid.toLowerCase().startsWith(fl.toLowerCase())))

                    const rndMap = randomElement(seedingMaps);
                    if (this.server.currentLayer) {
                        if (this.server.currentLayer.gamemode.toLowerCase() != "seed") {
                            if (this.server.players.length <= 5) {
                                const newCurrentMap = rndMap.layerid;
                                this.verbose(1, 'Going into seeding mode.');
                                this.server.rcon.execute(`AdminChangeLayer ${newCurrentMap} `);
                            }
                        }
                    } else this.verbose(1, "Bad data (currentLayer). Seeding mode for current layer skipped to prevent errors.");

                    if (this.server.nextLayer) {
                        const nextMaps = seedingMaps.filter((l) => (!this.server.currentLayer || l.layerid != this.server.currentLayer.layerid))
                        let rndMap2;
                        do rndMap2 = randomElement(nextMaps);
                        while (rndMap2.layerid == rndMap.layerid)

                        if (isNewGameEvent && this.server.players.length < 20 && this.server.nextLayer.gamemode.toLowerCase() != "seed") {
                            const newNextMap = rndMap2.layerid;
                            this.server.rcon.execute(`AdminSetNextLayer ${newNextMap} `);
                        }
                    } else this.verbose(1, "Bad data (nextLayer). Seeding mode for next layer skipped to prevent errors.");

                } else this.verbose(1, `Player count doesn't allow seeding mode (${this.server.players.length}/20)`);
            } else this.verbose(1, "Seeding mode disabled in config");
        } else console.log("[MapVote][1] Bad data (this/this.server/this.options). Seeding mode skipped to prevent errors.");
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

        const isAdmin = info.chat === "ChatAdmin";
        switch (subCommand) // select the sub command
        {
            case "choices": //sends choices to player in the from of a warning
            case "results": //sends player the results in a warning
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.directMsgNominations(steamID);
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
                this.endVotingGently();
                await this.warn(steamID, "Ending current vote");
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
                if (!this.votingEnabled) {
                    await this.warn(steamID, "There is no vote running right now");
                    return;
                }
                this.broadcastNominations();
                return;
            case "help": //displays available commands
                let msg = "";
                msg += (`!vote\n > choices\n > results\n`);
                if (isAdmin) msg += (`\n Admin only:\n > start\n > restart\n > cancel\n > broadcast`);

                await this.warn(steamID, msg + `\nMapVote SquadJS plugin built by JetDave`);
                return;
            default:
                //give them an error
                await this.warn(steamID, `Unknown vote subcommand: ${subCommand}`);
                return;
        }

    }

    updateNextMap() //sets next map to current mapvote winner, if there is a tie will pick at random
    {
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
            if (baseDataExist && (!layerDataExist || this.server.nextLayer.layerid != nextMap))
                this.server.rcon.execute(`AdminSetNextLayer ${nextMap}`);
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
    populateNominations(steamid = null, cmdLayers = [], bypassRaasFilter = false) //gets nomination strings from layer options
    {
        this.options.gamemodeWhitelist.forEach((e, k, a) => a[ k ] = e.toUpperCase());
        // this.nominations.push(builtLayerString);
        // this.tallies.push(0);

        const translations = {
            'United States Army': "USA",
            'United States Marine Corps': "USMC",
            'Russian Ground Forces': "RUS",
            'British Army': "GB",
            'Canadian Army': "CAF",
            'Australian Defence Force': "AUS",
            'Irregular Militia Forces': "IRR",
            'Middle Eastern Alliance': "MEA",
            'Insurgent Forces': "INS",
        }

        this.nominations = [];
        this.tallies = [];
        this.factionStrings = [];
        let rnd_layers = [];
        // let rnd_layers = [];
        const sanitizedLayers = Layers.layers.filter((l) => l.layerid && l.map);
        const maxOptions = this.options.showRerollOption ? 5 : 6;
        if (!cmdLayers || cmdLayers.length == 0) {
            const recentlyPlayedMaps = this.objArrToValArr(this.server.layerHistory.splice(0, this.options.numberRecentMapsToExlude), "layer", "map", "name");
            this.verbose(1, "Recently played maps: " + recentlyPlayedMaps.join(', '))

            const all_layers = sanitizedLayers.filter((l) =>
                this.options.gamemodeWhitelist.includes(l.gamemode.toUpperCase()) &&
                ![ this.server.currentLayer ? this.server.currentLayer.map.name : null, ...recentlyPlayedMaps ].includes(l.map.name) &&
                (
                    (this.options.layerFilteringMode.toLowerCase() == "blacklist" && !this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))) ||
                    (
                        this.options.layerFilteringMode.toLowerCase() == "whitelist"
                        && this.options.layerLevelWhitelist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid))
                        && !(this.options.applyBlacklistToWhitelist && this.options.layerLevelBlacklist.find((fl) => this.getLayersFromStringId(fl).map((e) => e.layerid).includes(l.layerid)))
                    )
                )
            );
            for (let i = 1; i <= maxOptions; i++) {
                const needMoreRAAS = !bypassRaasFilter && rnd_layers.filter((l) => l.gamemode === 'RAAS').length < this.options.minRaasEntries;
                let l, maxtries = 20;
                do l = randomElement(needMoreRAAS ? all_layers.filter((l) => l.gamemode.toLowerCase() == "raas") : all_layers); while ((rnd_layers.find(lf => lf.layerid == l.layerid) || rnd_layers.filter(lf => lf.map.name == l.map.name).length > (this.options.allowedSameMapEntries - 1)) && --maxtries >= 0)
                if (maxtries > 0 && l) {
                    // this.verbose(1,"Testing layer",l, maxtries);
                    rnd_layers.push(l);
                    this.nominations[ i ] = l.layerid
                    this.tallies[ i ] = 0;
                    this.factionStrings[ i ] = getTranslation(l.teams[ 0 ]) + "-" + getTranslation(l.teams[ 1 ]);
                }
            }
            // if (!bypassRaasFilter && this.options.gamemodeWhitelist.includes("RAAS") && rnd_layers.filter((l) => l.gamemode === 'RAAS').length < Math.floor(maxOptions / 2)) this.populateNominations();
            if (this.nominations.length == 0) {
                this.populateNominations(steamid, cmdLayers, bypassRaasFilter);
                return;
            }
        } else {
            let singleGamemodeVote = false;
            if (cmdLayers.length == 1 && cmdLayers[ 0 ].split('_')[ 0 ] == "*") {
                singleGamemodeVote = true;
                for (let i = 0; i < maxOptions; i++) cmdLayers.push(cmdLayers[ 0 ])
            }
            if (singleGamemodeVote || cmdLayers.length <= maxOptions) {
                let i = 1;
                for (let cl of cmdLayers) {
                    const cls = cl.split('_');
                    const fLayers = sanitizedLayers.filter((l) => ((cls[ 0 ] == "*" || l.layerid.toLowerCase().startsWith(cls[ 0 ])) && (l.gamemode.toLowerCase().startsWith(cls[ 1 ]) || (!cls[ 1 ] && [ 'RAAS', 'AAS', 'INVASION' ].includes(l.gamemode.toUpperCase()))) && (!cls[ 2 ] || l.version.toLowerCase().startsWith("v" + cls[ 2 ].replace(/v/gi, '')))));
                    let l, maxtries = 10;
                    do l = randomElement(fLayers); while ((rnd_layers.filter(lf => lf.map.name == l.map.name).length > (this.options.allowedSameMapEntries - 1)) && --maxtries >= 0)
                    if (l) {
                        rnd_layers.push(l);
                        this.nominations[ i ] = l.layerid
                        this.tallies[ i ] = 0;
                        this.factionStrings[ i ] = getTranslation(l.teams[ 0 ]) + "-" + getTranslation(l.teams[ 1 ]);
                        i++;
                    }
                }
            }
            else if (steamid) {
                this.warn(steamid, "You cannot start a vote with more than " + maxOptions + " options");
                return;
            }
        }

        if (this.options.showRerollOption) {
            if (this.nominations.length > 5) {
                this.nominations.splice(6, 1);
                this.tallies.splice(6, 1);
                this.factionStrings.splice(6, 1);
            }

            this.newVoteOptions.steamid = steamid;
            this.newVoteOptions.bypassRaasFilter = bypassRaasFilter;
            this.newVoteOptions.cmdLayers = cmdLayers;

            this.nominations[ 0 ] = "Reroll vote list with random options"
            this.tallies[ 0 ] = 0;
            this.factionStrings[ 0 ] = "";

        }

        function getTranslation(t) {
            if (translations[ t.faction ]) return translations[ t.faction ]
            else {
                const f = t.faction.split(' ');
                let fTag = "";
                f.forEach((e) => { fTag += e[ 0 ] });
                return fTag.toUpperCase();
            }
        }
    }

    //checks if there are enough players to start voting, if not binds itself to player connected
    //when there are enough players it clears old votes, sets up new nominations, and starts broadcast
    beginVoting(force = false, steamid = null, cmdLayers = []) {
        this.verbose(1, "Starting vote")
        const playerCount = this.server.players.length;
        const minPlayers = this.options.minPlayersForVote;

        if (this.votingEnabled) //voting has already started
            return;

        if (playerCount < minPlayers && !force) {
            this.autovotestart = setTimeout(() => { this.beginVoting(force, steamid, cmdLayers) }, 60 * 1000)
            return;
        }

        if (this.options.votingDuration > 0) this.timeout_ps.push(setTimeout(this.endVotingGently, this.options.votingDuration * 60 * 1000))

        // these need to be reset after reenabling voting
        this.trackedVotes = {};
        this.tallies = [];

        this.populateNominations(steamid, cmdLayers);

        this.votingEnabled = true;
        this.firstBroadcast = true;
        this.broadcastNominations();
        this.broadcastIntervalTask = setInterval(this.broadcastNominations, toMils(this.options.voteBroadcastInterval));
        if (this.options.voteLengthSeconds > 0) {
            setTimeout(async () => {
                this.endVotingAsync();
            }, this.options.voteLengthSeconds * 1000)
        }
    }

    async endVotingAsync() {
        this.endVotingGently();
        await this.logWinnerToDiscord(this.options.voteWinnerBroadcastMessage + this.formatFancyLayer(Layers.layers.find((l) => l.layerid == this.updateNextMap())))
    }

    endVotingGently() {
        this.endVoting();
        this.broadcast(this.options.voteWinnerBroadcastMessage + this.formatFancyLayer(Layers.layers.find((l) => l.layerid == this.updateNextMap())));
    }

    endVoting() {
        this.votingEnabled = false;
        clearInterval(this.broadcastIntervalTask);
        clearTimeout(this.newVoteTimeout);
        this.newVoteTimeout = null;
        this.broadcastIntervalTask = null;
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
        if (this.nominations.length > 0 && this.votingEnabled) {
            await this.broadcast(this.options.voteBroadcastMessage);
            let nominationStrings = [];
            for (let choice = 1; choice < this.nominations.length; choice++) {
                choice = Number(choice);
                let vLayer = Layers.layers.find(e => e.layerid == this.nominations[ choice ]);
                nominationStrings.push(formatChoice(choice, vLayer.map.name + ' ' + vLayer.gamemode + ' ' + this.factionStrings[ choice ], this.tallies[ choice ], (this.options.hideVotesCount || this.firstBroadcast)));
            }
            if (this.nominations[ 0 ]) nominationStrings.push(formatChoice(0, this.nominations[ 0 ], this.tallies[ 0 ], (this.options.hideVotesCount || this.firstBroadcast)))
            await this.broadcast(nominationStrings.join("\n"));

            if (this.firstBroadcast)
                await this.logVoteToDiscord(nominationStrings.join("\n"))
            this.firstBroadcast = false;
        }
        //const winners = this.currentWinners;
        //await this.msgBroadcast(`Current winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`);
    }
    formatFancyLayer(layer) {
        const translations = {
            'United States Army': "USA",
            'United States Marine Corps': "USMC",
            'Russian Ground Forces': "RUS",
            'British Army': "GB",
            'Canadian Army': "CAF",
            'Australian Defence Force': "AUS",
            'Irregular Militia Forces': "IRR",
            'Middle Eastern Alliance': "MEA",
            'Insurgent Forces': "INS",
        }
        const factionString = getTranslation(layer.teams[ 0 ]) + "-" + getTranslation(layer.teams[ 1 ]);

        return layer.map.name + ' ' + layer.gamemode + ' ' + factionString

        function getTranslation(t) {
            if (translations[ t.faction ]) return translations[ t.faction ]
            else {
                const f = t.faction.split(' ');
                let fTag = "";
                f.forEach((e) => { fTag += e[ 0 ] });
                return fTag.toUpperCase();
            }
        }
    }

    getLayersFromStringId(stringid) {
        const cls = stringid.toLowerCase().split('_');
        const ret = Layers.layers.filter((l) => ((cls[ 0 ] == "*" || l.layerid.toLowerCase().startsWith(cls[ 0 ])) && (l.gamemode.toLowerCase().startsWith(cls[ 1 ]) || (!cls[ 1 ] && [ 'RAAS', 'AAS', 'INVASION' ].includes(l.gamemode.toUpperCase()))) && (!cls[ 2 ] || parseInt(l.version.toLowerCase().replace(/v/gi, '')) == parseInt(cls[ 2 ].replace(/v/gi, '')))));
        // this.verbose(1,"layers from string",stringid,cls,ret)
        return ret;
    }

    async directMsgNominations(steamID) {
        let strMsg = "";
        for (let choice in this.nominations) {
            choice = Number(choice);
            // await this.msgDirect(steamID, formatChoice(choice, this.nominations[ choice ], this.tallies[ choice ]));
            strMsg += (steamID, formatChoice(choice, this.nominations[ choice ], this.tallies[ choice ])) + "\n";
        }
        strMsg.trim();
        if (steamID) this.warn(steamID, strMsg)

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
        // await this.msgDirect(steamID, `Registered vote`);// ${this.nominations[ nominationIndex ]} ${this.factionStrings[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.nominations[ nominationIndex ]} (${this.tallies[ nominationIndex ]} votes)`);
        // await this.msgDirect(steamID, `${this.factionStrings[ nominationIndex ]}`);
        // await this.msgDirect(steamID, `${this.tallies[ nominationIndex ]} votes`);
    }

    async logVoteToDiscord(message) {
        if (!this.options.logToDiscord) return
        await this.sendDiscordMessage({
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
    async logWinnerToDiscord(message) {
        if (!this.options.logToDiscord) return
        await this.sendDiscordMessage({
            embed: {
                title: 'Vote Ended',
                color: 16761867,
                fields: [
                    {
                        name: 'Winner:',
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

    //calculates the current winner(s) of the vote and returns thier strings in an array
    get currentWinners() {
        const ties = [];

        let highestScore = -Infinity;
        for (let choice in this.tallies) {
            const score = this.tallies[ choice ];
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

        return ties.map(i => this.nominations[ i ]);
    }
}

function randomElement(array) {
    return array[ Math.floor(Math.random() * array.length) ];
}

function formatChoice(choiceIndex, mapString, currentVotes, firstBroadcast) {
    return `${choiceIndex}➤ ${mapString} ` + (!firstBroadcast ? `(${currentVotes})` : "");
    // return `${choiceIndex + 1}❱ ${mapString} (${currentVotes} votes)`
}

function toMils(min) {
    return min * 60 * 1000;
}