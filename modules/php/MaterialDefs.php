<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed;

/**
 * Static game material definitions. All data is compile-time constant.
 * Sources: rulebook, misc/monster-and-gods.md, misc/ship-tiles.md,
 *          misc/equipment-cards.md, misc/companion-cards.md
 */
final class MaterialDefs
{
    private function __construct() {}

    public static function monsterTypeByColor(string $color): string
    {
        foreach (self::MONSTERS as $type => $data) {
            if ($data['color'] === $color) {
                return $type;
            }
        }
        throw new \InvalidArgumentException("No monster for color: $color");
    }

    public const COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

    public const MONSTERS = [
        'chimera'  => ['color' => 'yellow'],
        'cyclops'  => ['color' => 'red'],
        'gorgon'   => ['color' => 'green'],
        'hydra'    => ['color' => 'pink'],
        'minotaur' => ['color' => 'black'],
        'siren'    => ['color' => 'blue'],
    ];

    public const GODS = [
        'aphrodite' => ['color' => 'red',    'ability' => 'discard_all_injuries'],
        'apollo'    => ['color' => 'yellow',  'ability' => 'dice_wild'],
        'ares'      => ['color' => 'black',   'ability' => 'auto_defeat_monster'],
        'artemis'   => ['color' => 'green',   'ability' => 'free_explore_island'],
        'hermes'    => ['color' => 'pink',    'ability' => 'grab_any_statue'],
        'poseidon'  => ['color' => 'blue',    'ability' => 'teleport_ship'],
    ];

    // Ship tile IDs match img/ship-tiles/ship-{id}.jpg
    public const SHIP_TILES = [
        0 => ['ability' => 'shield_start',       'storage' => 2,
              'description' => '+2 Shield at game start'],
        1 => ['ability' => 'starting_equipment',  'storage' => 2,
              'description' => 'Start with 1 Equipment + 1 Oracle card'],
        2 => ['ability' => 'reverse_recolor',     'storage' => 4,
              'description' => 'Recolor counterclockwise + 4 storage'],
        3 => ['ability' => 'favor_plus_1',        'storage' => 2,
              'description' => '+1 Favor when gaining favor (incl. starting)'],
        4 => ['ability' => 'god_track_high',      'storage' => 2,
              'description' => 'Gods start/return to player-count row'],
        5 => ['ability' => 'range_plus_2',        'storage' => 2,
              'description' => '+2 Ship movement range'],
        6 => ['ability' => 'fewer_tasks',         'storage' => 2,
              'description' => '-1 Zeus tile (11 tasks to win)'],
        7 => ['ability' => 'recolor_discount',    'storage' => 2,
              'description' => '-1 recolor cost'],
    ];

    // Statue island pedestal colors, indexed by cluster ID.
    // Array order = pedestal position: [0]=E edge, [1]=SW edge, [2]=NW edge.
    // Each color appears exactly 3 times across all islands (18 total = 6 colors × 3).
    public const STATUE_ISLAND_COLORS = [
        'cluster-7-5'  => ['pink', 'blue', 'red'],
        'cluster-9-0'  => ['green', 'red', 'yellow'],
        'cluster-9-1'  => ['blue', 'black', 'yellow'],
        'cluster-9-2'  => ['pink', 'green', 'yellow'],
        'cluster-11-1' => ['green', 'black', 'blue'],
        'cluster-11-2' => ['pink', 'black', 'red'],
    ];

    // Exploration color for each shrine hex, indexed by cluster ID + relative offset.
    // The die color must match this to explore the island.
    // 2 per die color = 12 total shrine hexes.
    public const SHRINE_EXPLORATION_COLORS = [
        'cluster-7-1' => [['dq' => -1, 'dr' => 0, 'color' => 'green']],
        'cluster-7-2' => [['dq' => -1, 'dr' => 0, 'color' => 'green']],
        'cluster-7-3' => [['dq' => 0, 'dr' => -1, 'color' => 'black']],
        'cluster-7-4' => [['dq' => -1, 'dr' => 0, 'color' => 'blue']],
        'cluster-7-5' => [['dq' => -1, 'dr' => 0, 'color' => 'blue']],
        'cluster-9-0' => [['dq' => 0, 'dr' => 0, 'color' => 'yellow']],
        'cluster-9-1' => [['dq' => 0, 'dr' => -1, 'color' => 'black']],
        'cluster-9-2' => [['dq' => 1, 'dr' => -1, 'color' => 'red']],
        'cluster-11-0' => [
            ['dq' => -1, 'dr' => 0, 'color' => 'red'],
            ['dq' => -1, 'dr' => 3, 'color' => 'pink'],
        ],
        'cluster-11-1' => [['dq' => 1, 'dr' => 0, 'color' => 'yellow']],
        'cluster-11-2' => [['dq' => -2, 'dr' => 2, 'color' => 'pink']],
    ];

