<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ExploreIsland extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 36,
            type: StateType::GAME,
            description: clienttranslate('Revealing island...'),
        );
    }

    public function onEnteringState(int $activePlayerId): string
    {
        $playerId = $activePlayerId;
        $hexQ = $this->game->globals->get('explore_hex_q');
        $hexR = $this->game->globals->get('explore_hex_r');

        // Mark hex as revealed
        $this->game->DbQuery(
            "UPDATE hex SET is_revealed = 1, revealed_by_player_id = $playerId
             WHERE q = $hexQ AND r = $hexR"
        );
        $this->game->statInc(1, 'islands_explored', $playerId);

        // Spend the die (sends dieUsed notification) — unless this is a free god ability
        $isGodExplore = (int)$this->game->globals->get('god_explore_source');
        if ($isGodExplore) {
            $this->game->globals->set('god_explore_source', null);
        } else {
            $this->game->spendActionSource($playerId);
        }

        // Get shrine info from hex
        $hex = $this->game->getObjectFromDB(
            "SELECT shrine_player_id, shrine_letter, shrine_game_color, color AS exploration_color
             FROM hex WHERE q = $hexQ AND r = $hexR"
        );
        $shrinePlayerId = (int)$hex['shrine_player_id'];
        $shrineLetter = $hex['shrine_letter'];
        $shrineOwnerGameColor = $hex['shrine_game_color'] ?? 'unknown';

        // Notify all: island revealed
        $this->notify->all("islandRevealed", clienttranslate('${player_name} explores an island, revealing a ${shrine_letter} shrine'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "hex_q" => $hexQ,
            "hex_r" => $hexR,
            "shrine_owner_id" => $shrinePlayerId,
            "shrine_owner_color" => $shrineOwnerGameColor,
            "shrine_letter" => $shrineLetter,
        ]);

        if ($shrinePlayerId === $playerId) {
            return $this->buildOwnShrine($playerId, $hexQ, $hexR, $shrineLetter);
        } else {
            return $this->applyExplorerBonus($playerId, $shrinePlayerId, $shrineLetter, $hexQ, $hexR);
        }
    }

    private function buildOwnShrine(int $playerId, int $hexQ, int $hexR, string $shrineLetter): string
    {
        // Find the shrine record for this player + letter
        $letters = $this->getPlayerLetters($playerId);
        $shrineIndex = array_search($shrineLetter, $letters);

        // Update shrine table
        $this->game->DbQuery(
            "UPDATE shrine SET is_built = 1, built_at_hex_q = $hexQ, built_at_hex_r = $hexR
             WHERE player_id = $playerId AND shrine_index = $shrineIndex"
        );

        // Notify shrine built
        $this->notify->all("shrineBuilt", clienttranslate('${player_name} builds a shrine!'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "hex_q" => $hexQ,
            "hex_r" => $hexR,
            "shrine_index" => $shrineIndex,
            "shrine_letter" => $shrineLetter,
        ]);

        // Complete Zeus tile for shrine
        $completedTileId = $this->completeZeusTile($playerId, $shrineLetter);
        if ($completedTileId !== null) {
            $playerRow = $this->game->getObjectFromDB(
                "SELECT tasks_completed, player_score FROM player WHERE player_id = $playerId"
            );
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
                "player_id" => $playerId,
                "player_name" => $this->game->getPlayerNameById($playerId),
                "tile_id" => $completedTileId,
                "tasks_completed" => (int)$playerRow['tasks_completed'],
                "player_score" => (int)$playerRow['player_score'],
                "task_type" => "shrine",
                "shrine_letter" => $shrineLetter,
            ]);

            // Reward: advance any god by 1 step
            $this->game->globals->set('god_steps_remaining', 1);
            $this->game->globals->set('god_advance_reason', 'shrine_reward');
            return ChooseGodAdvancement::class;
        }

        return $this->returnToActions($playerId);
    }

    private function applyExplorerBonus(int $playerId, int $shrinePlayerId, string $shrineLetter, int $hexQ, int $hexR): string
    {
        $bonus = MaterialDefs::SHRINE_BONUSES[$shrineLetter] ?? null;
        if (!$bonus) {
            return $this->returnToActions($playerId);
        }

        switch ($bonus['type']) {
            case 'favor':
                // Psi: +4 favor tokens to EXPLORING player
                $delta = $bonus['value'];
                $this->game->DbQuery(
                    "UPDATE player SET favor_tokens = favor_tokens + $delta WHERE player_id = $playerId"
                );
                $newFavor = (int)$this->game->getUniqueValueFromDB(
                    "SELECT favor_tokens FROM player WHERE player_id = $playerId"
                );
                $this->notify->all("favorTokensChanged", clienttranslate('${player_name} receives ${delta} Favor Tokens from exploring a shrine'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "favor_tokens" => $newFavor,
                    "delta" => $delta,
                ]);
                break;

            case 'oracle':
                // Phi: Draw 2 oracle cards for EXPLORING player
                $drawCount = $bonus['value'];
                $drawnCards = [];
                for ($i = 0; $i < $drawCount; $i++) {
                    $card = $this->game->getObjectFromDB(
                        "SELECT card_id, card_type_arg FROM card
                         WHERE card_type = 'oracle' AND card_location = 'deck'
                         ORDER BY card_order ASC LIMIT 1"
                    );
                    if ($card !== null) {
                        $cardId = (int)$card['card_id'];
                        $colorIdx = (int)$card['card_type_arg'];
                        $this->game->DbQuery(
                            "UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                             WHERE card_id = $cardId"
                        );
                        $drawnCards[] = [
                            'card_id' => $cardId,
                            'color' => MaterialDefs::COLORS[$colorIdx] ?? 'red',
                        ];
                    }
                }
                if (count($drawnCards) > 0) {
                    $this->game->statInc(count($drawnCards), 'oracle_cards_drawn', $playerId);
                }
                // Private notification still drives the active player's hand UI.
                $this->notify->player($playerId, "oracleCardsDrawnPrivate", '', [
                    "cards" => $drawnCards,
                ]);

                // Public: card identities are now shared so every panel can render
                // opponents' real card colors.
                $this->notify->all("oracleCardsDrawn", clienttranslate('${player_name} draws ${count} Oracle Cards from exploring a shrine'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "count" => count($drawnCards),
                    "cards" => $drawnCards,
                    "shrine_letter" => $shrineLetter,
                ]);
                break;

            case 'gods':
                // Sigma: Advance gods by 3 total steps
                $this->game->globals->set('god_steps_remaining', $bonus['value']);
                $this->game->globals->set('god_advance_reason', 'sigma_bonus');
                $this->notify->all("shrineExplored", clienttranslate('${player_name} earns Sigma bonus: advance gods by ${value} steps'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "bonus_type" => $bonus['type'],
                    "value" => $bonus['value'],
                    "description" => $bonus['description'],
                    "shrine_letter" => $shrineLetter,
                ]);
                return ChooseGodAdvancement::class;

            case 'heal':
                // Omega: Discard all injuries of chosen color + 1 shield
                $injuryCount = (int)$this->game->getUniqueValueFromDB(
                    "SELECT COUNT(*) FROM card
                     WHERE card_type = 'injury' AND card_location = 'hand'
                     AND card_location_arg = $playerId"
                );

                $this->notify->all("shrineExplored", clienttranslate('${player_name} earns Omega bonus: discard injuries + shield'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "bonus_type" => $bonus['type'],
                    "value" => $bonus['value'],
                    "description" => $bonus['description'],
                    "shrine_letter" => $shrineLetter,
                ]);

                if ($injuryCount > 0) {
                    return ChooseInjuryColor::class;
                }

                // No injuries — just grant +1 shield inline
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
                return $this->returnToActions($playerId);
        }

        return $this->returnToActions($playerId);
    }

    private function completeZeusTile(int $playerId, string $shrineLetter): ?int
    {
        $safeLetter = addslashes($shrineLetter);
        $zeusTile = $this->game->getObjectFromDB(
            "SELECT tile_id FROM zeus_tile
             WHERE player_id = $playerId AND task_type = 'shrine'
             AND task_letter = '$safeLetter' AND is_completed = 0
             LIMIT 1"
        );

        if (!$zeusTile) return null;

        $tileId = (int)$zeusTile['tile_id'];
        $this->game->DbQuery("UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tileId");
        $this->game->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1, player_score = player_score + 1
             WHERE player_id = $playerId"
        );
        $this->game->statInc(1, 'tasks_completed', $playerId);
        $this->game->statInc(1, 'shrine_tasks_completed', $playerId);
        return $tileId;
    }

    private function getPlayerLetters(int $playerId): array
    {
        $playerColor = $this->game->getUniqueValueFromDB(
            "SELECT player_color FROM player WHERE player_id = $playerId"
        );
        $gameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerColor] ?? null;
        return MaterialDefs::SHRINE_LETTERS[$gameColor] ?? [];
    }

    private function returnToActions(int $playerId): string
    {
        // Clean up globals
        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);

        if ($this->game->allDiceUsed($playerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

}
