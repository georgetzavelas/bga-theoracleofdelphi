<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class RoundStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 2, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // starting_equipment ship tile (id 1): the holder picks one of
        // the six face-up Equipment cards rather than getting an
        // auto-assigned top-of-deck card. Game::applyShipTileBonuses
        // sets `pending_starting_equipment_<pid>` at setup; this detour
        // routes each pending player through SelectStartingEquipment
        // before round 1 starts. Same pattern as the fewer_tasks
        // detour just below.
        $startingEquipPlayerId = $this->findPendingStartingEquipmentPlayer();
        if ($startingEquipPlayerId !== null) {
            $this->game->gamestate->changeActivePlayer($startingEquipPlayerId);
            return SelectStartingEquipment::class;
        }

        // fewer_tasks ship tile: if the holder hasn't yet returned a Zeus tile,
        // detour through DiscardZeusTile before round 1 begins. Detection
        // counts active (is_completed = 0) tiles — the discard now flips
        // is_completed to 1 instead of deleting the row (so the slot keeps
        // a faded tile instead of revealing the dashed empty placeholder),
        // but the active count drops from 12 to 11 the same way the row
        // count used to.
        $pendingPlayerId = $this->findPendingFewerTasksPlayer();
        if ($pendingPlayerId !== null) {
            $this->game->gamestate->changeActivePlayer($pendingPlayerId);
            return DiscardZeusTile::class;
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

    private function findPendingStartingEquipmentPlayer(): ?int
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT player_id, ship_tile_id FROM player WHERE ship_tile_id IS NOT NULL"
        );
        foreach ($rows as $row) {
            $tile = MaterialDefs::SHIP_TILES[(int)$row['ship_tile_id']] ?? null;
            if (!$tile || $tile['ability'] !== 'starting_equipment') continue;
            $playerId = (int)$row['player_id'];
            if ((int)$this->game->globals->get('pending_starting_equipment_' . $playerId) === 1) {
                return $playerId;
            }
        }
        return null;
    }

    private function findPendingFewerTasksPlayer(): ?int
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT player_id, ship_tile_id FROM player WHERE ship_tile_id IS NOT NULL"
        );
        foreach ($rows as $row) {
            $tile = MaterialDefs::SHIP_TILES[(int)$row['ship_tile_id']] ?? null;
            if (!$tile || $tile['ability'] !== 'fewer_tasks') continue;

            $playerId = (int)$row['player_id'];
            $activeCount = (int)$this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM zeus_tile WHERE player_id = $playerId AND is_completed = 0"
            );
            if ($activeCount > 11) return $playerId;
        }
        return null;
    }
}
