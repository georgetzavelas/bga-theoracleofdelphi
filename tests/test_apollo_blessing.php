<?php
/**
 * Tests for Apollo's free any-colour card play
 * (see docs/superpowers/specs/2026-07-27-apollo-movable-wild-blessing-design.md).
 *
 * Apollo no longer flags a card wild. Its card benefit is a free any-colour
 * choice on the one card play, delivered by the same apollo_pending_recolor gate
 * the dice already use: playing a card under Apollo must arm that gate, so
 * SelectAction withholds the action set until a colour is chosen (free), and
 * actRecolorCard then clears it.
 *
 * Covers PlayerActions::actPlayOracleCard:
 *   - arms the gate when Apollo is active, and leaves it alone otherwise,
 *   - still seeds the retained/native play colour and marks the play spent.
 *
 * PlayerActions extends a BGA framework base class and talks to the DB, so
 * (mirroring the define()-stub trick the JS tests use, and the GameState stub in
 * test_scout_islands_args.php) we declare minimal framework stubs, build the
 * state object without running its constructor, and inject a fake Game that
 * records the SQL it is handed.
 *
 * Run: php tests/test_apollo_blessing.php
 */

namespace Bga\GameFramework {
    if (!class_exists(UserException::class)) {
        class UserException extends \Exception {}
    }
    if (!enum_exists(StateType::class)) {
        enum StateType { case ACTIVE_PLAYER; case GAME; case MULTIPLE_ACTIVE_PLAYER; }
    }
}

namespace Bga\GameFramework\States {
    if (!class_exists(GameState::class)) {
        class GameState {
            public $notify;
            public function __construct(...$args) {}
        }
    }
    if (!class_exists(PossibleAction::class)) {
        #[\Attribute]
        class PossibleAction {}
    }
}

namespace Bga\Games\theoracleofdelphi {
    if (!class_exists(MaterialDefs::class)) {
        class MaterialDefs {
            public const COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
        }
    }

    /** Records DbQuery calls and serves canned rows keyed by SQL shape. */
    class Game {
        public $globals;
        public array $queries = [];
        public bool $apolloActive = true;
        public int $cardPlayed = 0;
        /** card_id => ['in_hand' => bool, 'is_wild' => int, 'type_arg' => int] */
        public array $hand = [];
        /** card_id => retained colour from a paid recolour */
        public array $playColors = [];
        public array $undoLabels = [];

        /** Every globals->set() the action performed. */
        public array $sets = [];

        public function __construct() {
            $this->globals = new class($this) {
                public function __construct(private Game $g) {}
                public function get(string $k) {
                    if ($k === 'oracle_card_played') return $this->g->cardPlayed;
                    if ($k === 'oracle_card_play_colors') return $this->g->playColors;
                    if (array_key_exists($k, $this->g->sets)) return $this->g->sets[$k];
                    return null;
                }
                public function set(string $k, $v): void { $this->g->sets[$k] = $v; }
            };
        }
        public function getPlayerNameById(int $pid): string { return 'P' . $pid; }
        public function isApolloWildActive(): bool { return $this->apolloActive; }
        public function undoCheckpoint(string $label): void { $this->undoLabels[] = $label; }
        public function DbQuery(string $sql): void { $this->queries[] = $sql; }

        public function getObjectFromDB(string $sql) {
            // "the current wild card" lookup
            if (str_contains($sql, 'is_wild = 1')) {
                foreach ($this->hand as $id => $c) {
                    if ($c['in_hand'] && $c['is_wild'] === 1) {
                        return ['card_id' => (string)$id];
                    }
                }
                return null;
            }
            // "this specific card" lookup
            if (preg_match('/card_id = (\d+)/', $sql, $m)) {
                $id = (int)$m[1];
                $c = $this->hand[$id] ?? null;
                if ($c === null || !$c['in_hand']) return null;
                return [
                    'card_id' => (string)$id,
                    'is_wild' => (string)$c['is_wild'],
                    'card_type_arg' => (string)($c['type_arg'] ?? 0),
                ];
            }
            return null;
        }
    }
}

namespace {
    function clienttranslate(string $s): string { return $s; }

    require_once __DIR__ . '/../modules/php/States/UndoableState.php';
    require_once __DIR__ . '/../modules/php/States/PlayerActions.php';

    use Bga\Games\theoracleofdelphi\Game;
    use Bga\Games\theoracleofdelphi\States\PlayerActions;

    $passed = 0; $failed = 0;
    function check(bool $c, string $m): void {
        global $passed, $failed;
        if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
    }

