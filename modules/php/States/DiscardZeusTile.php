<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class DiscardZeusTile extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 5,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} is choosing a Zeus tile to discard as their Ship Tile ability'),
            descriptionMyTurn: clienttranslate('Your ship tile requires you to return a Zeus tile to the box — pick one to discard. You won\'t receive its reward, and you\'ll win at 11 completed tasks.'),
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
        // tasks_completed is intentionally NOT incremented: the rule is the
        // player wins at 11 actual completions (see fewer_tasks taskTotal),
        // and the discarded tile shouldn't count toward that progress.
        $this->game->DbQuery(
            "UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tile_id"
        );

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

        $this->notify->all("zeusTileDiscarded",
            clienttranslate('${player_name} returns a ${task_description} Zeus tile to the box (fewer_tasks ship tile)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "tile_id" => (int)$tile['tile_id'],
            "task_type" => $tile['task_type'],
            "task_color" => $tile['task_color'],
            "task_letter" => $tile['task_letter'],
            "task_description" => $this->describeTask($tile),
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
