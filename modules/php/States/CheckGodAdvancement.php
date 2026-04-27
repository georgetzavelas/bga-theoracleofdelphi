<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class CheckGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 9,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you} may advance a god from ${source_player_name}\'s oracle roll'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        // Get first pending queue entry
        $entry = $this->game->getObjectFromDB(
            "SELECT id, source_player_id FROM god_advancement_queue
             WHERE player_id = $playerId ORDER BY id ASC LIMIT 1"
        );
        if (!$entry) {
            return ['eligibleGods' => [], 'sourceColors' => [], 'source_player_name' => ''];
        }

        $sourcePlayerId = (int)$entry['source_player_id'];
        $queueId = (int)$entry['id'];

        // Get source player's current oracle dice colors
        $dice = $this->game->getObjectListFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $sourcePlayerId"
        );
        $sourceColors = array_unique(array_column($dice, 'color'));

        // Find eligible gods: matching one of the source colors, not on row 0, not at max row (6)
        $eligibleGods = [];
        foreach ($sourceColors as $color) {
            foreach (MaterialDefs::GODS as $godName => $god) {
                if ($god['color'] === $color) {
                    $safeName = addslashes($godName);
                    $row = (int)$this->game->getUniqueValueFromDB(
                        "SELECT track_row FROM player_god
                         WHERE player_id = $playerId AND god_name = '$safeName'"
                    );
                    if ($row > 0 && $row < 6) {
                        $eligibleGods[] = [
                            'god_name' => $godName,
                            'color' => $color,
                            'current_row' => $row,
                        ];
                    }
                }
            }
        }

        return [
            'queueId' => $queueId,
            'eligibleGods' => $eligibleGods,
            'sourceColors' => array_values($sourceColors),
            'source_player_name' => $this->game->getPlayerNameById($sourcePlayerId),
        ];
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        $args = $this->getArgs();

        // Validate the god is eligible
        $valid = false;
        foreach ($args['eligibleGods'] as $g) {
            if ($g['god_name'] === $godName) {
                $valid = true;
                break;
            }
        }
        if (!$valid) {
            throw new UserException(clienttranslate('You cannot advance that god'));
        }

        $safeName = addslashes($godName);
        $currentRow = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        $newRow = $currentRow + 1;

        $this->game->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        $this->game->statInc($newRow - $currentRow, "{$godName}_advances", $activePlayerId);

        // Delete the queue entry
        $queueId = (int)$args['queueId'];
        $this->game->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name} (from ${source_player_name}\'s oracle roll)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
            "source_player_name" => $args['source_player_name'],
        ]);

        return $this->checkForMore($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $args = $this->getArgs();
        $queueId = (int)($args['queueId'] ?? 0);
        $hadEligible = !empty($args['eligibleGods']);

        if ($queueId > 0) {
            $this->game->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");
        }

        $message = $hadEligible
            ? clienttranslate('${player_name} skips god advancement')
            : clienttranslate('${player_name} has no god eligible to advance');
        $this->notify->all("skipGodAdvancement", $message, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);

        return $this->checkForMore($activePlayerId);
    }

    private function checkForMore(int $playerId): string
    {
        $remaining = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM god_advancement_queue WHERE player_id = $playerId"
        );
        if ($remaining > 0) {
            return CheckGodAdvancement::class;
        }
        return CheckInjuries::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
