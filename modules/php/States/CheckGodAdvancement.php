<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

class CheckGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 9,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you} may advance a god from ${source_player_name}\'s Oracle Consultation'),
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

        // Eligibility computation lives on Game so the silent
        // drainAutoSkippableGodAdvancements helper shares the same rule
        // set (a god is eligible iff its colour matches a source die
        // colour AND track_step ∈ (0, 6)).
        $eligibleGods = $this->game->computeEligibleGodsForOracleConsult($playerId, $sourcePlayerId);
        $dice = $this->game->getObjectListFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $sourcePlayerId"
        );
        $sourceColors = array_values(array_unique(array_column($dice, 'color')));

        return [
            'queueId' => $queueId,
            'sourcePlayerId' => $sourcePlayerId,
            'eligibleGods' => $eligibleGods,
            'sourceColors' => $sourceColors,
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
        $currentStep = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_step FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        $newStep = $currentStep + 1;

        $this->game->DbQuery(
            "UPDATE player_god SET track_step = $newStep
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        $this->game->statInc($newStep - $currentStep, "{$godName}_advances", $activePlayerId);

        // Delete the queue entry
        $queueId = (int)$args['queueId'];
        $this->game->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name} (from ${source_player_name}\'s Oracle Consultation)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_step" => $newStep,
            "source_player_name" => $args['source_player_name'],
        ]);

        return $this->checkForMore($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $args = $this->getArgs();
        $queueId = (int)($args['queueId'] ?? 0);
        $hadEligible = !empty($args['eligibleGods']);
        $sourcePlayerId = (int)($args['sourcePlayerId'] ?? 0);
        $sourcePlayerName = (string)($args['source_player_name'] ?? '');

        if ($queueId > 0) {
            $this->game->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");
        }

        // Both branches cite the source consultation so the log row is
        // self-explanatory in multi-opponent turns where several
        // skipGodAdvancement notifs can fire back-to-back. The
        // had-eligible=false branch is a defensive fallback — under
        // normal flow drainAutoSkippableGodAdvancements removes those
        // entries before the prompt is ever shown.
        $message = $hadEligible
            ? clienttranslate('${player_name} skips advancing a god from ${source_player_name}\'s Oracle Consultation')
            : clienttranslate('${player_name} had no god eligible to advance from ${source_player_name}\'s Oracle Consultation');
        $this->notify->all("skipGodAdvancement", $message, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "source_player_id" => $sourcePlayerId,
            "source_player_name" => $sourcePlayerName,
        ]);

        return $this->checkForMore($activePlayerId);
    }

    private function checkForMore(int $playerId): string
    {
        // Drain any queue entries that just became empty — e.g. the
        // advancement we just committed promoted a god to step 6 and
        // that god was the only matching colour for a still-pending
        // entry. Each silently-skipped entry emits its own log line.
        $this->game->drainAutoSkippableGodAdvancements($playerId);
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
