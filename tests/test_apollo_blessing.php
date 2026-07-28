<?php
/**
 * Tests for Apollo's movable wild blessing
 * (see docs/superpowers/specs/2026-07-27-apollo-movable-wild-blessing-design.md).
 *
 * Covers PlayerActions::actMoveApolloBlessing:
 *   - the "exactly one wild card in hand" invariant (clear before set),
 *   - the private, log-free notification payload,
 *   - every rejection path (Apollo inactive, play already spent, target not in
 *     hand, target already wild, no wild card to move).
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

        public function __construct() {
            $this->globals = new class($this) {
                public function __construct(private Game $g) {}
                public function get(string $k) {
                    if ($k === 'oracle_card_played') return $this->g->cardPlayed;
                    if ($k === 'oracle_card_play_colors') return $this->g->playColors;
                    return null;
                }
            };
        }
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

    // ---- happy path -------------------------------------------------------
    $g = newGame($baseHand);
    [$state, $notify] = makeState($g);
    $ret = $state->actMoveApolloBlessing(12, 7);

    check($ret === PlayerActions::class, 'move returns to PlayerActions');
    check(count($g->queries) === 2, 'exactly two UPDATEs issued, got ' . count($g->queries));
    // Order matters: clearing before setting keeps "one wild card" true throughout.
    check(isset($g->queries[0])
        && str_contains($g->queries[0], 'is_wild = 0')
        && str_contains($g->queries[0], 'card_id = 11'),
        'first UPDATE clears the old wild card');
    check(isset($g->queries[1])
        && str_contains($g->queries[1], 'is_wild = 1')
        && str_contains($g->queries[1], 'card_id = 12'),
        'second UPDATE sets the new wild card');
    check($g->undoLabels === ['move Apollo blessing'], 'an undo checkpoint is taken');

    check(count($notify->calls) === 1, 'exactly one notification');
    $n = $notify->calls[0] ?? null;
    check($n && $n['type'] === 'apolloBlessingMoved', 'notif type is apolloBlessingMoved');
    check($n && $n['pid'] === 7, 'notification is private to the acting player');
    check($n && $n['msg'] === '', 'no log message (wild identity is hidden information)');
    check($n && ($n['args']['from_card_id'] ?? null) === 11, 'payload carries from_card_id');
    check($n && ($n['args']['to_card_id'] ?? null) === 12, 'payload carries to_card_id');
    // The client needs the destination's CURRENT colour to decrement the right
    // per-colour stack in the hand.
    check($n && ($n['args']['to_color'] ?? null) === 'green',
        'payload carries the destination native colour, got ' . var_export($n['args']['to_color'] ?? null, true));

    // A paid recolour is retained per card, so it must win over the native colour.
    $g = newGame($baseHand);
    $g->playColors = [12 => 'pink'];
    [$state2, $notify2] = makeState($g);
    $state2->actMoveApolloBlessing(12, 7);
    check(($notify2->calls[0]['args']['to_color'] ?? null) === 'pink',
        'retained recolour wins over native colour, got '
        . var_export($notify2->calls[0]['args']['to_color'] ?? null, true));

    // ---- rejection paths --------------------------------------------------
    function rejects(callable $fn, string $needle, string $label): void {
        try {
            $fn();
            check(false, "$label: expected a UserException");
        } catch (\Bga\GameFramework\UserException $e) {
            check(str_contains($e->getMessage(), $needle),
                "$label: message was '{$e->getMessage()}'");
        }
    }

    global $baseHand;
    rejects(function () use ($baseHand) {
        $g = newGame($baseHand, apollo: false);
        [$s, ] = makeState($g);
        $s->actMoveApolloBlessing(12, 7);
    }, 'Apollo is not active', 'Apollo inactive');

    rejects(function () use ($baseHand) {
        $g = newGame($baseHand, played: 1);
        [$s, ] = makeState($g);
        $s->actMoveApolloBlessing(12, 7);
    }, 'already played an oracle card', 'card play already spent');

    rejects(function () use ($baseHand) {
        $g = newGame($baseHand);
        [$s, ] = makeState($g);
        $s->actMoveApolloBlessing(99, 7);   // not in hand
    }, 'not in your hand', 'target not in hand');

    rejects(function () use ($baseHand) {
        $g = newGame($baseHand);
        [$s, ] = makeState($g);
        $s->actMoveApolloBlessing(11, 7);   // already the wild one
    }, 'already your wild card', 'target already wild');

    rejects(function () {
        // Apollo active but nothing wild in hand (e.g. deck was empty, so the
        // draw never happened): there is no blessing to move.
        $g = newGame([12 => ['in_hand' => true, 'is_wild' => 0, 'type_arg' => 2]]);
        [$s, ] = makeState($g);
        $s->actMoveApolloBlessing(12, 7);
    }, 'no wild oracle card', 'no blessing exists');

    // A rejected move must not touch the cards.
    $g = newGame($baseHand, played: 1);
    [$s, ] = makeState($g);
    try { $s->actMoveApolloBlessing(12, 7); } catch (\Throwable $e) {}
    check($g->queries === [], 'a rejected move issues no UPDATE');

    echo "\n$passed passed, $failed failed\n";
    exit($failed === 0 ? 0 : 1);
}
