<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

/**
 * Sub-state for Equipment Card 013 (Island Scout).
 *
 * Rule: "One-time: Look at 2 face down Island Tiles and put 1 back.
 *        Uncover the other and take the corresponding reward.
 *        If there are less than 2 face down Island Tiles, this card cannot be used."
 *
 * Entry: Game::applyOneTimeEquipmentEffect (case 13) checks there are at
 * least 2 face-down shrine islands, stashes:
 *   - globals 'eq13_card_id' = card_id of the activating 013 card
 *   - globals 'equipment_post_activation_state' = exit state FQCN
 *     (set by caller — CombatVictory sets its computed post-combat state;
 *     PlayerTurnStart sets PlayerTurnStart::class for pending-card loop)
 *
 * Flow:
 *   Phase 1 (selecting): player clicks 2 face-down shrine hexes on the
 *     board. Uses the same 'peek_mode' client UI primitives as PeekIslands
 *     so hex-click overlays, sessionStorage, and confirm-button all work
 *     identically.
 *   Phase 2 (preview): on actConfirmPeek, server inserts both picks into
 *     player_island_knowledge, flips the shrine contents privately via
 *     notify->player (islandsPeeked notif), and sets peek_viewing=true so
 *     the getAllDatas reload path continues to work. State re-renders in
 *     'preview' phase with "Reveal A" / "Reveal B" action buttons.
 *   Phase 3 (reveal): actRevealIsland clears peek_viewing, marks card 013
 *     used, sets explore_hex_q/r + god_explore_source=1 (skips die spend)
 *     + god_advance_reason='equipment_13' (so any downstream
 *     ChooseGodAdvancement routes back to equipment_post_activation_state),
 *     transitions to ExploreIsland.
 *
 * Privacy: shrine contents are never included in public getArgs() — only
 * delivered via notify->player(). Reload uses the private 'myPeekedHexes'
 * field in gamedatas (populated by Game::getAllDatas when peek_viewing is
 * set and the requesting player is the active player).
 */
