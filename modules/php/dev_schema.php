<?php

/**
 * REMOVE BEFORE ALPHA SUBMISSION — dev iteration shim companion.
 *
 * Mirror of dbmodel.sql as a PHP-returned string so resetCustomTables()
 * can drop + recreate the schema in studio without using a raw file
 * read (which the BGA scanner forbids). Keep in sync with dbmodel.sql
 * until both this file and resetCustomTables() are deleted before
 * alpha submission.
 */

return <<<'SQL'
CREATE TABLE `board_placement` (
    `placement_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `cluster_id` VARCHAR(30) NOT NULL,
    `anchor_q` INT NOT NULL,
    `anchor_r` INT NOT NULL,
    `rotation` TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (`placement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `hex` (
    `hex_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `q` INT NOT NULL,
    `r` INT NOT NULL,
    `tile_type` VARCHAR(20) NOT NULL,
    `color` VARCHAR(10) DEFAULT NULL,
    `island_content` VARCHAR(50) DEFAULT NULL,
    `is_revealed` TINYINT(1) DEFAULT 0,
    `shrine_player_id` INT DEFAULT NULL,
    `shrine_letter` VARCHAR(10) DEFAULT NULL,
    `shrine_game_color` VARCHAR(10) DEFAULT NULL,
    `revealed_by_player_id` INT DEFAULT NULL,
    `cluster_id` INT DEFAULT NULL,
    `cluster_type` VARCHAR(30) DEFAULT NULL,
    `cluster_rotation` INT DEFAULT 0,
    PRIMARY KEY (`hex_id`),
    UNIQUE KEY `coords` (`q`, `r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `monster` (
    `monster_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `monster_type` VARCHAR(20) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    `is_defeated` TINYINT(1) NOT NULL DEFAULT 0,
    `defeated_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`monster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `offering` (
    `offering_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,
    `is_delivered` TINYINT(1) NOT NULL DEFAULT 0,
    `delivered_to_hex_q` INT DEFAULT NULL,
    `delivered_to_hex_r` INT DEFAULT NULL,
    `delivered_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`offering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `statue` (
    `statue_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,
    `is_raised` TINYINT(1) NOT NULL DEFAULT 0,
    `raised_at_hex_q` INT DEFAULT NULL,
    `raised_at_hex_r` INT DEFAULT NULL,
    `raised_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`statue_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `temple` (
    `temple_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`temple_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `shrine` (
    `shrine_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `shrine_index` TINYINT NOT NULL,
    `is_built` TINYINT(1) NOT NULL DEFAULT 0,
    `built_at_hex_q` INT DEFAULT NULL,
    `built_at_hex_r` INT DEFAULT NULL,
    PRIMARY KEY (`shrine_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `player_island_knowledge` (
    `player_id` INT NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`player_id`, `hex_q`, `hex_r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `god_advancement_queue` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `source_player_id` INT NOT NULL,
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `oracle_die` (
    `die_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `die_index` TINYINT NOT NULL,
    `color` VARCHAR(10) NOT NULL,
    `original_color` VARCHAR(10) NOT NULL,
    `is_used` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`die_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `player_god` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `god_name` VARCHAR(20) NOT NULL,
    `track_step` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `zeus_tile` (
    `tile_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `task_type` VARCHAR(20) NOT NULL,
    `task_color` VARCHAR(10) DEFAULT NULL,
    `task_letter` VARCHAR(10) DEFAULT NULL,
    `completion_value` VARCHAR(20) DEFAULT NULL,
    `is_completed` TINYINT(1) DEFAULT 0,
    `sort_order` INT NOT NULL,
    PRIMARY KEY (`tile_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `card` (
    `card_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `card_type` VARCHAR(16) NOT NULL,
    `card_type_arg` INT(11) NOT NULL,
    `card_location` VARCHAR(16) NOT NULL,
    `card_location_arg` INT(11) NOT NULL DEFAULT 0,
    `card_order` INT NOT NULL DEFAULT 0,
    `is_wild` TINYINT(1) NOT NULL DEFAULT 0,
    `is_used` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 AUTO_INCREMENT=1;
SQL;
