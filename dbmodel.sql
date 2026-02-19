
-- ------
-- BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
-- theoracleofdelphigzed implementation : © George Tzavelas
--
-- This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
-- See http://en.boardgamearena.com/#!doc/Studio for more information.
-- -----

-- dbmodel.sql

-- =====================================================
-- BOARD STATE
-- =====================================================

-- Hex grid (generated during setup by PHP BoardGenerator)
CREATE TABLE IF NOT EXISTS `hex` (
    `hex_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `q` INT NOT NULL,
    `r` INT NOT NULL,
    `tile_type` VARCHAR(20) NOT NULL,   -- 'water','island','city','zeus','shallow'
    `color` VARCHAR(10) DEFAULT NULL,   -- hex color (red, yellow, green, blue, pink, black)
    `island_content` VARCHAR(50) DEFAULT NULL,  -- for revealed islands: shrine color, bonus type, etc.
    `is_revealed` TINYINT(1) DEFAULT 0,
    `cluster_id` INT DEFAULT NULL,      -- which cluster this hex belongs to (for rendering)
    `cluster_type` VARCHAR(30) DEFAULT NULL,  -- cluster type name (for image lookup)
    `cluster_rotation` INT DEFAULT 0,   -- rotation of the cluster (0-5, x60 degrees)
    PRIMARY KEY (`hex_id`),
    UNIQUE KEY `coords` (`q`, `r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Monsters (6 types, one per color, placed on board during setup)
CREATE TABLE IF NOT EXISTS `monster` (
    `monster_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `monster_type` VARCHAR(20) NOT NULL,  -- cyclops, minotaur, chimera, hydra, gorgon, siren
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    `is_defeated` TINYINT(1) NOT NULL DEFAULT 0,
    `defeated_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`monster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Offerings (colored cubes on offering islands)
-- States: on_island → in_cargo → delivered
CREATE TABLE IF NOT EXISTS `offering` (
    `offering_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,           -- set when in player's cargo
    `is_delivered` TINYINT(1) NOT NULL DEFAULT 0,
    `delivered_to_hex_q` INT DEFAULT NULL,   -- temple location when delivered
    `delivered_to_hex_r` INT DEFAULT NULL,
    `delivered_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`offering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Statues (colored statues in cities)
-- States: on_city → in_cargo → raised
CREATE TABLE IF NOT EXISTS `statue` (
    `statue_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,           -- set when in player's cargo
    `is_raised` TINYINT(1) NOT NULL DEFAULT 0,
    `raised_at_hex_q` INT DEFAULT NULL,
    `raised_at_hex_r` INT DEFAULT NULL,
    `raised_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`statue_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Temples (one per color, fixed positions)
CREATE TABLE IF NOT EXISTS `temple` (
    `temple_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`temple_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Shrines (each player has 3, placed on explored islands)
-- States: on_player_board → built on island
CREATE TABLE IF NOT EXISTS `shrine` (
    `shrine_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `shrine_index` TINYINT NOT NULL,    -- 0, 1, 2
    `is_built` TINYINT(1) NOT NULL DEFAULT 0,
    `built_at_hex_q` INT DEFAULT NULL,
    `built_at_hex_r` INT DEFAULT NULL,
    PRIMARY KEY (`shrine_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- =====================================================
-- PLAYER STATE
-- =====================================================

-- Oracle dice (3 per player, placed on oracle wheel)
CREATE TABLE IF NOT EXISTS `oracle_die` (
    `die_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `die_index` TINYINT NOT NULL,       -- 0, 1, 2
    `color` VARCHAR(10) NOT NULL,       -- current color (may be recolored)
    `original_color` VARCHAR(10) NOT NULL, -- color from oracle roll
    `is_used` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`die_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Player gods (6 per player, tracked on god track)
CREATE TABLE IF NOT EXISTS `player_god` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `god_name` VARCHAR(20) NOT NULL,    -- poseidon, apollo, artemis, aphrodite, ares, hermes
    `track_row` INT NOT NULL DEFAULT 0, -- 0 = bottom row
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Zeus tiles (12 task tiles per player, 4 groups of 3)
CREATE TABLE IF NOT EXISTS `zeus_tile` (
    `tile_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `task_type` VARCHAR(20) NOT NULL,   -- 'shrine','statue','offering','monster'
    `task_color` VARCHAR(10) DEFAULT NULL,
    `task_letter` VARCHAR(10) DEFAULT NULL,  -- for shrine tasks (greek letters)
    `is_completed` TINYINT(1) DEFAULT 0,
    `sort_order` INT NOT NULL,
    PRIMARY KEY (`tile_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- =====================================================
-- CARDS (BGA Deck component standard schema)
-- =====================================================
-- Uses standard BGA Deck format for shuffle/draw/discard support.
-- card_type: 'oracle', 'equipment', 'companion', 'injury'
-- card_type_arg: For oracle/injury = color int (1=red,2=yellow,3=green,4=blue,5=pink,6=black)
--               For equipment = card number (1-22)
--               For companion = card number (1-18)
-- card_location: 'deck', 'hand', 'discard', 'display', 'played'
-- card_location_arg: player_id when in hand/played

CREATE TABLE IF NOT EXISTS `card` (
    `card_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `card_type` VARCHAR(16) NOT NULL,
    `card_type_arg` INT(11) NOT NULL,
    `card_location` VARCHAR(16) NOT NULL,
    `card_location_arg` INT(11) NOT NULL DEFAULT 0,
    PRIMARY KEY (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 AUTO_INCREMENT=1;

-- =====================================================
-- PLAYER TABLE EXTENSIONS
-- =====================================================

ALTER TABLE `player` ADD `ship_q` INT DEFAULT NULL;
ALTER TABLE `player` ADD `ship_r` INT DEFAULT NULL;
ALTER TABLE `player` ADD `shield_value` INT NOT NULL DEFAULT 0;
ALTER TABLE `player` ADD `favor_tokens` INT NOT NULL DEFAULT 0;
ALTER TABLE `player` ADD `ship_tile_id` INT DEFAULT NULL;
ALTER TABLE `player` ADD `oracle_card_used_this_turn` TINYINT(1) DEFAULT 0;
ALTER TABLE `player` ADD `tasks_completed` INT NOT NULL DEFAULT 0;
