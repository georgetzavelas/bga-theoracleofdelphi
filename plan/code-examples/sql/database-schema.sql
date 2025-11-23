-- The Oracle of Delphi - Database Schema
-- All tables for game state management

-- Board Spaces (water and island hexes)
CREATE TABLE IF NOT EXISTS board_spaces (
    space_id INT PRIMARY KEY AUTO_INCREMENT,
    space_type VARCHAR(16) NOT NULL,           -- 'water', 'island', 'city'
    tile_id INT NOT NULL,                      -- Which board tile (0-17)
    position_on_tile INT NOT NULL,             -- Hex position within tile
    hex_color VARCHAR(16) DEFAULT NULL,        -- Color for water spaces
    INDEX idx_type (space_type),
    INDEX idx_tile (tile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Island Tiles (face-down exploration tiles)
CREATE TABLE IF NOT EXISTS island_tiles (
    island_tile_id INT PRIMARY KEY AUTO_INCREMENT,
    space_id INT NOT NULL,                     -- Links to board_spaces
    tile_type VARCHAR(16) NOT NULL,            -- 'offering', 'monster', 'statue', 'temple', 'shrine', 'special'
    is_revealed BOOLEAN DEFAULT FALSE,
    player_color VARCHAR(16) DEFAULT NULL,     -- For shrine islands (blue/red/etc)
    greek_letter VARCHAR(8) DEFAULT NULL,      -- For special reward islands (alpha/beta/gamma/omega)
    has_component BOOLEAN DEFAULT TRUE,        -- Does island still have its component?
    FOREIGN KEY (space_id) REFERENCES board_spaces(space_id),
    INDEX idx_space (space_id),
    INDEX idx_revealed (is_revealed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Game Components (offerings, statues, monsters, shrines)
CREATE TABLE IF NOT EXISTS components (
    component_id INT PRIMARY KEY AUTO_INCREMENT,
    component_type VARCHAR(32) NOT NULL,       -- 'offering', 'statue', 'monster', 'shrine'
    component_color VARCHAR(16) NOT NULL,      -- 'red', 'blue', 'green', 'yellow', 'white', 'black'
    location VARCHAR(32) NOT NULL,             -- 'board', 'ship', 'completed', 'available'
    location_id INT DEFAULT NULL,              -- space_id or player_id depending on location
    player_id INT DEFAULT NULL,                -- Owner if on ship or completed
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_type_color (component_type, component_color),
    INDEX idx_location (location, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Gods (6 per player on advancement track)
CREATE TABLE IF NOT EXISTS gods (
    god_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    god_color VARCHAR(16) NOT NULL,            -- 'blue', 'yellow', 'green', 'red', 'black', 'pink'
    god_name VARCHAR(32) NOT NULL,             -- 'Poseidon', 'Apollon', 'Artemis', 'Aphrodite', 'Ares', 'Hermes'
    position INT NOT NULL DEFAULT 0,           -- Current row on god track (0-4)
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_player (player_id),
    INDEX idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Oracle Dice (3 per player)
CREATE TABLE IF NOT EXISTS oracle_dice (
    dice_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    die_number INT NOT NULL,                   -- 1, 2, or 3
    die_color VARCHAR(16) DEFAULT NULL,        -- Current color (after roll)
    is_used BOOLEAN DEFAULT FALSE,             -- Used this turn?
    oracle_position INT DEFAULT NULL,          -- Position on oracle (1-6)
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Cards (injury, oracle, equipment, companion)
CREATE TABLE IF NOT EXISTS cards (
    card_id INT PRIMARY KEY AUTO_INCREMENT,
    card_type VARCHAR(32) NOT NULL,            -- 'injury', 'oracle', 'equipment', 'companion'
    card_type_arg INT NOT NULL,                -- Specific card ID within type
    card_location VARCHAR(32) NOT NULL,        -- 'deck', 'hand', 'discard', 'display', 'active'
    card_location_arg INT DEFAULT 0,           -- Position in location
    player_id INT DEFAULT NULL,                -- Owner if in hand
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_type_location (card_type, card_location),
    INDEX idx_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Zeus Tiles (task tracking, 12 per player)
CREATE TABLE IF NOT EXISTS zeus_tiles (
    zeus_tile_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    task_type VARCHAR(16) NOT NULL,            -- 'shrine', 'statue', 'offering', 'monster'
    task_number INT NOT NULL,                  -- 1, 2, or 3 (first/second/third of type)
    required_color VARCHAR(16) DEFAULT NULL,   -- Specific color required (or NULL for "any")
    is_completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_player (player_id),
    INDEX idx_completed (is_completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;