    // Equipment card IDs match img/equipment/card-{id:03d}.jpg
    public const EQUIPMENT_CARDS = [
        0  => ['type' => 'permanent', 'ability' => 'oracle_favor_yellow',
               'description' => 'Consulting oracle: if yellow shows, +2 Favor'],
        1  => ['type' => 'permanent', 'ability' => 'oracle_favor_red',
               'description' => 'Consulting oracle: if red shows, +2 Favor'],
        2  => ['type' => 'permanent', 'ability' => 'oracle_favor_black',
               'description' => 'Consulting oracle: if black shows, +2 Favor'],
        3  => ['type' => 'permanent', 'ability' => 'extra_action',
               'description' => 'Spend 3 Favor for additional action of any color'],
        4  => ['type' => 'permanent', 'ability' => 'color_action_pink',
               'god' => 'hermes',
               'description' => 'Pink die: +1 Favor, +1 Oracle Card, advance Hermes'],
        5  => ['type' => 'permanent', 'ability' => 'color_action_green',
               'god' => 'artemis',
               'description' => 'Green die: +1 Favor, +1 Oracle Card, advance Artemis'],
        6  => ['type' => 'permanent', 'ability' => 'color_action_blue',
               'god' => 'poseidon',
               'description' => 'Blue die: +1 Favor, +1 Oracle Card, advance Poseidon'],
        7  => ['type' => 'one_time',  'ability' => 'big_bonus',
               'description' => '+3 Favor, +1 Oracle Card, advance 1-2 Gods 2 steps total'],
        8  => ['type' => 'permanent', 'ability' => 'range_plus_1',
               'description' => '+1 Ship range'],
        9  => ['type' => 'permanent', 'ability' => 'statue_distance',
               'description' => 'Load/Raise Statue from 1 water space away'],
        10 => ['type' => 'permanent', 'ability' => 'combat_distance',
               'description' => 'Fight/Explore/Shrine from 1 water space away'],
        11 => ['type' => 'permanent', 'ability' => 'reward_god_advance',
               'description' => 'On reward from Offering/Statue/Monster: advance 1 God'],
        12 => ['type' => 'permanent', 'ability' => 'offering_distance',
               'description' => 'Load/Make Offering from 1 water space away'],
        13 => ['type' => 'one_time',  'ability' => 'look_and_explore',
               'description' => 'Look at 2 islands, put 1 back, explore the other'],
        14 => ['type' => 'permanent', 'ability' => 'cross_shallows',
               'description' => 'Ship crosses shallows (free, no space cost)'],
        15 => ['type' => 'permanent', 'ability' => 'injury_tolerance',
               'description' => 'Recover at 4 same-color or 8 total (not 3/6)'],
        16 => ['type' => 'mixed',     'ability' => 'storage_and_shield',
               'description' => 'Permanent: +1 storage. One-time: +1 Shield'],
        17 => ['type' => 'one_time',  'ability' => 'grab_offering_warm',
               'colors' => ['red', 'green', 'yellow'],
               'description' => 'Take 1 red/green/yellow Offering from any island'],
        18 => ['type' => 'one_time',  'ability' => 'grab_offering_cool',
               'colors' => ['pink', 'blue', 'black'],
               'description' => 'Take 1 pink/blue/black Offering from any island'],
        19 => ['type' => 'one_time',  'ability' => 'grab_statue_cool',
               'colors' => ['pink', 'blue', 'black'],
               'description' => 'Take 1 pink/blue/black Statue from city'],
        20 => ['type' => 'one_time',  'ability' => 'grab_statue_warm',
               'colors' => ['red', 'green', 'yellow'],
               'description' => 'Take 1 red/green/yellow Statue from city'],
        21 => ['type' => 'one_time',  'ability' => 'advance_god_max',
               'gods' => ['poseidon', 'hermes', 'artemis', 'aphrodite'],
               'description' => 'Advance 1 of Poseidon/Hermes/Artemis/Aphrodite to top'],
    ];

    // Companion card index matches img/companion/{color}-card-{index}.png
    public const COMPANION_TYPES = [
        0 => ['subtype' => 'creature',  'ability' => 'move_range_plus_3',
              'description' => 'Moving with this color die: +3 range, end on any color'],
        1 => ['subtype' => 'demigod',   'ability' => 'die_wild_color',
              'description' => 'Draw 1 Oracle Card. Use any die in this color as wild'],
        2 => ['subtype' => 'hero',      'ability' => 'shield_and_discard',
              'description' => '+2 Shield. May discard injuries of this color anytime'],
    ];

