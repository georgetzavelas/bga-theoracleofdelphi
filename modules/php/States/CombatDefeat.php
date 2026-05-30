<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;

class CombatDefeat extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 43,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} lost the round'),
            descriptionMyTurn: clienttranslate('Pay 1 Favor to continue or surrender'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $favor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );
        $monsterId = $this->game->globals->get('combat_monster_id');
        $monster = $this->game->getObjectFromDB(
            "SELECT monster_type, color FROM monster WHERE monster_id = $monsterId"
        );
        $shieldValue = (int)$this->game->getUniqueValueFromDB(
            "SELECT shield_value FROM player WHERE player_id = $playerId"
        );
        return [
            'strength' => $this->game->globals->get('combat_strength'),
            'roll' => $this->game->globals->get('combat_roll'),
            'favorTokens' => $favor,
            'canContinue' => $favor >= 1,
            'monster_type' => $monster ? $monster['monster_type'] : null,
            'shield_value' => $shieldValue,
        ];
    }

    #[PossibleAction]
    public function actPayFavor(int $activePlayerId) {
        $favor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
        );
        if ($favor < 1) {
            throw new UserException(clienttranslate('Not enough Favor Tokens'));
        }

        // Deduct 1 favor
        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens - 1 WHERE player_id = $activePlayerId"
        );
        $this->game->statInc(1, 'favor_tokens_spent', $activePlayerId);

        // Reduce monster strength by 1
        $strength = $this->game->globals->get('combat_strength');
        $strength = max(0, $strength - 1);
        $this->game->globals->set('combat_strength', $strength);

        $newFavor = $favor - 1;
        $this->notify->all("combatContinue", clienttranslate('${player_name} pays 1 ${favor_tok} to continue (strength now ${strength})'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "favor_tok" => "favor",
            "strength" => $strength,
            "favor_remaining" => $newFavor,
        ]);

        // Roll the next round's battle die inline — paying favor and rolling
        // are paired in the rules with no decision in between, so collapsing
        // them avoids a second "Roll Battle Die" click in the dialog.
        $this->game->statInc(1, 'monster_combat_rounds', $activePlayerId);
        $roll = bga_rand(0, 9);
        $this->game->globals->set('combat_roll', $roll);
        $this->notify->all('battleDieRolled',
            clienttranslate('${player_name} rolls ${roll} (needed a ${strength})'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'roll' => $roll,
            'strength' => $strength,
        ]);

        return CombatResult::class;
    }

    #[PossibleAction]
    public function actSurrender(int $activePlayerId) {
        $this->notify->all("combatSurrender", clienttranslate('${player_name} surrenders'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);

        // Spend the deferred action source (die or oracle card)
        $this->restoreActionSourceForSpending();
        $this->game->spendActionSource($activePlayerId);

        $this->clearCombatGlobals();
        return $this->afterCombatTransition($activePlayerId);
    }

    /**
     * Restore the deferred action source globals so spendActionSource() can process them.
     */
    private function restoreActionSourceForSpending(): void
    {
        $oracleCardId = (int)$this->game->globals->get('combat_oracle_card_id');
        if ($oracleCardId > 0) {
            $this->game->globals->set('selected_oracle_card_id', $oracleCardId);
        } else {
            $dieIndex = $this->game->globals->get('combat_die_index');
            $this->game->globals->set('selected_die_index', $dieIndex);
        }
    }

    private function clearCombatGlobals(): void
    {
        $this->game->globals->set('combat_monster_id', null);
        $this->game->globals->set('combat_strength', null);
        $this->game->globals->set('combat_roll', null);
        $this->game->globals->set('combat_die_index', null);
        $this->game->globals->set('combat_oracle_card_id', null);
    }

    private function afterCombatTransition(int $playerId): string
    {
        return $this->game->nextStateAfterDieAction($playerId);
    }

    function zombie(int $playerId) {
        return $this->actSurrender($playerId);
    }
}
