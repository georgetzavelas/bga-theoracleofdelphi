<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;

class RoundStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 2, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // Random mode: a Ship Tile that asks for a choice (Quartermaster's
        // Equipment card, Head Start's Zeus tile) is resolved here, before
        // round 1, one pending player at a time. Each choice state returns
        // here (Game::stateAfterShipTileChoice). Draft mode resolves them
        // right after each pick, so nothing is pending by now.
        foreach ($this->playersWithShipTiles() as $playerId) {
            $choice = $this->game->pendingShipTileChoice($playerId);
            if ($choice !== null) {
                $this->game->gamestate->changeActivePlayer($playerId);
                return $choice;
            }
        }

        // Detours above shift the active player and don't restore it. Without
        // this, round 1 starts with whichever detour ran last as active — the
        // setup-time activeNextPlayer() picking first_player_id is lost. A
        // no-op for round 2+ since TitanAttack -> RoundStart already leaves
        // first_player_id active.
        $firstPlayerId = (int)$this->game->globals->get('first_player_id');
        if ($firstPlayerId > 0
                && (int)$this->game->getActivePlayerId() !== $firstPlayerId) {
            $this->game->gamestate->changeActivePlayer($firstPlayerId);
        }

        $this->game->statInc(1, 'rounds_played');
        $this->notify->all("roundStart", clienttranslate('A new round begins'), []);
        return PlayerTurnStart::class;
    }

    /** @return int[] */
    private function playersWithShipTiles(): array
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT player_id FROM player WHERE ship_tile_id IS NOT NULL"
        );
        return array_map(static fn ($r) => (int)$r['player_id'], $rows);
    }
}
