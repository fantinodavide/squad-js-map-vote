
MapVote
-------
The `MapVote` plugin for squad js based on the original version https://github.com/maskedmonkyman/squad-js-map-vote

## Commands

### User Commands
- `!vote help` - sends possbile commands to a player in the from of a warning
- `!vote choices` - sends choices to player in the from of a warning
- `!vote results` - sends player the results in a warning

### Admin Commands
- `!vote start` - Starts a vote with 6 layers, random modes
- `!vote cancel` - Cancels current round of voting
- `!vote restart` - Restarts voting with 6 random maps and modes
- `!vote broadcast` - Broadcasts current voting results - happens every 7m automatically

#### Vote by modes
- `!vote start *_raas` - Starts a vote with 6 layers, all RAAS
- `!vote start *_aas` - Starts a vote with 6 layers, all AAS
- `!vote start *_inv` - Starts a vote with 6 layers, all INV

#### Vote by map
- `!vote start yeh gor lash gor albas` - Starts a vote with X maps, random modes

#### Vote by map + mode, mixed
- `!vote start yeh_raas gor_raas lash_inv gor albas_inv` - Starts a vote with X maps, X modes


## Config

```
    {
      "plugin": "MapVote",
      "enabled": true,
      "commandPrefix": "!vote",
      "minPlayersForVote": 40,
      "voteWaitTimeFromMatchStart": 15,
      "voteBroadcastInterval": 7,
      "automaticSeedingMode": true,
      "numberRecentMapsToExlude": 4
    }
```


### Options

*   #### minPlayersForVote
    
    ###### Description
    
    The number of players needed on the server for a vote to start.
    
    ###### Default
    
        40
    
*   #### voteWaitTimeFromMatchStart
    
    ###### Description
    
    The time in mins from the start of a round to the start of a new map vote.
    
    ###### Default
    
        15
    
*   #### voteBroadcastInterval
    
    ###### Description
    
    The broadcast interval for vote notification in mins.
    
    ###### Default
    
        7
    
*   #### automaticSeedingMode
    
    ###### Description
    
    The set a seeding layer if server has less than 20 players.
    
    ###### Default
    
        true

*   #### numberRecentMapsToExlude
    
    ###### Description
    
    The random layer list will not include the X recent maps
    
    ###### Default
    
        4