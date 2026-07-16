<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi;

/**
 * Pure serialization contract for the undo buffer. No DB access, no framework
 * dependency, so it is unit-testable with the standalone smoke-test harness.
 * The Game class reads/writes rows; this class only turns the resulting
 * associative array into JSON and back.
 */
final class UndoState
{
    /**
     * Game-content tables captured by the undo buffer. Static tables
     * (temple, board_placement) are excluded because they never change
     * after setup. `player` and `stats` are handled separately (column
     * UPDATE, never delete). `undo_snapshot` is never itself captured.
     */
    public const SNAPSHOT_TABLES = [
        'hex', 'monster', 'offering', 'statue', 'shrine', 'oracle_die',
        'player_god', 'zeus_tile', 'god_advancement_queue',
        'player_island_knowledge', 'card',
    ];

    /**
     * Turn-scoped globals captured by the undo buffer. These are the keys
     * that any single clean action can mutate. Cross-turn/setup globals
     * (first_player_id, titan_holder_id, zeus_position, ...) are stable
     * within a turn, so omitting them is safe. Keep in sync with any new
     * turn-scratch global introduced in a state class.
     */
    public const GLOBAL_KEYS = [
        'selected_die_index', 'selected_oracle_card_id', 'oracle_card_played',
        'oracle_card_play_colors', 'active_god_ability', 'god_explore_source',
        'explore_hex_q', 'explore_hex_r', 'cargo_action_type', 'cargo_item_id',
        'combat_monster_id', 'combat_strength', 'combat_roll', 'ares_auto_defeat',
        'god_steps_remaining', 'god_advance_reason', 'pending_god_reset',
        'reward_type', 'reward_color', 'apollo_wild_active',
        'apollo_pending_recolor', 'wild_card_chosen_color',
        'bonus_action_color', 'bonus_action_spent_color', 'pre_bonus_die_index',
        'eq13_card_id', 'eq17_card_id', 'eq17_color_options', 'eq21_card_id',
        'eq_statue_card_id', 'equipment_post_activation_state',
        'peek_viewing', 'peek_hexes',
        'equipment_bonus_action_available', 'equipment_bonus_action_used',
        'demigod_wild_resolved', 'eq_statue_color_options',
        'raise_statue_dest_q', 'raise_statue_dest_r',
        'selected_oracle_card_color', 'combat_die_index', 'combat_oracle_card_id',
    ];

    public static function encode(array $state): string
    {
        // JSON_INVALID_UTF8_SUBSTITUTE: a single row holding malformed UTF-8
        // (e.g. a stray byte in a text column) would otherwise make
        // json_encode return false, which the `: string` return type turns
        // into a TypeError — silently swallowed by undoCheckpoint, leaving
        // undo permanently dead for that game. Substituting bad bytes with
        // U+FFFD keeps the disposable snapshot usable instead of failing the
        // whole buffer.
        $json = json_encode([
            'tables'  => $state['tables']  ?? [],
            'globals' => $state['globals'] ?? [],
            // Player scores, captured/restored via the BGA counter API rather
            // than as player-table columns. Keyed by player id.
            'scores'  => $state['scores']  ?? [],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

        // With malformed UTF-8 now substituted, a false here means a cause
        // substitution can't rescue (Inf/NaN, max depth). Surface it with a
        // real message instead of a bare "false returned" TypeError.
        if ($json === false) {
            throw new \RuntimeException(
                'UndoState::encode failed: ' . json_last_error_msg()
            );
        }
        return $json;
    }

    /** @return array{tables: array, globals: array, scores: array} */
    public static function decode(string $json): array
    {
        $decoded = json_decode($json, true);
        if (!is_array($decoded)) {
            return ['tables' => [], 'globals' => [], 'scores' => []];
        }
        return [
            'tables'  => $decoded['tables']  ?? [],
            'globals' => $decoded['globals'] ?? [],
            'scores'  => $decoded['scores']  ?? [],
        ];
    }
}
