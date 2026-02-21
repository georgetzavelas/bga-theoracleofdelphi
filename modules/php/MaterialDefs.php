<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed;

/**
 * Static game material definitions. All data is compile-time constant.
 * Sources: rulebook, misc/monster-and-gods.md, misc/ship-tiles.md,
 *          misc/equipment-cards.md, misc/companion-cards.md
 */
class MaterialDefs
{
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
}
