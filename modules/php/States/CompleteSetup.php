<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;

/**
 * The setup steps that follow the Ship Tile draft: starting injuries (with
 * the matching god bump), then the starting oracle dice.
 *
 * They used to run inside the last draft pick's action, while the game was
 * still in DraftShipTile, so the status bar kept saying a Ship Tile must be
 * chosen until their animations finished. As their own GAME state the status
 * bar reads "Completing setup" while they play.
 *
 * Both Game entry points are guarded, so re-entering is harmless.
 */
class CompleteSetup extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 8,
            type: StateType::GAME,
            description: clienttranslate('Completing setup'),
        );
    }

    public function onEnteringState(int $activePlayerId): string
    {
        // Setup order is ship tile, then injury + god, then oracle dice.
        $this->game->drawStartingInjuriesIfNeeded();
        $this->game->rollInitialDiceIfNeeded();
        return RoundStart::class;
    }
}