    /** Fake notifier capturing notify->player() calls. */
    class FakeNotify {
        public array $calls = [];
        public function player(int $pid, string $type, string $msg, array $args): void {
            $this->calls[] = ['pid' => $pid, 'type' => $type, 'msg' => $msg, 'args' => $args];
        }
        public function all(string $type, string $msg, array $args): void {
            $this->calls[] = ['pid' => null, 'type' => $type, 'msg' => $msg, 'args' => $args];
        }
    }

    /**
     * Build a PlayerActions with the constructor bypassed (its parent needs the
     * BGA platform), then inject the fake game + notifier by reflection.
     */
    function makeState(Game $game): array {
        $rc = new ReflectionClass(PlayerActions::class);
        $state = $rc->newInstanceWithoutConstructor();
        $prop = $rc->getProperty('game');
        $prop->setAccessible(true);
        $prop->setValue($state, $game);
        $notify = new FakeNotify();
        $state->notify = $notify;
        return [$state, $notify];
    }

    function newGame(array $hand, bool $apollo = true, int $played = 0): Game {
        $g = new Game();
        $g->hand = $hand;
        $g->apolloActive = $apollo;
        $g->cardPlayed = $played;
        return $g;
    }

    // Hand: 11 is the drawn wild card, 12 and 13 are ordinary cards.
    $baseHand = [
        11 => ['in_hand' => true, 'is_wild' => 1, 'type_arg' => 0],  // red
        12 => ['in_hand' => true, 'is_wild' => 0, 'type_arg' => 2],  // green
        13 => ['in_hand' => true, 'is_wild' => 0, 'type_arg' => 3],  // blue
    ];

    // ---- Apollo active: the free-colour gate is armed ----------------------
    $g = newGame($baseHand);
    [$state, $notify] = makeState($g);
    $ret = $state->actPlayOracleCard(12, 7);

    check($ret === \Bga\Games\theoracleofdelphi\States\SelectAction::class
          || is_string($ret), 'play returns a next state');
    check(($g->sets['apollo_pending_recolor'] ?? null) === 1,
        'playing a card under Apollo arms the free-colour gate');
    check(($g->sets['oracle_card_played'] ?? null) === 1, 'the card play is marked spent');
    check(($g->sets['selected_oracle_card_id'] ?? null) === 12, 'the played card is recorded');
    // Card 12 is type_arg 2 = green, and no retained recolour applies.
    check(($g->sets['selected_oracle_card_color'] ?? null) === 'green',
        'the play colour seeds from the native colour, got '
        . var_export($g->sets['selected_oracle_card_color'] ?? null, true));
    check(($g->sets['demigod_wild_resolved'] ?? null) === 0,
        'the Demigod one-shot resets for this new source');
    check(count($notify->calls) === 1 && $notify->calls[0]['type'] === 'oracleCardPlayed',
        'the play is announced');

    // ---- a retained paid recolour still wins over the native colour --------
    $g = newGame($baseHand);
    $g->playColors = [12 => 'pink'];
    [$state, ] = makeState($g);
    $state->actPlayOracleCard(12, 7);
    check(($g->sets['selected_oracle_card_color'] ?? null) === 'pink',
        'a retained recolour is resumed on re-play');

    // ---- Apollo inactive: the gate must NOT be armed -----------------------
    $g = newGame($baseHand, apollo: false);
    [$state, ] = makeState($g);
    $state->actPlayOracleCard(12, 7);
    check(!array_key_exists('apollo_pending_recolor', $g->sets),
        'without Apollo the free-colour gate is never armed');

    // ---- the one-card-per-turn limit still holds --------------------------
    $threw = false;
    try {
        $g = newGame($baseHand, played: 1);
        [$state, ] = makeState($g);
        $state->actPlayOracleCard(12, 7);
    } catch (\Bga\GameFramework\UserException $e) {
        $threw = true;
    } catch (\Exception $e) {
        $threw = str_contains($e->getMessage(), 'already played');
    }
    check($threw, 'a second Oracle card play in one turn is rejected');

    // ---- Apollo no longer forbids playing an ordinary card ----------------
    // (The old build threw "You must play the wild oracle card drawn by Apollo".)
    $g = newGame($baseHand);
    [$state, ] = makeState($g);
    $ok = true;
    try { $state->actPlayOracleCard(13, 7); } catch (\Throwable $e) { $ok = false; }
    check($ok, 'any card in hand is playable during an Apollo turn');

    echo "\n$passed passed, $failed failed\n";
    exit($failed === 0 ? 0 : 1);
}
