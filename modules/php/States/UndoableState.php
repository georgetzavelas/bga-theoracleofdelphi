<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;

use Bga\GameFramework\States\PossibleAction;

/**
 * Mixed into every state that can OFFER undo: the hub (PlayerActions) after a
 * clean action returns, and the two amber pickers (CombatVictory, SelectReward)
 * before the reward is committed. actUndo simply delegates to the engine, which
 * restores the single snapshot and routes back to PlayerActions.
 */
trait UndoableState
{
    #[PossibleAction]
    public function actUndo(int $activePlayerId): string
    {
        return $this->game->performUndo();
    }

    /** Merge into a state's getArgs() return so the client can show the button. */
    protected function undoArgs(): array
    {
        return [
            'undoAvailable'   => $this->game->undoAvailable(),
            'undoActionLabel' => $this->game->undoAvailable()
                ? $this->game->getUniqueValueFromDB("SELECT action_label FROM undo_snapshot WHERE id = 1")
                : null,
        ];
    }
}
