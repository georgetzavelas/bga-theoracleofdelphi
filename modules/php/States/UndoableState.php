<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;

use Bga\GameFramework\States\PossibleAction;

/**
 * Mixed into every state that can OFFER undo: the hub (PlayerActions) after a
 * clean action returns, and the two amber pickers (CombatVictory, SelectReward)
 * before the reward is committed. actUndo simply delegates to the engine, which
 * restores the scratch slot and routes back to PlayerActions.
 *
 * Restart Turn is deliberately NOT part of this trait's default args. It is
 * hub-only: the amber pickers are mid-action-unit states reached through a
 * reveal, which has already released the pin, so a Restart Turn button there
 * would be either absent or lying. PlayerActions opts in with undoArgs(true).
 */
trait UndoableState
{
    #[PossibleAction]
    public function actUndo(int $activePlayerId): string
    {
        return $this->game->performUndo();
    }

    /**
     * Merge into a state's getArgs() return so the client can show the buttons.
     *
     * $withRestart adds the Restart Turn flags. The engine gates them again
     * (Game::restartTurnAvailable checks the deploy flag, a live pin, and at
     * least one action since it was written), so passing true never forces a
     * button on screen — it only makes the state eligible to show one.
     */
    protected function undoArgs(bool $withRestart = false): array
    {
        $args = [
            'undoAvailable'   => $this->game->undoAvailable(),
            'undoActionLabel' => $this->game->undoActionLabel(),
        ];
        if ($withRestart) {
            $args['restartTurnAvailable'] = $this->game->restartTurnAvailable();
            $args['restartTurnLabel']     = $this->game->restartTurnLabel();
        }
        return $args;
    }
}
