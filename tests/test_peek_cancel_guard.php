<?php
/**
 * Exploit regression test: "Look at Islands" must not be cancellable AFTER the
 * shrine contents have been revealed.
 *
 * PeekIslands has two phases in one state. actConfirmPeek() reveals the picked
 * islands — writing them permanently into player_island_knowledge and calling
 * sealUndo() — then returns PeekIslands::class, re-entering the same state in
 * the viewing phase. actCancel() is declared on the state for the SELECTING
 * phase, where returning to SelectAction without spending the source is
 * correct (nothing has been seen; SelectAction::actLookAtIslands deliberately
 * does not seal for that reason).
 *
 * But BGA validates actions per-STATE, not per-phase, so actCancel stayed
 * callable in the viewing phase: look at two islands, then cancel, and the
 * player keeps the knowledge permanently AND gets an unspent die back — with
 * the undo slot already sealed, so nothing can take it back. The client only
 * renders Cancel in the selecting phase, so this needs a stale or hand-crafted
 * client, which is exactly what server-side validation is for. ScoutIslands
 * (the Equipment 013 twin) is safe only because it never declares a cancel.
 *
 * Drives the REAL shipped PeekIslands::actCancel / actEndPeek. The BGA
 * framework isn't available off-platform, so minimal stub parents are declared
 * first — same trick as tests/test_scout_islands_args.php, extended to cover
 * instantiation (notify + globals + the Game type hint).
 *
 * Run: php tests/test_peek_cancel_guard.php
 */

namespace Bga\GameFramework {
    // StateType is only passed through to the (stubbed) parent constructor, so
    // a const holder is enough — no need to mirror the real enum.
    if (!class_exists(StateType::class)) {
        class StateType {
            const ACTIVE_PLAYER = 'activeplayer';
            const GAME = 'game';
        }
    }
}

namespace Bga\GameFramework\States {
    if (!class_exists(GameState::class)) {
        class GameState {
            public $notify;
            /** Named args from parent::__construct(id:, type:, ...) land in $options. */
            public function __construct($game, ...$options) {
                $this->notify = new class {
                    public array $sent = [];
                    public function all(...$a): void { $this->sent[] = ['all', $a]; }
                    public function player(...$a): void { $this->sent[] = ['player', $a]; }
                };
            }
        }
    }
}

namespace Bga\Games\theoracleofdelphi {
    if (!class_exists(Game::class)) {
        class Game {
            public $globals;
            /** Records every spendActionSource() call so the test can assert on it. */
            public array $spendCalls = [];

            public function __construct() {
                $this->globals = new class {
                    private array $v = [];
                    public function get(string $k) { return $this->v[$k] ?? null; }
                    public function set(string $k, $val): void { $this->v[$k] = $val; }
                };
            }
            public function spendActionSource(int $playerId): string {
                $this->spendCalls[] = $playerId;
                return 'STUB_SourceSpent';
            }
            public function getActivePlayerId(): int { return 7; }
            public function getPlayerNameById(int $id): string { return 'tester'; }
        }
    }
}

namespace {
    if (!function_exists('clienttranslate')) {
        function clienttranslate(string $s): string { return $s; }
    }

    require_once __DIR__ . '/../modules/php/States/PeekIslands.php';

    use Bga\Games\theoracleofdelphi\Game;
    use Bga\Games\theoracleofdelphi\States\PeekIslands;
    use Bga\Games\theoracleofdelphi\States\SelectAction;

    $passed = 0; $failed = 0;
    function check(bool $c, string $m): void {
        global $passed, $failed;
        if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
    }

    const PLAYER = 7;

    function makeState(bool $viewing): array {
        $game = new Game();
        // peek_hexes is set alongside peek_viewing by actConfirmPeek.
        if ($viewing) {
            $game->globals->set('peek_viewing', true);
            $game->globals->set('peek_hexes', json_encode([
                ['q' => 1, 'r' => 0, 'shrine_owner_color' => 'blue', 'shrine_letter' => 'omega', 'color' => 'blue'],
                ['q' => 2, 'r' => 1, 'shrine_owner_color' => 'pink', 'shrine_letter' => 'psi',   'color' => 'pink'],
            ]));
        }
        return [new PeekIslands($game), $game];
    }

    // -----------------------------------------------------------------------
    // Selecting phase: cancel is legitimate. Nothing was revealed, so the
    // source must NOT be spent and we go back to SelectAction.
    // -----------------------------------------------------------------------
    [$state, $game] = makeState(false);
    $next = $state->actCancel(PLAYER);

    check($next === SelectAction::class,
          'selecting phase: cancel returns to SelectAction');
    check($game->spendCalls === [],
          'selecting phase: cancel does NOT spend the action source (nothing was seen)');

    // -----------------------------------------------------------------------
    // Viewing phase: the reveal already happened. Cancel must not hand back an
    // unspent source — it is treated as End Look instead.
    // -----------------------------------------------------------------------
    [$state, $game] = makeState(true);
    $next = $state->actCancel(PLAYER);

    check($game->spendCalls === [PLAYER],
          'viewing phase: cancel spends the action source (no free look)');
    // Implies $next !== SelectAction::class — the die is not handed back.
    check($next === 'STUB_SourceSpent',
          'viewing phase: cancel returns whatever spendActionSource routes to (End Look semantics)');
    check($game->globals->get('peek_viewing') === null,
          'viewing phase: cancel still clears peek_viewing');
    check($game->globals->get('peek_hexes') === null,
          'viewing phase: cancel still clears peek_hexes');

    // The unflip + eye-marker teardown notifs that actEndPeek owns must fire,
    // or opponents keep a stale "is looking here" marker on their boards.
    $kinds = array_map(fn($s) => $s[0], $state->notify->sent);
    check(in_array('player', $kinds, true),
          'viewing phase: cancel sends the private peekEnded notif (client unflips the shrines)');
    check(in_array('all', $kinds, true),
          'viewing phase: cancel sends the public playerPeekEnded notif (opponents drop eye markers)');

    // -----------------------------------------------------------------------
    // zombie() delegates to actCancel, which owns the phase branch — so a
    // timed-out player in the viewing phase also spends the source rather than
    // banking the look. (Fresh state: each call mutates peek_viewing.)
    // -----------------------------------------------------------------------
    [$zState, $zGame] = makeState(true);
    check($zState->zombie(PLAYER) === 'STUB_SourceSpent' && $zGame->spendCalls === [PLAYER],
          'zombie() in the viewing phase spends the source too');

    echo "\n$passed passed, $failed failed\n";
    exit($failed === 0 ? 0 : 1);
}
