<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

require_once(__DIR__ . '/../HexUtils.php');

class SelectAction extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 21,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects action'),
            descriptionMyTurn: clienttranslate('Select action for die'),
        );
    }

    public function getArgs(): array
    {
        $dieIndex = $this->game->globals->get('selected_die_index');
        $playerId = (int)$this->game->getActivePlayerId();
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        $dieColor = $die ? $die['color'] : null;
        $fightableMonsters = $this->getFightableMonsters($playerId, $dieColor);

        return [
            'dieIndex' => $dieIndex,
            'dieColor' => $dieColor,
            'fightableMonsters' => $fightableMonsters,
        ];
    }

    private function getFightableMonsters(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $safeColor = addslashes($dieColor);
        $monsters = $this->game->getObjectListFromDB(
            "SELECT monster_id, color, monster_type, hex_q, hex_r
             FROM monster WHERE is_defeated = 0 AND color = '$safeColor'"
        );

        $fightable = [];
        foreach ($monsters as $m) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']);
            if ($dist === 1) {
                $fightable[] = [
                    'monster_id' => (int)$m['monster_id'],
                    'monster_type' => $m['monster_type'],
                    'color' => $m['color'],
                    'hex_q' => (int)$m['hex_q'],
                    'hex_r' => (int)$m['hex_r'],
                ];
            }
        }
        return $fightable;
    }

    #[PossibleAction]
    public function actMoveShip(int $activePlayerId) {
        return MoveShip::class;
    }

    #[PossibleAction]
    public function actFightMonster(int $monster_id, int $activePlayerId) {
        $dieIndex = $this->game->globals->get('selected_die_index');
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $dieColor = $die ? $die['color'] : null;
        $fightable = $this->getFightableMonsters($activePlayerId, $dieColor);

        $valid = false;
        foreach ($fightable as $m) {
            if ($m['monster_id'] === $monster_id) {
                $valid = true;
                break;
            }
        }
        if (!$valid) {
            throw new UserException(clienttranslate('You cannot fight that monster'));
        }

        $this->game->globals->set('combat_monster_id', $monster_id);
        return FightMonsterStart::class;
    }

    #[PossibleAction]
    public function actCancelDieSelection(int $activePlayerId) {
        $this->game->globals->set('selected_die_index', null);
        $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actCancelDieSelection($playerId);
    }
}
