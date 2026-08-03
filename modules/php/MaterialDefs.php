<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

/**
 * Static game material definitions. Data is compile-time constant, except the
 * player-visible equipment strings (equipmentNames() / equipmentDescriptions()),
 * which are static methods so their literals can sit inside clienttranslate()
 * for BGA's Translation page — a `const` initializer cannot hold a call. Those
 * two methods are the only part of this class that needs the BGA runtime; tests
 * loading this file standalone stub clienttranslate().
 *
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
    //
    // Logic keys only — see shipTileNames() / shipTileDescriptions() /
    // shipTileDetails() for the player-visible strings.
    public const SHIP_TILES = [
        0 => ['ability' => 'shield_start',        'storage' => 2],
        1 => ['ability' => 'starting_equipment',  'storage' => 2],
        2 => ['ability' => 'reverse_recolor',     'storage' => 4],
        3 => ['ability' => 'favor_plus_1',        'storage' => 2],
        4 => ['ability' => 'god_track_high',      'storage' => 2],
        5 => ['ability' => 'range_plus_2',        'storage' => 2],
        6 => ['ability' => 'fewer_tasks',         'storage' => 2],
        7 => ['ability' => 'recolor_discount',    'storage' => 2],
    ];

    /**
     * Ship tile names, keyed by tile id. Same clienttranslate() rationale as
     * equipmentNames().
     *
     * @return array<int, string>
     */
    public static function shipTileNames(): array
    {
        return [
            0 => clienttranslate('Bronze Aegis'),
            1 => clienttranslate('Quartermaster'),
            2 => clienttranslate('Deep Hold'),
            3 => clienttranslate('Golden Touch'),
            4 => clienttranslate('Divine Patronage'),
            5 => clienttranslate('Swift Sails'),
            6 => clienttranslate('Head Start'),
            7 => clienttranslate('Thrifty Wheel'),
        ];
    }

    /**
     * One-line ship tile summaries (player panel, log).
     *
     * @return array<int, string>
     */
    public static function shipTileDescriptions(): array
    {
        return [
            0 => clienttranslate('+2 Shield at game start'),
            1 => clienttranslate('Start with 1 Equipment + 1 Oracle card'),
            2 => clienttranslate('Recolor counterclockwise + 4 storage'),
            3 => clienttranslate('+1 Favor when gaining favor (incl. starting)'),
            4 => clienttranslate('Gods start/return to player-count step'),
            5 => clienttranslate('+2 Ship movement range'),
            6 => clienttranslate('-1 Zeus tile (11 tasks to win)'),
            7 => clienttranslate('-1 recolor cost'),
        ];
    }

    /**
     * Full rulebook wording for a ship tile (hover tooltip).
     *
     * @return array<int, string>
     */
    public static function shipTileDetails(): array
    {
        return [
            0 => clienttranslate('At the start of the game, move your Shield 2 steps to the right.'),
            1 => clienttranslate('At the start of the game, take 1 Equipment Card from the display and draw 1 Oracle Card.'),
            2 => clienttranslate('You can also "recolor" Oracle Dice in counterclockwise direction. Additionally, your storage capacity is increased by 2.'),
            3 => clienttranslate('Whenever you take 1 or more Favor Tokens, take 1 more. This also applies to the starting Favor Tokens.'),
            4 => clienttranslate('Advance all your Gods on the God Track to the row showing the number of players participating in the game. After using a Special Action of a God, return it to that row instead of the lowest row.'),
            5 => clienttranslate('Your Ship\'s range is increased by 2.'),
            6 => clienttranslate('Return a Zeus Tile of your choice to the box. You do not receive its reward. You require 11 completed tasks to win the game instead of 12.'),
            7 => clienttranslate('Your cost for "recoloring" Oracle Dice is reduced by 1.'),
        ];
    }

    /** Name for one ship tile, or a stable placeholder for an unknown id. */
    public static function shipTileName(int $tileId): string
    {
        return self::shipTileNames()[$tileId] ?? ('Ship Tile #' . $tileId);
    }

    /** One-line summary for one ship tile ('' for an unknown id). */
    public static function shipTileDescription(int $tileId): string
    {
        return self::shipTileDescriptions()[$tileId] ?? '';
    }

    /** Full tooltip wording for one ship tile ('' for an unknown id). */
    public static function shipTileDetail(int $tileId): string
    {
        return self::shipTileDetails()[$tileId] ?? '';
    }

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
    //
    // Logic keys only. The player-visible strings (name + description) live in
    // equipmentNames() / equipmentDescriptions() below, because they must be
    // wrapped in clienttranslate() to reach the Translation page and a PHP
    // `const` initializer cannot contain a function call.
    public const EQUIPMENT_CARDS = [
        0  => ['type' => 'permanent', 'ability' => 'oracle_favor_yellow'],
        1  => ['type' => 'permanent', 'ability' => 'oracle_favor_red'],
        2  => ['type' => 'permanent', 'ability' => 'oracle_favor_black'],
        3  => ['type' => 'permanent', 'ability' => 'extra_action'],
        4  => ['type' => 'permanent', 'ability' => 'color_action_pink',
               'god' => 'hermes'],
        5  => ['type' => 'permanent', 'ability' => 'color_action_green',
               'god' => 'artemis'],
        6  => ['type' => 'permanent', 'ability' => 'color_action_blue',
               'god' => 'poseidon'],
        7  => ['type' => 'one_time',  'ability' => 'big_bonus'],
        8  => ['type' => 'permanent', 'ability' => 'range_plus_1'],
        9  => ['type' => 'permanent', 'ability' => 'statue_distance'],
        10 => ['type' => 'permanent', 'ability' => 'combat_distance'],
        11 => ['type' => 'permanent', 'ability' => 'reward_god_advance'],
        12 => ['type' => 'permanent', 'ability' => 'offering_distance'],
        13 => ['type' => 'one_time',  'ability' => 'look_and_explore'],
        14 => ['type' => 'permanent', 'ability' => 'cross_shallows'],
        15 => ['type' => 'permanent', 'ability' => 'injury_tolerance'],
        16 => ['type' => 'mixed',     'ability' => 'storage_and_shield'],
        17 => ['type' => 'one_time',  'ability' => 'grab_offering_warm',
               'colors' => ['red', 'green', 'yellow']],
        18 => ['type' => 'one_time',  'ability' => 'grab_offering_cool',
               'colors' => ['pink', 'blue', 'black']],
        19 => ['type' => 'one_time',  'ability' => 'grab_statue_cool',
               'colors' => ['pink', 'blue', 'black']],
        20 => ['type' => 'one_time',  'ability' => 'grab_statue_warm',
               'colors' => ['red', 'green', 'yellow']],
        21 => ['type' => 'one_time',  'ability' => 'advance_god_max',
               'gods' => ['poseidon', 'hermes', 'artemis', 'aphrodite']],
    ];

    // Companion card index matches img/companion/{color}-card-{index}.png
    //
    // `subtype` stays here: it is a LOGIC key (stat names like
    // "{subtype}_companion_cards_acquired", and the client's
    // `companion-${type}` CSS class), so it must never be translated. The
    // player-visible label for it is companionSubtypeLabels(); ability text is
    // companionDescriptions().
    public const COMPANION_TYPES = [
        0 => ['subtype' => 'creature',  'ability' => 'move_range_plus_3'],
        1 => ['subtype' => 'demigod',   'ability' => 'die_wild_color'],
        2 => ['subtype' => 'hero',      'ability' => 'shield_and_discard'],
    ];

    /**
     * Companion ability text keyed by type index (0=creature, 1=demigod,
     * 2=hero). Same clienttranslate() rationale as equipmentNames().
     *
     * @return array<int, string>
     */
    public static function companionDescriptions(): array
    {
        return [
            0 => clienttranslate('Moving with this color die: +3 range, end on any color'),
            1 => clienttranslate('Draw 1 Oracle Card. Use any die in this color as wild'),
            2 => clienttranslate('+2 Shield. May discard injuries of this color anytime'),
        ];
    }

    /**
     * Display label for a companion subtype, keyed by type index. Separate from
     * COMPANION_TYPES['subtype'], which is a logic key and stays untranslated.
     *
     * @return array<int, string>
     */
    public static function companionSubtypeLabels(): array
    {
        return [
            0 => clienttranslate('Creature'),
            1 => clienttranslate('Demigod'),
            2 => clienttranslate('Hero'),
        ];
    }

    /**
     * Specific companion names keyed by card_type_arg
     * (= color_idx * 3 + type_idx). Colors in COLORS index order:
     * red, yellow, green, blue, pink, black.
     *
     * Proper nouns, but still translatable: several locales transliterate the
     * Greek names (and the physical cards are localized), so translators need
     * them. Same clienttranslate() rationale as equipmentNames().
     *
     * @return array<int, string>
     */
    public static function companionNames(): array
    {
        return [
             0 => clienttranslate('Phoenix'),
             1 => clienttranslate('Penthesilea'),
             2 => clienttranslate('Odysseus'),
             3 => clienttranslate('Gryphos'),
             4 => clienttranslate('Minos'),
             5 => clienttranslate('Bellerophon'),
             6 => clienttranslate('Pegasus'),
             7 => clienttranslate('Perseus'),
             8 => clienttranslate('Hektor'),
             9 => clienttranslate('Nereide'),
            10 => clienttranslate('Herakles'),
            11 => clienttranslate('Achilles'),
            12 => clienttranslate('Pan'),
            13 => clienttranslate('Helena'),
            14 => clienttranslate('Aias'),
            15 => clienttranslate('Cheiron'),
            16 => clienttranslate('Kirke'),
            17 => clienttranslate('Theseus'),
        ];
    }

    /** Ability text for one companion type index ('' if out of range). */
    public static function companionDescription(int $typeIdx): string
    {
        return self::companionDescriptions()[$typeIdx] ?? '';
    }

    /** Display label for one companion type index ('' if out of range). */
    public static function companionSubtypeLabel(int $typeIdx): string
    {
        return self::companionSubtypeLabels()[$typeIdx] ?? '';
    }

    /**
     * Equipment card names keyed by card_type_arg (0-21), in
     * MaterialDefs::EQUIPMENT_CARDS index order.
     *
     * A method rather than a const because BGA builds the Translation page by
     * scanning for clienttranslate() call sites, and a PHP constant
     * initializer cannot contain a function call. Server-side
     * clienttranslate() is an identity marker — it returns the English string
     * unchanged — so every caller still gets English here; the client
     * translates at render time (tooltips) and via the notif 'i18n' key
     * (game log). Keep this the ONLY copy of each string: a second literal
     * elsewhere is what silently drifts out of the translators' reach.
     *
     * @return array<int, string>
     */
    public static function equipmentNames(): array
    {
        return [
             0 => clienttranslate('Yellow Charm'),
             1 => clienttranslate('Red Charm'),
             2 => clienttranslate('Black Charm'),
             3 => clienttranslate('Bonus Action'),
             4 => clienttranslate('Hermes Amulet'),
             5 => clienttranslate('Artemis Amulet'),
             6 => clienttranslate('Poseidon Amulet'),
             7 => clienttranslate('Divine Favor'),
             8 => clienttranslate('Quadrireme'),
             9 => clienttranslate('Long Hook'),
            10 => clienttranslate('Seafarer Charm'),
            11 => clienttranslate('Blessed Reward'),
            12 => clienttranslate('Altar Caller'),
            13 => clienttranslate('Island Scout'),
            14 => clienttranslate('Shallow Runner'),
            15 => clienttranslate('Pain Tolerance'),
            16 => clienttranslate('Reinforced Hull'),
            17 => clienttranslate('Warm Offering Hook'),
            18 => clienttranslate('Cool Offering Hook'),
            19 => clienttranslate('Cool Statue Hook'),
            20 => clienttranslate('Warm Statue Hook'),
            21 => clienttranslate('Divine Surge'),
        ];
    }

    /**
     * Equipment card ability text keyed by card_type_arg (0-21). Same
     * clienttranslate() rationale as equipmentNames().
     *
     * @return array<int, string>
     */
    public static function equipmentDescriptions(): array
    {
        return [
             0 => clienttranslate('Consulting oracle: if yellow shows, +2 Favor'),
             1 => clienttranslate('Consulting oracle: if red shows, +2 Favor'),
             2 => clienttranslate('Consulting oracle: if black shows, +2 Favor'),
             3 => clienttranslate('Spend 3 Favor for additional action of any color'),
             4 => clienttranslate('Pink die: +1 Favor, +1 Oracle Card, advance Hermes'),
             5 => clienttranslate('Green die: +1 Favor, +1 Oracle Card, advance Artemis'),
             6 => clienttranslate('Blue die: +1 Favor, +1 Oracle Card, advance Poseidon'),
             7 => clienttranslate('+3 Favor, +1 Oracle Card, advance 1-2 Gods 2 steps total'),
             8 => clienttranslate('+1 Ship range'),
             9 => clienttranslate('Load/Raise Statue from 1 water space away'),
            10 => clienttranslate('Fight/Explore/Shrine from 1 water space away'),
            11 => clienttranslate('On reward from Offering/Statue/Monster: advance 1 God'),
            12 => clienttranslate('Load/Make Offering from 1 water space away'),
            13 => clienttranslate('Look at 2 islands, put 1 back, explore the other'),
            14 => clienttranslate('Ship crosses shallows (free, no space cost)'),
            15 => clienttranslate('Recover at 4 same-color or 8 total (not 3/6)'),
            16 => clienttranslate('Permanent: +1 storage. One-time: +1 Shield'),
            17 => clienttranslate('Take 1 red/green/yellow Offering from any island'),
            18 => clienttranslate('Take 1 pink/blue/black Offering from any island'),
            19 => clienttranslate('Take 1 pink/blue/black Statue from city'),
            20 => clienttranslate('Take 1 red/green/yellow Statue from city'),
            21 => clienttranslate('Advance 1 of Poseidon/Hermes/Artemis/Aphrodite to top'),
        ];
    }

    /** Name for one equipment card, or a stable placeholder for an unknown id. */
    public static function equipmentName(int $cardTypeArg): string
    {
        return self::equipmentNames()[$cardTypeArg] ?? ('Equipment #' . $cardTypeArg);
    }

    /** Ability text for one equipment card ('' for an unknown id). */
    public static function equipmentDescription(int $cardTypeArg): string
    {
        return self::equipmentDescriptions()[$cardTypeArg] ?? '';
    }

    /**
     * Return the named hero/demigod/creature for a color + type combination.
     * typeIdx 0=creature, 1=demigod, 2=hero.
     */
    public static function companionName(string $color, int $typeIdx): string
    {
        $colorIdx = array_search($color, self::COLORS, true);
        if ($colorIdx === false) return '';
        return self::companionNames()[(int)$colorIdx * 3 + $typeIdx] ?? '';
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

    public static function shrineIndexFor(?string $gameColor, string $letter): ?int
    {
        $letters = self::SHRINE_LETTERS[$gameColor ?? ''] ?? [];
        $idx = array_search($letter, $letters);
        return $idx === false ? null : (int)$idx;
    }

    // Reward when another player explores an island matching your shrine
    // Logic keys only — see shrineBonusDescriptions() for the reward text.
    public const SHRINE_BONUSES = [
        'psi'   => ['type' => 'favor',   'value' => 4],
        'phi'   => ['type' => 'oracle',  'value' => 2],
        'sigma' => ['type' => 'gods',    'value' => 3],
        'omega' => ['type' => 'heal',    'value' => 0],
    ];

    /**
     * Shrine bonus reward text keyed by shrine letter. Same clienttranslate()
     * rationale as equipmentNames().
     *
     * @return array<string, string>
     */
    public static function shrineBonusDescriptions(): array
    {
        return [
            'psi'   => clienttranslate('Take 4 Favor Tokens'),
            'phi'   => clienttranslate('Draw 2 Oracle Cards'),
            'sigma' => clienttranslate('Advance Gods 3 total steps'),
            'omega' => clienttranslate('Discard all injuries + 1 Shield'),
        ];
    }

    /** Reward text for one shrine letter ('' for an unknown letter). */
    public static function shrineBonusDescription(string $letter): string
    {
        return self::shrineBonusDescriptions()[$letter] ?? '';
    }

    // 4 dual-sided Zeus tiles: offering color on front, monster type on back.
    // During setup, 2 randomly placed offering-up, 2 monster-up.
    public const DUAL_SIDED_TILES = [
        ['offering_color' => 'blue',   'monster_type' => 'siren'],
        ['offering_color' => 'yellow', 'monster_type' => 'chimera'],
        ['offering_color' => 'pink',   'monster_type' => 'cyclops'],
        ['offering_color' => 'green',  'monster_type' => 'minotaur'],
    ];

    // Player-count step: when advancing a god FROM step 0, jump to this step
    public const PLAYER_COUNT_STEP = [2 => 3, 3 => 2, 4 => 1];

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

    /**
     * Display names for the six oracle colors — status bar descriptions and log
     * lines. Same clienttranslate() rationale as equipmentNames(); these were
     * previously a plain const whose comment claimed they were translated, so
     * the 'i18n' => ['color'] tags on several notifs had nothing to look up.
     *
     * Keyed by the color KEY, which stays untranslated (it drives CSS classes
     * and image paths); only the value is display text.
     *
     * @return array<string, string>
     */
    public static function colorNames(): array
    {
        return [
            'red'    => clienttranslate('Red'),
            'black'  => clienttranslate('Black'),
            'pink'   => clienttranslate('Pink'),
            'blue'   => clienttranslate('Blue'),
            'yellow' => clienttranslate('Yellow'),
            'green'  => clienttranslate('Green'),
        ];
    }

    /** Display name for one color key, falling back to the key itself. */
    public static function colorName(string $color): string
    {
        return self::colorNames()[$color] ?? $color;
    }

    /**
     * Display names for the six gods. The GODS keys double as the English
     * names, so log messages used to render the raw lowercase key ("ares");
     * these give translators a proper capitalized string, and locales that
     * transliterate the Greek names something to translate.
     *
     * @return array<string, string>
     */
    public static function godNames(): array
    {
        return [
            'aphrodite' => clienttranslate('Aphrodite'),
            'apollo'    => clienttranslate('Apollo'),
            'ares'      => clienttranslate('Ares'),
            'artemis'   => clienttranslate('Artemis'),
            'hermes'    => clienttranslate('Hermes'),
            'poseidon'  => clienttranslate('Poseidon'),
        ];
    }

    /** Display name for one god key, falling back to the key itself. */
    public static function godName(string $god): string
    {
        return self::godNames()[$god] ?? $god;
    }

    /**
     * Display names for the two cargo item types. 'offering' / 'statue' are
     * logic keys (the client picks card art from them) that were also being
     * rendered as English prose in the log.
     *
     * @return array<string, string>
     */
    public static function itemTypeNames(): array
    {
        return [
            'offering' => clienttranslate('offering'),
            'statue'   => clienttranslate('statue'),
        ];
    }

    /** Display name for one cargo item type, falling back to the key. */
    public static function itemTypeName(string $itemType): string
    {
        return self::itemTypeNames()[$itemType] ?? $itemType;
    }

    /**
     * Favor actually gained from a base amount, including the Golden Touch
     * (`favor_plus_1`) ship-tile bonus. Pure: no DB access, so it is the
     * unit-testable core of Game::grantFavor().
     *
     * Rule (per the tile text): "Whenever you take 1 or more Favor Tokens,
     * take 1 more." So any positive base earns exactly +1 once when the
     * player owns that tile; a non-positive base gains nothing and earns no
     * bonus. The result is never negative.
     *
     * @param string|null $shipTileAbility The player's ship-tile ability key
     *                                      (e.g. SHIP_TILES[id]['ability']).
     * @param int         $baseAmount       Favor that would be gained without the tile.
     * @return int Favor to actually add to the player.
     */
    public static function favorGainWithTile(?string $shipTileAbility, int $baseAmount): int
    {
        if ($baseAmount <= 0) {
            return 0;
        }
        return $baseAmount + ($shipTileAbility === 'favor_plus_1' ? 1 : 0);
    }

    /**
     * Maximum Equipment cards a player can hold, given their ship-tile
     * ability. Equipment is earned only by defeating monsters (3 monster
     * Zeus tiles => 3 cards) plus, for the Quartermaster
     * (`starting_equipment`) tile, 1 card dealt at setup — so the cap is 4
     * with Quartermaster and 3 otherwise. Per the rulebook errata the 4th
     * (Quartermaster + 3 monster rewards) is legal.
     *
     * Single source of truth for the cap: the combat reward guards and the
     * player-panel slot count both derive from this.
     *
     * @param string|null $shipTileAbility SHIP_TILES[id]['ability'] or null.
     */
    public static function equipmentCapacityForAbility(?string $shipTileAbility): int
    {
        return $shipTileAbility === 'starting_equipment' ? 4 : 3;
    }
}