    // Specific companion names keyed by card_type_arg (= color_idx * 3 + type_idx).
    // Colors in COLORS index order: red, yellow, green, blue, pink, black.
    public const COMPANION_NAMES = [
         0 => 'Phoenix',      1 => 'Penthesilea',  2 => 'Odysseus',
         3 => 'Gryphos',      4 => 'Minos',        5 => 'Bellerophon',
         6 => 'Pegasus',      7 => 'Perseus',      8 => 'Hektor',
         9 => 'Nereide',     10 => 'Herakles',    11 => 'Achilles',
        12 => 'Pan',         13 => 'Helena',      14 => 'Aias',
        15 => 'Cheiron',     16 => 'Kirke',       17 => 'Theseus',
    ];

    // Specific equipment card names keyed by card_type_arg (0-21).
    // Matches MaterialDefs::EQUIPMENT_CARDS index order.
    public const EQUIPMENT_NAMES = [
         0 => 'Yellow Charm',      1 => 'Red Charm',         2 => 'Black Charm',
         3 => 'Bonus Action',      4 => 'Hermes Amulet',     5 => 'Artemis Amulet',
         6 => 'Poseidon Amulet',   7 => 'Divine Favor',      8 => 'Quadrireme',
         9 => 'Long Hook',        10 => 'Seafarer Charm',   11 => 'Blessed Reward',
        12 => 'Altar Caller',     13 => 'Island Scout',     14 => 'Shallow Runner',
        15 => 'Pain Tolerance',   16 => 'Reinforced Hull',  17 => 'Warm Offering Hook',
        18 => 'Cool Offering Hook', 19 => 'Cool Statue Hook', 20 => 'Warm Statue Hook',
        21 => 'Divine Surge',
    ];

    /**
     * Return the named hero/demigod/creature for a color + type combination.
     * typeIdx 0=creature, 1=demigod, 2=hero.
     */
    public static function companionName(string $color, int $typeIdx): string
    {
        $colorIdx = array_search($color, self::COLORS, true);
        if ($colorIdx === false) return '';
        return self::COMPANION_NAMES[(int)$colorIdx * 3 + $typeIdx] ?? '';
    }

    // Oracle: 6 colors x 5 = 30 cards. Image: img/oracle/{color}.jpg
    public const ORACLE_CARDS_PER_COLOR = 5;

    // Injury: 6 colors x 7 = 42 cards. Image: img/injury/{color}.jpg
    public const INJURY_CARDS_PER_COLOR = 7;

    // Shrine Greek letters per player color. Image: img/zeus-tiles/shrines/{player}-player-{letter}.jpg
    public const SHRINE_LETTERS = [
        'red'    => ['omega', 'phi', 'psi'],
        'yellow' => ['omega', 'psi', 'sigma'],
        'green'  => ['phi', 'psi', 'sigma'],
        'blue'   => ['omega', 'phi', 'sigma'],
    ];

    // Reward when another player explores an island matching your shrine
    public const SHRINE_BONUSES = [
        'psi'   => ['type' => 'favor',   'value' => 4,
                    'description' => 'Take 4 Favor Tokens'],
        'phi'   => ['type' => 'oracle',  'value' => 2,
                    'description' => 'Draw 2 Oracle Cards'],
        'sigma' => ['type' => 'gods',    'value' => 3,
                    'description' => 'Advance Gods 3 total steps'],
        'omega' => ['type' => 'heal',    'value' => 0,
                    'description' => 'Discard all injuries + 1 Shield'],
    ];

    // 4 dual-sided Zeus tiles: offering color on front, monster type on back.
    // During setup, 2 randomly placed offering-up, 2 monster-up.
    public const DUAL_SIDED_TILES = [
        ['offering_color' => 'blue',   'monster_type' => 'siren'],
        ['offering_color' => 'yellow', 'monster_type' => 'chimera'],
        ['offering_color' => 'pink',   'monster_type' => 'cyclops'],
        ['offering_color' => 'green',  'monster_type' => 'minotaur'],
    ];

    // Player-count row: when advancing a god FROM row 0, jump to this row
    public const PLAYER_COUNT_ROW = [2 => 3, 3 => 2, 4 => 1];

    // Map BGA player_color hex to game color name
    public const HEX_TO_GAME_COLOR = [
        'dc3545' => 'red',
        'ffc107' => 'yellow',
        '28a745' => 'green',
        '007bff' => 'blue',
    ];

    // Map color name to integer index for card_type_arg
    public const COLOR_INDEX = [
        'red' => 0, 'yellow' => 1, 'green' => 2,
        'blue' => 3, 'pink' => 4, 'black' => 5,
    ];

    // Oracle wheel clockwise order for recolor cost calculation
    public const ORACLE_WHEEL_ORDER = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];

    // Translated color names for status bar display
    public const COLOR_NAMES = [
        'red' => 'Red',
        'black' => 'Black',
        'pink' => 'Pink',
        'blue' => 'Blue',
        'yellow' => 'Yellow',
        'green' => 'Green',
    ];
}
