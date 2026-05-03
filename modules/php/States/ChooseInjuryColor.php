<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ChooseInjuryColor extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 46,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} chooses injuries to discard'),
            descriptionMyTurn: clienttranslate('${you}: choose an injury color to discard all of'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        $rows = $this->game->getObjectListFromDB(
            "SELECT DISTINCT card_type_arg FROM card
             WHERE card_type = 'injury' AND card_location = 'hand' AND card_location_arg = $playerId"
        );

        $colors = [];
        foreach ($rows as $row) {
            $colorIdx = (int)$row['card_type_arg'];
            $colors[] = MaterialDefs::COLORS[$colorIdx] ?? 'unknown';
        }

        return [
            'injuryColors' => $colors,
        ];
    }

    #[PossibleAction]
    public function actChooseColor(string $color, int $activePlayerId) {
        $colorIdx = MaterialDefs::COLOR_INDEX[$color] ?? null;
        if ($colorIdx === null) {
            throw new UserException(clienttranslate('Invalid color'));
        }

        $count = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId AND card_type_arg = $colorIdx"
        );
        if ($count === 0) {
            throw new UserException(clienttranslate('You have no injuries of that color'));
        }

        $this->game->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = 0
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId AND card_type_arg = $colorIdx"
        );
        $this->game->statInc($count, 'discarded_injury_cards', $activePlayerId);

        $this->notify->all("injuriesDiscardedByChoice",
            clienttranslate('${player_name} discards ${count} ${color} injury cards (Omega bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "color" => $color,
            "count" => $count,
        ]);

        return $this->grantShieldAndFinish($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        return $this->grantShieldAndFinish($activePlayerId);
    }

    private function grantShieldAndFinish(int $playerId): string
    {
        $currentShield = (int)$this->game->getUniqueValueFromDB(
            "SELECT shield_value FROM player WHERE player_id = $playerId"
        );
        $newShield = min(5, $currentShield + 1);

        $this->game->DbQuery(
            "UPDATE player SET shield_value = $newShield WHERE player_id = $playerId"
        );
        if ($newShield > $currentShield) {
            $this->game->statInc(1, 'shield_raised', $playerId);
        }

        $playerHexColor = $this->game->getUniqueValueFromDB(
            "SELECT player_color FROM player WHERE player_id = $playerId"
        );
        $playerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerHexColor] ?? 'blue';

        $this->notify->all("shieldIncreased",
            clienttranslate('${player_name} increases shield to ${value} (Omega bonus)'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "value" => $newShield,
            "playerColor" => $playerGameColor,
        ]);

        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);

        return $this->game->nextStateAfterDieAction($playerId);
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
