<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class PeekIslands extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 41,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} looks at islands'),
            descriptionMyTurn: clienttranslate('${you}: select islands or end Look'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $viewing = $this->game->globals->get('peek_viewing');

        if ($viewing) {
            // Phase 2: viewing peeked islands.
            // Shrine contents are private to the active player — do NOT include
            // them in state args (which broadcast to all clients). They are
            // delivered via notify->player and, on reload, via getAllDatas().
            $peekedHexes = json_decode($this->game->globals->get('peek_hexes') ?? '[]', true);
            return [
                'phase' => 'viewing',
                'peekCount' => count($peekedHexes),
            ];
        }

        // Phase 1: selecting islands
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
            'maxPeeks' => min(2, count($peekable)),
        ];
    }

    #[PossibleAction]
    public function actConfirmPeek(string $hexCoordsJson, int $activePlayerId) {
        // Corrected seal site for "Look at Islands" (see task-5-report.md):
        // SelectAction::actLookAtIslands only validates + routes here;
        // this is where shrine contents actually get revealed.
        $this->game->sealUndo();  // island contents reveal is a hard commit
        $hexCoords = json_decode($hexCoordsJson, true);
        if (!is_array($hexCoords) || count($hexCoords) === 0 || count($hexCoords) > 2) {
            throw new UserException(clienttranslate('Select 1 or 2 islands'));
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
                throw new UserException(clienttranslate('Invalid island selection'));
            }

            $alreadyPeeked = $this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM player_island_knowledge
                 WHERE player_id = $activePlayerId AND hex_q = $q AND hex_r = $r"
            );
            if ((int)$alreadyPeeked > 0) {
                throw new UserException(clienttranslate('You already know this island'));
            }

            $this->game->DbQuery(
                "INSERT INTO player_island_knowledge (player_id, hex_q, hex_r)
                 VALUES ($activePlayerId, $q, $r)"
            );
            $this->game->statInc(1, 'islands_peeked', $activePlayerId);

            $revealedContents[] = [
                'q' => $q,
                'r' => $r,
                'shrine_owner_color' => $hex['shrine_game_color'] ?? 'unknown',
                'shrine_letter' => $hex['shrine_letter'],
                'color' => $hex['color'],
            ];
        }

        // Store peeked hexes and enter viewing phase
        $this->game->globals->set('peek_viewing', true);
        $this->game->globals->set('peek_hexes', json_encode($revealedContents));

        // Private notification with shrine details for flipping. Log text
        // is intentionally blank: the public "looks at N island(s)" line
        // already covers it for the active player, so a private "You look
        // at N island(s)" would be redundant. The notif still fires (the
        // client handler flips the previewed island overlays).
        $this->notify->player($activePlayerId, "islandsPeeked", '', [
            "count" => count($revealedContents),
            "islands" => $revealedContents,
        ]);

        // Public notification. Hex coords are public — in physical
        // play opponents see which island tiles the active player
        // picked up; only the contents underneath stay private.
        // The coords drive both the live "someone is looking here"
        // eye markers on opponents' boards (cleared by playerPeekEnded)
        // and the persistent "X has looked at this island" tooltip
        // line on unrevealed hexes.
        $publicHexes = array_map(function($h) {
            return ['q' => (int)$h['q'], 'r' => (int)$h['r']];
        }, $revealedContents);
        $this->notify->all("playerPeekedIslands",
            clienttranslate('${player_name} looks at ${count} island(s)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "count" => count($revealedContents),
            "hexes" => $publicHexes,
        ]);

        // Stay in PeekIslands — now in viewing phase
        return PeekIslands::class;
    }

    #[PossibleAction]
    public function actEndPeek(int $activePlayerId) {
        // Clear viewing state
        $this->game->globals->set('peek_viewing', null);
        $this->game->globals->set('peek_hexes', null);

        // Notify client to unflip shrines
        $this->notify->player($activePlayerId, "peekEnded", '', []);
        // Public counterpart: opponents drop their live "is looking
        // here" eye markers for this player. Persistent peek knowledge
        // stays in the tooltip via the islandKnowledge gamedatas /
        // playerPeekedIslands payload.
        $this->notify->all("playerPeekEnded", '', [
            "player_id" => $activePlayerId,
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actCancel(int $activePlayerId) {
        $this->game->globals->set('peek_viewing', null);
        $this->game->globals->set('peek_hexes', null);
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        // If viewing, end peek; otherwise cancel
        $viewing = $this->game->globals->get('peek_viewing');
        if ($viewing) {
            return $this->actEndPeek($playerId);
        }
        return $this->actCancel($playerId);
    }
}
