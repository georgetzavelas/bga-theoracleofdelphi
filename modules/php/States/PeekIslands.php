<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

class PeekIslands extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 41,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} looks at islands'),
            descriptionMyTurn: clienttranslate('Select up to 2 unrevealed islands to peek at'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        $hexes = $this->game->getObjectListFromDB(
            "SELECT h.q, h.r FROM hex h
             WHERE h.tile_type = 'island' AND h.is_revealed = 0
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
                "SELECT island_content FROM hex
                 WHERE q = $q AND r = $r AND tile_type = 'island' AND is_revealed = 0"
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

            $revealedContents[] = [
                'q' => $q,
                'r' => $r,
                'island_content' => $hex['island_content'],
            ];
        }

        // Private notification — only the active player sees the contents
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

        // Spend the die
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $this->game->globals->set('selected_die_index', null);

        $this->notify->all("dieUsed", '', [
            "player_id" => $activePlayerId,
            "die_index" => $dieIndex,
        ]);

        $unused = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $activePlayerId AND is_used = 0"
        );
        if ($unused === 0) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actCancel(int $activePlayerId) {
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actCancel($playerId);
    }
}
