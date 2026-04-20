/**
 * DevTools.js - Test/demo tools for The Oracle of Delphi
 *
 * Extracted from the main game file to keep production code clean.
 * All methods delegate to the game instance via this.game.
 */

define([
    "dojo",
    "dojo/_base/declare",
], function (dojo, declare) {
    return declare("delphi.DevTools", null, {

        // Reference to the game instance
        game: null,

        constructor: function(gameInstance) {
            this.game = gameInstance;
        },

        /**
         * Create a dynamically generated test board using BoardBuilder
         * Uses multi-hex cluster images for the game board
         */
        createTestBoard: function(boardOnly) {
            var game = this.game;

            console.log("Creating test board with BoardBuilder");
            console.log("BoardBuilder instance:", game.boardBuilder);
            console.log("BoardRenderer instance:", game.boardRenderer);
            console.log("ClusterDefs instance:", game.clusterDefs);

            // Build the board using BoardBuilder
            var result = game.boardBuilder.buildBoard();
            console.log("BoardBuilder result:", result);

            if (!result.valid) {
                console.error('Failed to build board:', result);
                return;
            }

            console.log('Board built successfully with ' + result.clusters.length + ' clusters');

            // Render the board using BoardRenderer
            console.log("About to render with BoardRenderer");
            console.log("BoardRenderer container:", game.boardRenderer.containerEl);
            var renderResult = game.boardRenderer.render(result, { padding: 100 });
            console.log("Render result:", renderResult);

            // Store offsets for piece positioning
            game.boardOffsetX = renderResult.offsetX;
            game.boardOffsetY = renderResult.offsetY;
            game.boardHexes = result.hexes;

            // Store the placements for later reference (e.g., saving to server)
            game.boardPlacements = result.clusters.map(function(p) {
                return {
                    clusterId: p.cluster.id,
                    anchorQ: p.anchorQ,
                    anchorR: p.anchorR,
                    rotation: p.rotation
                };
            });

            // Position the Zeus token on the shallows hex
            if (result.zeusPosition) {
                game.zeusPosition = result.zeusPosition;
                game.positionZeusToken(result.zeusPosition.q, result.zeusPosition.r);
            }

            // Place test pieces on the board
            this.placeTestPieces(boardOnly);
        },

        /**
         * Place test pieces (ships, monsters, offerings, etc.) on whatever board is currently rendered.
         * Uses game.boardHexes which is set by either client-side build OR server-side restoreBoardFromPlacements.
         * @param {boolean} boardOnly - If true, skip dice and player board setup
         */
        placeTestPieces: function(boardOnly) {
            if (!boardOnly) {
                this.createTestShips();
            }
            this.createTestMonsters();
            this.createTestOfferings();
            this.createTestStatues();
            this.createTestTemples();
            this.createTestShrines();

            if (!boardOnly) {
                this.createTestDice();
                this.setupTestPlayerBoard();
            }
        },

        /**
         * Create test ships at Zeus/shallows starting position with offset clustering
         */
        createTestShips: function() {
            var game = this.game;
            var colors = ['red', 'blue', 'green', 'yellow'];
            var zeus = game.zeusPosition;
            game.shipPositions = {};

            if (zeus) {
                var center = game.getHexCenterPixel(zeus.q, zeus.r);
                if (center) {
                    colors.forEach(function(color, index) {
                        var offset = game.SHIP_CLUSTER_OFFSETS[index];
                        game.components.createShip(
                            index + 1, color,
                            center.x + offset.dx,
                            center.y + offset.dy
                        );
                        game.shipPositions[index + 1] = { q: zeus.q, r: zeus.r };
                    });
                }
            } else {
                // Fallback: place on random water hexes
                var waterHexes = game.boardHexes ?
                    game.boardHexes.filter(function(h) { return h.type === 'water'; }).slice(0, 4) :
                    [{ q: 2, r: 2 }, { q: 5, r: 3 }, { q: 1, r: 4 }, { q: 4, r: 5 }];
                waterHexes.forEach(function(hex, index) {
                    var center = game.getHexCenterPixel(hex.q, hex.r);
                    if (center) {
                        game.components.createShip(index + 1, colors[index], center.x, center.y);
                        game.shipPositions[index + 1] = { q: hex.q, r: hex.r };
                    }
                });
            }

            // Ship click handler (event delegation on board pieces)
            game.components.boardPieces.addEventListener('click', function(e) {
                var shipEl = e.target.closest('.delphi-ship');
                if (shipEl) {
                    e.stopPropagation();
                    var playerId = parseInt(shipEl.dataset.player);
                    game.onShipClick(playerId);
                }
            });
        },

        /**
         * Create test monsters at various positions
         */
        createTestMonsters: function() {
            var game = this.game;
            var monsterTypes = ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'];

            // Find island hexes with monster attribute from the board
            var monsterHexes = game.boardHexes ?
                game.boardHexes.filter(function(h) {
                    return h.attribute === 'monster' || h.attribute === 'two_monster';
                }) :
                [];

            // Helper to get random item from array
            var randomItem = function(arr) {
                return arr[Math.floor(Math.random() * arr.length)];
            };

            // Create 3 random monsters on each monster hex for visual testing
            var testMonsters = [];
            var monsterId = 1;

            if (monsterHexes.length > 0) {
                monsterHexes.forEach(function(hex) {
                    // Stack 3 random monsters on each hex
                    for (var i = 0; i < 3; i++) {
                        testMonsters.push({
                            id: monsterId++,
                            type: randomItem(monsterTypes),
                            q: hex.q,
                            r: hex.r
                        });
                    }
                });
            } else {
                // Fallback positions if no board hexes
                var fallbackHexes = [
                    { q: 4, r: 1 },
                    { q: 0, r: 3 },
                    { q: 6, r: 5 },
                    { q: 3, r: 6 }
                ];
                fallbackHexes.forEach(function(hex) {
                    for (var i = 0; i < 3; i++) {
                        testMonsters.push({
                            id: monsterId++,
                            type: randomItem(monsterTypes),
                            q: hex.q,
                            r: hex.r
                        });
                    }
                });
            }

            testMonsters.forEach(function(monster) {
                var center = game.getHexCenterPixel(monster.q, monster.r);
                if (center) {
                    game.components.createMonster(
                        monster.id,
                        monster.type,
                        center.x,
                        center.y,
                        monster.q,
                        monster.r
                    );
                }
            });
        },

        /**
         * Create and distribute offering cubes across offering islands
         */
        createTestOfferings: function() {
            var game = this.game;

            // Find offering island hexes from the board
            var offeringHexes = game.boardHexes ?
                game.boardHexes.filter(function(h) { return h.attribute === 'offering'; }) :
                [];

            if (offeringHexes.length === 0) {
                console.warn('No offering islands found on the board');
                return;
            }

            // Run the distribution algorithm: 24 cubes, 4 per island, no same color per island
            var assignments = game.components.distributeOfferings(offeringHexes);

            // Place each offering on the board
            assignments.forEach(function(offering) {
                var center = game.getHexCenterPixel(offering.q, offering.r);
                if (center) {
                    var hexKey = offering.q + ',' + offering.r;
                    game.components.createOffering(
                        offering.id,
                        offering.color,
                        center.x,
                        center.y,
                        offering.slotIndex,
                        hexKey
                    );
                }
            });
        },

        /**
         * Create statues on city island hexes
         */
        createTestStatues: function() {
            var game = this.game;

            if (!game.boardPlacements || !game.clusterDefs) {
                console.warn('No board placements or cluster definitions for statues');
                return;
            }

            // Build a set of city hex positions from placements (rotation-aware)
            var cityHexPositions = {};  // "q,r" -> {color, rotation}
            game.boardPlacements.forEach(function(p) {
                if (p.clusterId && p.clusterId.indexOf('city-') === 0) {
                    var color = p.clusterId.replace('city-', '');
                    var cluster = game.clusterDefs.getCluster(p.clusterId);
                    if (!cluster) return;

                    var worldHexes = game.clusterDefs.getWorldHexes(cluster, p.anchorQ, p.anchorR, p.rotation);
                    worldHexes.forEach(function(h) {
                        if (h.attribute === 'city') {
                            cityHexPositions[h.q + ',' + h.r] = { color: color, rotation: p.rotation };
                        }
                    });
                }
            });

            // Match against boardHexes for resolved positions
            var cities = [];
            if (game.boardHexes) {
                game.boardHexes.forEach(function(h) {
                    if (h.attribute === 'city') {
                        var key = h.q + ',' + h.r;
                        var data = cityHexPositions[key];
                        if (data) {
                            cities.push({ color: data.color, q: h.q, r: h.r, rotation: data.rotation });
                        }
                    }
                });
            }

            console.log('City statues: found ' + cities.length + ' cities', cities);

            if (cities.length === 0) {
                console.warn('No city hexes found on the board');
                return;
            }

            var assignments = game.components.buildStatueAssignments(cities);

            assignments.forEach(function(statue) {
                var center = game.getHexCenterPixel(statue.q, statue.r);
                if (center) {
                    game.components.createStatue(
                        statue.id,
                        statue.color,
                        center.x,
                        center.y,
                        statue.slotIndex,
                        statue.rotation
                    );
                }
            });
        },

        /**
         * Create and distribute temples on temple islands
         */
        createTestTemples: function() {
            var game = this.game;

            var templeHexes = game.boardHexes ?
                game.boardHexes.filter(function(h) { return h.attribute === 'temple'; }) :
                [];

            if (templeHexes.length === 0) {
                console.warn('No temple islands found on the board');
                return;
            }

            var assignments = game.components.distributeTemples(templeHexes);

            assignments.forEach(function(temple) {
                var center = game.getHexCenterPixel(temple.q, temple.r);
                if (center) {
                    game.components.createTemple(
                        temple.id,
                        temple.color,
                        center.x,
                        center.y
                    );
                }
            });
        },

        /**
         * Create shrine overlays on shrine hexes
         */
        createTestShrines: function() {
            var game = this.game;

            var shrineHexes = game.boardHexes ?
                game.boardHexes.filter(function(h) { return h.attribute === 'shrine'; }) :
                [];

            if (shrineHexes.length === 0) {
                console.warn('No shrine hexes found on the board');
                return;
            }

            var assignments = game.components.distributeShrines(shrineHexes);

            assignments.forEach(function(shrine) {
                var center = game.getHexCenterPixel(shrine.q, shrine.r);
                if (center) {
                    game.components.createShrine(
                        shrine.id,
                        shrine.overlay,
                        center.x,
                        center.y
                    );
                }
            });

            // Click handler for shrine flipping (event delegation) — toggles reveal
            game.components.boardPieces.addEventListener('click', function(e) {
                var shrineEl = e.target.closest('.delphi-shrine');
                if (shrineEl) {
                    var id = parseInt(shrineEl.dataset.shrineId, 10);
                    game.components.flipShrine(id);
                }
            });
        },

        /**
         * Prototype: place a blue temple + 4 blue offerings on the first temple hex
         */
        createTestTempleWithOfferings: function() {
            var game = this.game;

            var templeHexes = game.boardHexes ?
                game.boardHexes.filter(function(h) { return h.attribute === 'temple'; }) :
                [];

            if (templeHexes.length === 0) {
                console.warn('No temple hexes found for prototype');
                return;
            }

            // Use the first temple hex
            var hex = templeHexes[0];
            var center = game.getHexCenterPixel(hex.q, hex.r);
            if (!center) return;

            var hexKey = hex.q + ',' + hex.r;

            // Place a blue temple at center
            game.components.createTemple(100, 'blue', center.x, center.y);

            // Place 4 blue offerings at cardinal positions around it
            for (var i = 0; i < 4; i++) {
                game.components.createTempleOffering(
                    100 + i,
                    'blue',
                    center.x,
                    center.y,
                    i,
                    hexKey
                );
            }
        },

        /**
         * Create test oracle dice
         */
        createTestDice: function() {
            var game = this.game;

            // Create dice with random colors
            var testColors = ['red', 'blue', 'green'];
            game.components.createOracleDice(1, testColors);

            // Set up dice click handlers
            document.querySelectorAll('.delphi-die').forEach(function(die) {
                die.addEventListener('click', function(e) {
                    var index = parseInt(die.dataset.index);
                    game.onDieClick(index);
                });
            });
        },

        /**
         * Set up test player board with ALL possible card areas populated
         * This shows the full layout with maximum items for visual testing
         */
        setupTestPlayerBoard: function() {
            var game = this.game;

            // Initialize god track for 4 players
            game.components.initGodTrack(4);

            // Initialize god tokens for test player at starting positions (row 0)
            game.components.initializePlayerGods(1, '#E53935'); // Red player - all gods start at row 0

            // Set shield value (test at value 3, red player)
            game.components.setShieldValue(3, 'red');

            // Create sample Zeus tiles (4 groups of 3) - all 12 tiles
            // For test player (red), shrines use red-player images
            var playerColor = 'red';
            var shrineLetters = {
                red: ['omega', 'phi', 'psi'],
                yellow: ['omega', 'psi', 'sigma'],
                green: ['phi', 'psi', 'sigma'],
                blue: ['omega', 'phi', 'sigma']
            };
            var playerShrines = shrineLetters[playerColor] || shrineLetters.red;

            // Offerings - randomly select 3 from 5 available
            var allOfferings = ['any', 'blue', 'green', 'pink', 'yellow'];
            var shuffledOfferings = allOfferings.sort(function() { return Math.random() - 0.5; });
            var selectedOfferings = shuffledOfferings.slice(0, 3);

            // Monsters - randomly select 3 from 5 available
            var allMonsters = ['any', 'chimera', 'cyclops', 'minotaur', 'siren'];
            var shuffledMonsters = allMonsters.sort(function() { return Math.random() - 0.5; });
            var selectedMonsters = shuffledMonsters.slice(0, 3);

            var testTiles = [
                // Shrines - player color specific
                { id: 1, type: 'shrine', color: 'red', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/shrines/' + playerColor + '-player-' + playerShrines[0] + '.jpg' },
                { id: 2, type: 'shrine', color: 'blue', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/shrines/' + playerColor + '-player-' + playerShrines[1] + '.jpg' },
                { id: 3, type: 'shrine', color: 'green', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/shrines/' + playerColor + '-player-' + playerShrines[2] + '.jpg' },
                // Statues - all use same player-specific image
                { id: 4, type: 'statue', color: 'yellow', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/statues/' + playerColor + '-player.jpg' },
                { id: 5, type: 'statue', color: 'pink', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/statues/' + playerColor + '-player.jpg' },
                { id: 6, type: 'statue', color: 'black', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/statues/' + playerColor + '-player.jpg' },
                // Offerings - randomly selected 3 from 5 available
                { id: 7, type: 'offering', color: 'blue', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/offerings/' + playerColor + '-player-' + selectedOfferings[0] + '.jpg' },
                { id: 8, type: 'offering', color: 'green', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/offerings/' + playerColor + '-player-' + selectedOfferings[1] + '.jpg' },
                { id: 9, type: 'offering', color: 'black', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/offerings/' + playerColor + '-player-' + selectedOfferings[2] + '.jpg' },
                // Monsters - randomly selected 3 from 5 available
                { id: 10, type: 'monster', color: 'red', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/monsters/' + playerColor + '-player-' + selectedMonsters[0] + '.jpg' },
                { id: 11, type: 'monster', color: 'yellow', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/monsters/' + playerColor + '-player-' + selectedMonsters[1] + '.jpg' },
                { id: 12, type: 'monster', color: 'pink', completed: false, imgUrl: g_gamethemeurl + 'img/zeus-tiles/monsters/' + playerColor + '-player-' + selectedMonsters[2] + '.jpg' }
            ];
            game.components.createZeusTiles(testTiles);

            // Test Oracle Cards (left side) - all 6 colors with stacking
            game.components.addOracleCardToHand('red');
            game.components.addOracleCardToHand('red');    // Stack of 2 red
            game.components.addOracleCardToHand('blue');
            game.components.addOracleCardToHand('blue');
            game.components.addOracleCardToHand('green');
            game.components.addOracleCardToHand('green');
            game.components.addOracleCardToHand('green');  // Stack of 3 green
            game.components.addOracleCardToHand('yellow');
            game.components.addOracleCardToHand('pink');
            game.components.addOracleCardToHand('black');
            game.components.addOracleCardToHand('black');  // Stack of 2 black

            // Test Played Oracle Card (top left, rotated)
            game.components.playOracleCard('blue');

            // Test Injury Cards (bottom left) - multiple colors with stacking
            game.components.addInjuryCard('black');
            game.components.addInjuryCard('blue');
            game.components.addInjuryCard('red');
            game.components.addInjuryCard('yellow');
            game.components.addInjuryCard('yellow');       // Stack of 2 yellow
            game.components.addInjuryCard('green');
            game.components.addInjuryCard('pink');
            game.components.addInjuryCard('pink');
            game.components.addInjuryCard('pink');         // Stack of 3 pink

            // Test Favor Tokens (top right) - a good amount
            game.components.setFavorTokenCount(7);

            // Test Equipment Cards (bottom right) - max 4 cards with actual images
            game.components.addEquipmentCard(1, g_gamethemeurl + 'img/equipment/card-001.jpg');
            game.components.addEquipmentCard(2, g_gamethemeurl + 'img/equipment/card-005.jpg');
            game.components.addEquipmentCard(3, g_gamethemeurl + 'img/equipment/card-010.jpg');
            game.components.addEquipmentCard(4, g_gamethemeurl + 'img/equipment/card-015.jpg');

            // Test Companion Cards (right side) - max 3 cards with actual images
            game.components.addCompanionCard(1, 'hero', 'red', g_gamethemeurl + 'img/companion/red-card-0.png');
            game.components.addCompanionCard(2, 'demigod', 'blue', g_gamethemeurl + 'img/companion/blue-card-1.png');
            game.components.addCompanionCard(3, 'creature', 'green', g_gamethemeurl + 'img/companion/green-card-2.png');

            // Test Ship Tile (on ship area at 8 degrees rotation)
            // Using a ship tile that grants expanded storage (4 slots)
            game.components.setShipTile(1, g_gamethemeurl + 'img/ship-tiles/ship-2.jpg', true);

            // Test Ship Storage - fill all 4 slots (expanded storage)
            game.components.addToShipStorage('statue', 'red');
            game.components.addToShipStorage('offering', 'blue');
            game.components.addToShipStorage('statue', 'yellow');
            game.components.addToShipStorage('offering', 'green');

            // Test Defeated Monsters - fill all 3 slots (type, color)
            game.components.addDefeatedMonster('cyclops', 'red');
            game.components.addDefeatedMonster('minotaur', 'blue');
            game.components.addDefeatedMonster('hydra', 'green');
        }
    });
});