class ScoutIslands extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 42,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} scouts islands (Island Scout)'),
            descriptionMyTurn: clienttranslate('${you}: Island Scout — pick 2 face-down islands, then explore 1 and gain its reward'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $viewing = $this->game->globals->get('peek_viewing');

        if ($viewing) {
            // Phase 2: preview. Shrine contents are private — do NOT put
            // them in public state args. Deliver the hex coords only so
            // the client knows which shrines to wire up "Reveal" buttons
            // for; the actual flipped overlays were set by notif_islandsPeeked
            // (fresh peek) or by the myPeekedHexes reload hook in
            // getAllDatas (on reload).
            $peekedHexes = json_decode($this->game->globals->get('peek_hexes') ?? '[]', true);
            $coords = [];
            foreach (is_array($peekedHexes) ? $peekedHexes : [] as $h) {
                // Both color (exploration color) and shrine_letter are
                // assigned to every shrine hex at game setup, so peeked
                // coords always carry them. Client uses them to build
                // the "Explore <color> <letter> Island" button label.
                $coords[] = [
                    'q' => (int)$h['q'],
                    'r' => (int)$h['r'],
                    'color' => $h['color'],
                    'shrine_letter' => $h['shrine_letter'],
                ];
            }
            return [
                'phase' => 'preview',
                'peekCount' => count($coords),
                'peekedCoords' => $coords,
            ];
        }

        // Phase 1: selecting. Face-down shrine hexes the player hasn't
        // peeked at yet. Mirrors PeekIslands::getArgs filtering.
        $hexes = $this->game->getObjectListFromDB(
            "SELECT h.q, h.r FROM hex h
             WHERE h.island_content = 'shrine' AND h.is_revealed = 0
             AND NOT EXISTS (
                 SELECT 1 FROM player_island_knowledge pik
                 WHERE pik.player_id = $playerId AND pik.hex_q = h.q AND pik.hex_r = h.r
             )"
        );

        $peekable = [];
        foreach ($hexes as $hex) {
            $peekable[] = ['q' => (int)$hex['q'], 'r' => (int)$hex['r']];
        }

        return [
            'phase' => 'selecting',
            'peekableIslands' => $peekable,
            // Card 013 requires exactly 2. If fewer are peekable (because
            // the player already peeked some earlier this turn), we still
            // need 2 fresh picks per rulebook — but the activation guard
            // in applyOneTimeEquipmentEffect counted face-down islands
            // globally, not "peekable-by-this-player", so it's possible
            // to reach this state with <2 peekable. Cap at what's
            // available; the confirm handler enforces the floor.
            'maxPeeks' => min(2, count($peekable)),
            'requiredPeeks' => 2,
        ];
    }

    #[PossibleAction]
    public function actConfirmPeek(string $hexCoordsJson, int $activePlayerId): string
    {
        $cardId = (int)$this->game->globals->get('eq13_card_id');
        if ($cardId <= 0) {
            throw new UserException(clienttranslate('Equipment activation expired.'));
        }

        $hexCoords = json_decode($hexCoordsJson, true);
        if (!is_array($hexCoords) || count($hexCoords) !== 2) {
            throw new UserException(clienttranslate('Island Scout requires selecting exactly 2 islands.'));
        }

        // De-dup: the same hex twice isn't allowed.
        $seen = [];
        foreach ($hexCoords as $coord) {
            $key = ((int)$coord['q']) . ',' . ((int)$coord['r']);
            if (isset($seen[$key])) {
                throw new UserException(clienttranslate('You cannot select the same island twice.'));
            }
            $seen[$key] = true;
        }

        $revealedContents = [];
        foreach ($hexCoords as $coord) {
            $q = (int)$coord['q'];
            $r = (int)$coord['r'];

            $hex = $this->game->getObjectFromDB(
                "SELECT island_content, shrine_game_color, shrine_letter, color FROM hex
                 WHERE q = $q AND r = $r AND island_content = 'shrine' AND is_revealed = 0"
            );
            if (!$hex) {
                throw new UserException(clienttranslate('Invalid island selection.'));
            }

            // INSERT into player_island_knowledge only if not already there.
            // If the player already peeked this hex via the normal peek
            // action earlier in their turn, the row exists; we still want
            // to pick it up for the preview-and-reveal flow but mustn't
            // duplicate the PK.
            $alreadyPeeked = (int)$this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM player_island_knowledge
                 WHERE player_id = $activePlayerId AND hex_q = $q AND hex_r = $r"
            );
            if ($alreadyPeeked === 0) {
                $this->game->DbQuery(
                    "INSERT INTO player_island_knowledge (player_id, hex_q, hex_r)
                     VALUES ($activePlayerId, $q, $r)"
                );
            }

            $revealedContents[] = [
                'q' => $q,
                'r' => $r,
                'shrine_owner_color' => $hex['shrine_game_color'] ?? 'unknown',
                'shrine_letter' => $hex['shrine_letter'],
                'color' => $hex['color'],
            ];
        }

        // Enter preview phase. We reuse the PeekIslands globals so the
        // client reload path (myPeekedHexes in getAllDatas) works without
        // duplication.
        $this->game->globals->set('peek_viewing', true);
        $this->game->globals->set('peek_hexes', json_encode($revealedContents));

        // Private notif: shrine contents flow only to the active player.
        // Reuses the same client-side notif_islandsPeeked handler that
        // flips the shrine overlays.
        $this->notify->player($activePlayerId, "islandsPeeked",
            clienttranslate('You peek at 2 islands (Island Scout)'), [
            "count" => count($revealedContents),
            "islands" => $revealedContents,
        ]);

        // Public: opponents see only that the player peeked 2 islands.
        $this->notify->all("playerPeekedIslands",
            clienttranslate('${player_name} scouts 2 islands (Island Scout)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "count" => count($revealedContents),
        ]);

        return ScoutIslands::class;
    }

    #[PossibleAction]
    public function actRevealIsland(int $hexQ, int $hexR, int $activePlayerId): string
    {
        $cardId = (int)$this->game->globals->get('eq13_card_id');
        if ($cardId <= 0) {
            throw new UserException(clienttranslate('Equipment activation expired.'));
        }

        $peekedRaw = $this->game->globals->get('peek_hexes');
        $peekedHexes = json_decode($peekedRaw ?? '[]', true);
        if (!is_array($peekedHexes) || count($peekedHexes) !== 2) {
            throw new UserException(clienttranslate('You must peek 2 islands before revealing.'));
        }

        $match = null;
        foreach ($peekedHexes as $h) {
            if ((int)$h['q'] === $hexQ && (int)$h['r'] === $hexR) {
                $match = $h;
                break;
            }
        }
        if ($match === null) {
            throw new UserException(clienttranslate('That island was not one of your 2 peeked islands.'));
        }

        // Verify the hex is still a face-down shrine island (defensive —
        // nothing should have revealed it in the meantime since it's our
        // turn, but guard just in case).
        $hex = $this->game->getObjectFromDB(
            "SELECT q FROM hex
             WHERE q = $hexQ AND r = $hexR AND island_content = 'shrine' AND is_revealed = 0"
        );
        if (!$hex) {
            throw new UserException(clienttranslate('That island is no longer revealable.'));
        }

        // Mark card 013 one-time used.
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        // Notify activation + used.
        $this->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (reveals an island)'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $this->game->getPlayerNameById($activePlayerId),
                'card_id' => $cardId,
                'equipment_name' => $this->game->equipmentName(13),
            ]
        );
        $this->notify->all('equipmentUsed', '', [
            'player_id' => $activePlayerId,
            'card_id' => $cardId,
        ]);

        // Close out the peek-preview UI: client will unflip the UN-chosen
        // shrine (peekEnded notif) but the CHOSEN shrine is about to be
        // flipped for real by ExploreIsland's islandRevealed notif. Send
        // peekEnded first; on client, notif_peekEnded unflips both, then
        // notif_islandRevealed re-flips the chosen one.
        $this->notify->player($activePlayerId, "peekEnded", '', []);

        // Clear peek globals so downstream states (ExploreIsland,
        // ChooseGodAdvancement, etc.) don't think we're still in a peek.
        $this->game->globals->set('peek_viewing', null);
        $this->game->globals->set('peek_hexes', null);
        $this->game->globals->set('eq13_card_id', 0);

        // Set up ExploreIsland: free activation (no die spend), and tag
        // the god-advance reason so that if the revealed shrine chains
        // into ChooseGodAdvancement (sigma bonus, own-shrine Zeus tile
        // completion), its finish() routes back to
        // equipment_post_activation_state instead of the default
        // PlayerActions/ConsultOracle.
        $this->game->globals->set('explore_hex_q', $hexQ);
        $this->game->globals->set('explore_hex_r', $hexR);
        $this->game->globals->set('god_explore_source', 1);
        $this->game->globals->set('god_advance_reason', 'equipment_13');

        return ExploreIsland::class;
    }

    function zombie(int $playerId) {
        // If mid-preview, auto-reveal the first peeked island.
        $peekedHexes = json_decode($this->game->globals->get('peek_hexes') ?? '[]', true);
        if (is_array($peekedHexes) && count($peekedHexes) === 2) {
            $first = $peekedHexes[0];
            return $this->actRevealIsland((int)$first['q'], (int)$first['r'], $playerId);
        }

        // Otherwise we're still in selecting phase with nothing committed.
        // Abort: mark card 013 used (spent without effect) and return to
        // the post-activation state so the turn continues.
        $cardId = (int)$this->game->globals->get('eq13_card_id');
        if ($cardId > 0) {
            $this->game->DbQuery(
                "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
            );
            $this->notify->all('equipmentUsed', '', [
                'player_id' => $playerId,
                'card_id' => $cardId,
            ]);
        }
        $this->game->globals->set('peek_viewing', null);
        $this->game->globals->set('peek_hexes', null);
        $this->game->globals->set('eq13_card_id', 0);

        $post = (string)$this->game->globals->get('equipment_post_activation_state');
        $this->game->globals->set('equipment_post_activation_state', null);
        if ($post !== '') {
            return $post;
        }
        return PlayerActions::class;
    }
}
