Dear developers,

A number of changes have been introduced on the Studio framework in the last months.

This thread list all changes that have been make on the BGA Framework side. We highly recommend you to read it, to know all the added or updated tools that are available. It should make coding of BGA games easier and faster :)

📌 In green: information about migration, if you want to migrate an old game to the most recent ways

Note: Whenever possible, the Reversi tutorial has been updated to match the new functionalities of the Framework, so you can look at the Reversi source code for examples of usage.

PHP8.4 migration

The migration was made from PHP7.4, allowing PHP8 new syntaxes and functions.

User preferences

Access to user preferences and notification when it changes: [https://en.doc.boardgamearena.com/Game_ ... references](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#User_preferences)

📌 If you had a function called setupPreferences() reading the <select> values, you can now use onGameUserPreferenceChanged instead.

If you had a copy of the user preferences on a DB table, it's not needed anymore.

Table options

New function to access the table options without needing the old global way: $this->tableOptions->get(int $optionId): int

[https://en.doc.boardgamearena.com/Optio ... me_Options](https://en.doc.boardgamearena.com/Options_and_preferences:_gameoptions.json,_gamepreferences.json#Game_Options)

📌 It was before done with either $this->getGameStateValue or $this->gamestate->table_globals

This new object can also return the Real-time/Turn-based information: [https://en.doc.boardgamearena.com/Main_ ... exion_time](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php#Reflexion_time)

Legacy

New object to access the legacy functions, removing the need to manually decode the JSON result when getting the values.

[https://en.doc.boardgamearena.com/Main_ ... _games_API](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php#Legacy_games_API)

📌 Use $this->legacy->actionname instead of $this->actionnameLegacy and remove JSON decoding on getters

Globals of any type

New functions to handle any type variables instead of numerical values only

[https://en.doc.boardgamearena.com/Main_ ... se_globals](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php#Use_globals)

Simplify front->back calls

Introduce bgaPerformAction to replace ajaxcall and checkAction combination, with a simpler syntax:

[https://en.doc.boardgamearena.com/Game_ ... js#Actions](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Actions)

📌 Replace combination of checkAction/ajaxcall by bgaPerformAction. Beware of the options (3rd param) if it was an ajaxcall without checkAction.

Autowire game actions

Simplify the action calls by removing the use of the action.php file

[https://en.doc.boardgamearena.com/Main_ ... autowired)](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php#Actions_%28autowired%29)

📌 Autowired actions needs to start with "act", so it's risky to change them (if you change all actions names in the states.php, game, action and JS file, Real-time players will call the old name until they refresh. So, it needs to be done in two steps with duplicates on back side, or to be deployed when there is no Realt-time table running.

When migration is done, the action.php file can be deleted.

Namespaced game class

Game classes are now namespaced (and moved to modules/php/Game.php) and can autoload other classes of the same namespace

[https://en.doc.boardgamearena.com/Main_ ... er_classes](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php#Creating_other_classes)

📌 The class file should be moved to modules/php/Game.php and start with this adapted part:
Code: Select all

namespace Bga\Games\YourGameName;

class Game extends \Bga\GameFramework\Table
All references to non-namespaced classes in this file should be defined on top of the file with "use", for example "use \BgaUserException;" as it is this non-namespaced exception is used in the zombieTurn function.

All includes with relative path will need to be updated too

IDE Helper & bga-framework.d.ts

A new _ide_helper.php file is now provided in every project dir, allowing IDE to provide syntax error highlighting for the framework functions. This file is regularly updated to match the latest framework updates.

Same with bga-framework.d.ts for those using TypeScript.

📌 Sync the files from the FTP dir to your local copy to benefit from it. Most of the IDE like Visual Studio Code should handle _ide_helper.php if you already followed [https://en.doc.boardgamearena.com/Setti ... ing_VSCode](https://en.doc.boardgamearena.com/Setting_up_BGA_Development_environment_using_VSCode)

Strict mode set in new project template

New projects are generated using the strict mode activated (for typings). The examples in the doc have been updated to handle old framework function returning bad typings, for example (int) $this->getActivePlayerId();

📌 Make sure the typings are correct on the Game.php file, a global check of the game is recommended

📌 A global replace should work on the Game.php files

Access template elements

New functions getPlayerPanelElement(player_id) and this.getGameAreaElement()

[https://en.doc.boardgamearena.com/Game_ ... er's_panel](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Adding_stuff_to_player%27s_panel)

📌 Code like dojo.place(html, player_board_${player.id}); would be replaced by this.getGameAreaElement().insertAdjacentHTML('beforeend', html);

Optional files: action/view/template/material

Action/view/template/material files are now optional and are not generated anymore on a new project. The new project templates demonstrate how to work without them.

📌 See Autowiring to delete the action file.
The template should be built on the JS side to remove the view/template files, so it can be complicated for old projects using them intensively. It would look like this:
Code: Select all

this.getGameAreaElement().insertAdjacentHTML('beforeend', `
  <span>${_('My translated text')}</span><div id="player-tables"></div>
`);

Easier notification setup

Notifications can now be automatically scanned and called without needing to register them one by one. They'll handle Promises, so they end synchronously when the Promise resolves.

[https://en.doc.boardgamearena.com/Game_ ... ifications](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Notifications)

A wait function has been added to return a Promise when a delay is passed (compatible with fast-replay mode)

A new utility function has been added to support Promises for old Dojo animations

[https://en.doc.boardgamearena.com/Game_ ... _Callbacks](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Animation_Callbacks)

📌 Dojo.subscribe calls in setupNotifications must be removed if bgaSetupPromiseNotifications is used. Notif_ function should be async and return a Promise, make sure they wait for the expected amount of time if the sync setup was using a numerical duration

If you used Dojo animation, make them Promise compatible with "await this.bgaPlayDojoAnimation(dojoAnim);"

Status bar manipulation

Function to change the title from the JS

[https://en.doc.boardgamearena.com/Game_ ... #Title_bar](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Title_bar)

📌 Replace direct title div manipulation with this.statusBar.setTitle(title: string, args?: object), and benefit from replacement of ${actplayer}/${you}/... (see example in the link above).

This also includes a new function to create action buttons, that are more screen-reader compatible than the previous version. The new button parameters also allow you to set a confirm popin or an autoclick for confirmation buttons

📌 Replace this.addActionButton by this.statusBar.addActionButton. Notice the parameters have changed, so they need to be adapted too! Remove manual setActionTimer or manual confirm with the new parameters.

Notification decorators

New notify function that handles decorators, reducing the duplicate code on notification args.

[https://en.doc.boardgamearena.com/Main_ ... decorators](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php#Notification_decorators)

📌 Replace notifyAllPlayers by notify->all and notifyPlayer by notify->player

Forbid access to global BGA variables and direct DB access on action/view files

A new getCurrentPlayerId() function has been added to those action/view classes for easier migration

📌 Replace $g_user->get_id() by $this-> getCurrentPlayerId()[

Replace DB calls by $this->game->myFunctionCallingTheDB()

Instant cssPref on user preferences

A reload is not needed anymore to apply cssPref on a user preference change.

📌 Remove forceReload: true if it was only set to update the cssPref. The player will appreciate to not reload the whole page!

Dojo usage

Dojo usage has been reduced to minimum in the new project template and the doc, as native JS is now able to do almost the same things, with better performance and more knowledge for newcomers of the native (vanilla) JS.

📌 Replace dojo by vanilla JS where possible

Skip a state

When you skip a state on PHP side (directly move to another state on the "st" function), the JS is still notified that the skipped state is activated, then it activates the next state just after, but you may see the skipped state buttons being created then deleted.

You can set up the _no_notify flag so that the JS notification of this skipped state is not sent, and from the JS side it considers the state was never loaded. For example, if you have a confirm step and a user preference allows to disable it, the user doesn't need to see the Confirm buttons showing then removed just after.

[https://en.doc.boardgamearena.com/Your_ ... pped_state](https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php#Flag_to_indicate_a_skipped_state)

📌 Add _no_notify in the args when a state is skipped

Sound loading

New functions load/play have been added for the sounds:

[https://en.doc.boardgamearena.com/Game_ ... .js#Sounds](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Sounds)

📌 Replace template loading of sounds and global function playSound

Useless getGameName function on Game PHP file

The getGameName function is now useless in the Game PHP file and can be deleted

📌 Delete the getGameName function in the Game PHP file.

GameStateBuilder

This new class helps you build the state machine, allowing auto-completion, and avoid typo errors on state types. Complete example: 📌 [https://en.doc.boardgamearena.com/Your_ ... es.inc.php](https://en.doc.boardgamearena.com/Your_game_state_machine:_states.inc.php)

States 1 and 99, that must not be changed, are now optional.

📌 Replace the array definition by GameStateBuilder use. You can remove the declaration of states 1 and 99.

Note: it's only useful if you don't migrate to State classes described later on.

bgaFormatText

This function, if defined, will allow you to insert HTML in the logs without overriding format_string_recursive. Example: 📌 [https://en.doc.boardgamearena.com/BGA_S ... %29_method](https://en.doc.boardgamearena.com/BGA_Studio_Cookbook#Define_this.bgaFormatText%28%29_method)

📌 Replace the override of format_string_recursive by bgaFormatText (the last line will change)

Future support of dark mode

BGA doesn't support dark mode yet. To have some games compatible when we do, we added a theme data tag you can use as described here:

[https://en.doc.boardgamearena.com/Game_ ... _Dark_mode](https://en.doc.boardgamearena.com/Game_interface_stylesheet:_yourgamename.css#Support_of_the_Dark_mode)

Framework function for automata player panel

A new framework function to add a player panel for your game automatas [https://en.doc.boardgamearena.com/Game_ ... n_automata](https://en.doc.boardgamearena.com/Game_interface_logic:_yourgamename.js#Adding_a_player_panel_for_an_automata)

📌 Replace manually created automata player panel with this new function

New JS libraries

We will provide new libraries to help you design your games, especially for components that you will find on numerous games. The first available libraries are:

[bga-animations](https://en.doc.boardgamearena.com/BgaAnimations) : a JS component to make animations, compatible with scaled or rotated containers.

[bga-cards](https://en.doc.boardgamearena.com/BgaCards) : a JS component to handle cards.

[bga-dice](https://en.doc.boardgamearena.com/BgaDice) : a JS component to handle dice.

[bga-autofit](https://en.doc.boardgamearena.com/BgaAutofit) : a JS component to make text fit on a fixed size div.

[bga-score-sheet](https://en.doc.boardgamearena.com/BgaScoreSheet) : a JS component to help you display an animated score sheet at the end of the game.

📌 Try them, and hopefully use them instead of the very old components! Each lib has a demo in the beginning of the wiki page to show what it can do.

Notification args consistency

Previously, when you sent an arg that was transformed by format_string_recursive or bgaFormatText, the args object was mutated and you got the transformed value in the notif_ handler.

The solution was to send the values in 2 different names like this:
Code: Select all

[
  'roundNumber' => $roundNumber, // number, to update the round counter
  'round_number' => $roundNumber, // number that will be transformed to string by bgaFormatText, when shown in bold in the logs
]
📌 Do not duplicate the value, as the notif_ handler will now get unmutated args

Updated Zombie Mode documentation and recommendations

We now recommend making the zombie player playing randomly, instead of passing as a default. A new "Zombie Mode level" field has been added to the Game Metadata Manager, to indicated the Zombie Mode you implemented in your game.

https://en.doc.boardgamearena.com/Zombie_Mode

State classes

There is now a way to describe each game state in a State class, that will handle all logic and description of the state. It helps splitting the code into multiple files, instead of one big Game.php file.

[https://en.doc.boardgamearena.com/State ... _directory](https://en.doc.boardgamearena.com/State_classes:_State_directory)

📌 Create a State class for each state of the game (except 1 and 99 if they are still described in states.inc.php), move the state definition in it, and adapt the "st", "arg", "actXXX" and "zombie" functions in the class. When all classes are migrated, you can remove the states.inc.php file in the FTP folder.

Counters

2 new counter classes have been added to easily handle the various counters your game might have. You also have 2 prebuild PlayerCounter: playerScore and playerScoreAux, to handle the scoring values, so you don't need to update manually the DB when setting the scores.

[https://en.doc.boardgamearena.com/Playe ... bleCounter](https://en.doc.boardgamearena.com/PlayerCounter_and_TableCounter)

📌 Replace setting manually player_score/player_score_aux with new $this->playerScore and $this->playerScoreAux. Remove the notifications, or part of notifications, updating the scoreCtrl counter.

Use $this-> instead of self:: by default

The new project template has been updated to remove this bad practice (that may be unsupported in a future PHP version)
