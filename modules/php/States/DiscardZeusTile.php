<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class DiscardZeusTile extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 5,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} is choosing a Zeus tile to discard as their Ship Tile ability'),
            descriptionMyTurn: clienttranslate('Your ship tile requires you to return a Zeus tile to the box. Pick one to discard. You do not receive its reward but it counts as 1 completed task.'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $tiles = $this->game->getObjectListFromDB(
            "SELECT tile_id AS id, task_type AS taskType,
                    task_color AS taskColor, task_letter AS taskLetter,
                    sort_order AS sortOrder
             FROM zeus_tile
             WHERE player_id = $playerId AND is_completed = 0
             ORDER BY task_type, sort_order"
        );
        return ['tiles' => $tiles];
    }

    #[PossibleAction]
    public function actDiscardTile(int $tile_id, int $activePlayerId) {
        $tile = $this->game->getObjectFromDB(
            "SELECT tile_id, task_type, task_color, task_letter
             FROM zeus_tile
             WHERE tile_id = $tile_id AND player_id = $activePlayerId AND is_completed = 0"
        );
        if (!$tile) {
            throw new UserException(clienttranslate('Invalid tile'));
        }

        // Mark the tile as completed instead of deleting it. The row stays
        // around so the player-board slot keeps a faded "completed" tile in
        // place of the slot's empty-state dashed placeholder, and the panel
        // pip naturally reads as `done` on the next reload — matching the
        // visual treatment of any normally-completed tile.
        $this->game->DbQuery(
            "UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tile_id"
        );
        // Bump player_score + tasks_completed exactly like a real
        // completion (markZeusTileComplete). The discarded tile counts
        // as 1 completed task toward the player's score and end-game
        // stats — without this, a fewer_tasks player ends with one
        // fewer 'Completed Zeus tile' than a standard player even
        // though both reach the same 12-is_completed=1 win threshold.
        // Per-task-type stat (e.g. shrine_tasks_completed) also bumped
        // so the breakdown stays consistent with the discarded tile's
        // task type.
        $this->game->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1
             WHERE player_id = $activePlayerId"
        );
        $this->game->playerScore->inc($activePlayerId, 1);
        $this->game->statInc(1, 'tasks_completed', $activePlayerId);
        $taskType = $tile['task_type'];
        if (in_array($taskType, ['shrine', 'statue', 'offering', 'monster'], true)) {
            $this->game->statInc(1, $taskType . '_tasks_completed', $activePlayerId);
        }

        // Shrine task discarded → the corresponding face-down shrine token
        // on the board goes back to the box too (rulebook + G's request).
        // Clear the hex so the island has no shrine to find when explored
        // or peeked. shrine_player_id is server-side until reveal anyway,
        // and the discard happens before any peek/explore at game start —
        // no live notification needed for the board removal.
        if ($tile['task_type'] === 'shrine' && !empty($tile['task_letter'])) {
            $letter = addslashes($tile['task_letter']);
            $this->game->DbQuery(
                "UPDATE hex
                 SET shrine_player_id = 0, shrine_letter = NULL, shrine_game_color = NULL
                 WHERE shrine_player_id = $activePlayerId AND shrine_letter = '$letter'"
            );
        }

        // The BGA score widget syncs automatically off the playerScore
        // counter bumped above; the notif carries the panel-relevant fields.
        $tasksCompleted = (int)$this->game->getUniqueValueFromDB(
            "SELECT tasks_completed FROM player WHERE player_id = $activePlayerId"
        );
        $this->notify->all("zeusTileDiscarded",
            clienttranslate('${player_name} returns ${zeus_tok} to the box (fewer_tasks ship tile)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "tile_id" => (int)$tile['tile_id'],
            "task_type" => $tile['task_type'],
            "task_color" => $tile['task_color'],
            "task_letter" => $tile['task_letter'],
            "task_description" => $this->describeTask($tile),
            "tasks_completed" => $tasksCompleted,
            "zeus_tok" => "a Zeus tile",
            "zeus_img" => $tile['task_type'] . ":" . ($tile['task_type'] === 'shrine' ? $tile['task_letter'] : $tile['task_color']),
            "preserve" => ["zeus_img"],
        ]);

        return RoundStart::class;
    }

    private function describeTask(array $tile): string
    {
        switch ($tile['task_type']) {
            case 'shrine':
                return ($tile['task_letter'] ?? '') . ' shrine';
            case 'statue':
                return ($tile['task_color'] ? $tile['task_color'] . ' ' : '') . 'statue';
            case 'offering':
                return ($tile['task_color'] ? $tile['task_color'] . ' ' : '') . 'offering';
            case 'monster':
                return ($tile['task_color'] ? $tile['task_color'] . ' ' : '') . 'monster';
            default:
                return (string)$tile['task_type'];
        }
    }

    function zombie(int $playerId) {
        $tile = $this->game->getObjectFromDB(
            "SELECT tile_id FROM zeus_tile
             WHERE player_id = $playerId AND is_completed = 0
             ORDER BY task_type, sort_order LIMIT 1"
        );
        if ($tile) {
            return $this->actDiscardTile((int)$tile['tile_id'], $playerId);
        }
        return RoundStart::class;
    }
}
