<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class PeekIslands extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 41,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} looks at islands'),
            descriptionMyTurn: clienttranslate('${you}: select islands or end peek'),
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

        // Private notification with shrine details for flipping
        $this->notify->player($activePlayerId, "islandsPeeked",
            clienttranslate('You peek at ${count} island(s)'), [
            "count" => count($revealedContents),
            "islands" => $revealedContents,
        ]);

        // Public notification
        $this->notify->all("playerPeekedIslands",
            clienttranslate('${player_name} looks at ${count} island(s)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "count" => count($revealedContents),
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
