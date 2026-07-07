<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\DraftLogic;

/**
 * Pre-round-1 Ship Tile draft (rulebook variant, enabled by the
 * ship_tile_mode game option).
 *
 * setupNewGame lays out N+1 tile ids in the `draft_pool` global and
 * activates the last player. Players choose one tile each in reverse turn
 * order (descending player_no); each pick assigns the tile and resolves its
 * immediate bonuses via Game::assignDraftedShipTile. When every player has a
 * tile, control passes to RoundStart, which runs the existing
 * SelectStartingEquipment / DiscardZeusTile detours for the Quartermaster /
 * Head Start follow-ups exactly as in random mode.
 *
 * The pure "what is choosable / who is next" logic lives in DraftLogic so it
 * can be unit-tested; this state only supplies the DB glue.
 */
class DraftShipTile extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 7,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must choose a Ship Tile'),
            descriptionMyTurn: clienttranslate('${you} must choose a Ship Tile'),
        );
    }

    public function getArgs(): array
    {
        // Drives the draft rail: the full face-up pool (stable order) plus
        // who has taken what. The client renders every pool tile, dimming
        // the claimed ones. Re-sent on every pick and on reconnect, so the
        // rail rebuilds without any getAllDatas plumbing.
        return [
            'pool'   => array_map('intval', (array)($this->game->globals->get('draft_pool') ?? [])),
            'claims' => $this->currentClaims(),
        ];
    }

    #[PossibleAction]
    public function actDraftTile(int $tile_id, int $activePlayerId) {
        if (!in_array($tile_id, $this->availableTiles(), true)) {
            throw new UserException(clienttranslate('That Ship Tile is no longer available'));
        }

        $this->game->assignDraftedShipTile($activePlayerId, $tile_id);

        $next = $this->nextDrafter();
        if ($next !== null) {
            $this->game->gamestate->changeActivePlayer($next);
            return DraftShipTile::class;
        }

        // Everyone has drafted → RoundStart fires the equipment / Zeus-tile
        // detours and starts round 1.
        return RoundStart::class;
    }

    function zombie(int $playerId) {
        // Auto-pick the first available tile so a disconnected player can't
        // stall the pre-round-1 draft (mirrors SelectStartingEquipment).
        $available = $this->availableTiles();
        if (!empty($available)) {
            return $this->actDraftTile((int)$available[0], $playerId);
        }
        return RoundStart::class;
    }

    /** Pool tiles not yet claimed by any player. */
    private function availableTiles(): array
    {
        $pool = $this->game->globals->get('draft_pool') ?? [];
        $claimed = $this->game->getObjectListFromDB(
            "SELECT ship_tile_id FROM player WHERE ship_tile_id IS NOT NULL"
        );
        $claimedIds = array_map(static fn ($r) => (int)$r['ship_tile_id'], $claimed);
        return DraftLogic::availableTiles((array)$pool, $claimedIds);
    }

    /** player_id => tile_id for tiles already drafted (drives the rail). */
    private function currentClaims(): array
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT player_id, ship_tile_id FROM player WHERE ship_tile_id IS NOT NULL"
        );
        $claims = [];
        foreach ($rows as $r) {
            $claims[(int)$r['player_id']] = (int)$r['ship_tile_id'];
        }
        return $claims;
    }

    /** Next drafter = undrafted player with the highest player_no. */
    private function nextDrafter(): ?int
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT player_id, player_no FROM player WHERE ship_tile_id IS NULL"
        );
        $undrafted = [];
        foreach ($rows as $r) {
            $undrafted[(int)$r['player_id']] = (int)$r['player_no'];
        }
        return DraftLogic::nextDrafter($undrafted);
    }
}
