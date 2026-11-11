# The values' notes

What `prototypes/solve-or-boom/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
- `default_map`: the map the session screen starts on (pequeno, grande, patio, pasillos: data/maps/<id>.json); C or a click changes it there

---- Player -------------------------------------------------------------------------
- `mouse_sens`: multiplier; [ and ] on the pause screen
- `key_turn_speed`: radians/s when turning with the arrow keys
- `run_speed`: m/s, the normal pace (no key held)
- `walk_speed`: m/s holding the walk key (X by default; keys in data/keybinds.json)
- `sprint_speed`: m/s holding the sprint key (Left Shift) while moving; no shooting while sprinting; it stands you up from prone
- `crouch_eye`: m, eye height while holding crouch (C); standing is EYE, 1.6 m, in src/game/map.ts
- `crouch_speed_mult`: speed multiplier while crouched
- `crouch_spread_mult`: your shot spread multiplier while crouched
- `crouch_hit_mult`: bots' hit chance against you, multiplied, while crouched
- `prone_eye`: m, eye height while prone (Z toggles)
- `prone_speed_mult`: speed multiplier while prone
- `prone_spread_mult`: your shot spread multiplier while prone
- `prone_hit_mult`: bots' hit chance against you, multiplied, while prone
- `prone_time`: s to get down or up; no moving or shooting meanwhile; the stance counts from the end of it
- `jump_velocity`: m/s upward at take-off (Space); only standing, on the ground
- `gravity`: m/s² pulling a jump back down
- `air_spread_mult`: your shot spread multiplier in the air
- `eye_rate`: how fast the eye moves to a new stance's height (share of the gap closed per second; higher is snappier)
- `armor_absorb`: share of damage armour takes
- `headshot_mult`: the player's shots only

---- Rounds -------------------------------------------------------------------------
- `buy_time`: s; gates closed, buying open
- round time: s until defenders win by time; each map has its own, `round_time` in data/maps/<map>.json (Pequeño 105, Grande 150, Patio 140, Pasillos 180)
- `bomb_time`: s from plant to boom
- `plant_time`: s holding E on a site
- `defuse_answers`: right answers to cut the bomb
- `wrong_delay`: s the card shakes before the new question
- `halftime_after`: rounds before the sides swap
- `round_end_delay`: s the round banner stays

---- Economy ($) --------------------------------------------------------------------
- `loss_bonus`: extra per loss in a row

---- Weapons: damage per hit, seconds between shots, magazine, reserve, spread (radians)
- `sniper_spread`: unscoped; scoped is near zero
- `move_spread`: added while running

---- Bots: the challenge ramps from round 1 to round 1 + ramp_rounds ------------------
- `bot_react_start`: s before a bot fires at a new target
- `bot_acc_start`: base hit chance per shot
- `bot_fire_slow`: bots fire this much slower than the gun allows
- `bot_speed_rusher`: m/s
- `bot_view_range`: m
- `bot_answer_right`: chance a bot answers a buy question
- `bot_defuse_right`: chance a bot's defuse answer is right
- `bot_think_min`: s a bot thinks per defuse question
- `sniper_hold_time`: s an attacking sniper watches mid first
- `bot_cover_hp`: a bot below this health that sees an enemy goes to cover (being hit, or reloading with an enemy about, always does)
- `bot_cover_time`: s a bot stays in cover (peeking and hiding) before it takes up its plan again; it never leaves mid-reload
- `bot_cover_search`: cells (walking steps) a bot looks around itself for a cover cell: floor beside a wall or crate with no line of sight to the threat
- `bot_cover_retry`: s before a bot that found no cover looks again
- `bot_peek_show`, `bot_peek_hide`: s out at the peek cell (where it can shoot) and s back behind cover, in turn
- `bot_threat_memory`: s an enemy last seen still counts as "about" for cover while reloading
- `bot_group_wait`: s attackers wait at the staging point for the rest, and rotating defenders wait for the ones behind, before going anyway
- `bot_group_gap`: m a rotating defender lets the farthest teammate fall behind before it waits for them
- `bot_buddy_range`: m: a bot that loses sight of its target goes to where it was last seen, and the nearest free teammate this close goes too
- `bot_site_alert`: m from a site an enemy seen or heard by a defender calls the defenders to rotate there
- `bot_hear_shot`: m a gunshot is heard (was a fixed 24)
- `bot_hear_sprint`, `bot_hear_run`: m your footsteps are heard sprinting (Shift) or running; walking (X), crouched or prone is silent
- `bot_hear_land`: m the landing of your jump is heard
- `bot_step_interval`: s between your footstep noises
- `bot_corner_look`: s an attacker looks at each entry of a site on arriving there
- `bot_corner_merge_deg`: entries closer than this angle, seen from the bot, count as one look
- `bot_sep_dist`: m bots keep from any other body (they spread out instead of walking in single file)
- `bot_repath_strict`: s a bot that got stuck walks its new path cell centre by cell centre; stuck again within it, it snaps to the cell centre

---- Question bank ------------------------------------------------------------------
- `wrong_delay_growth`: factor the lockout grows by for each wrong answer in a row (2 doubles it, 1 keeps it flat)
- `question_step_<item>` (smg, rifle, sniper, armor, ammo): levels above the session level that the item's buy question asks (0 = the same level, capped at Difícil; the defuse uses the session level; a custom CSV ignores it)
- `wrong_delay_max`: s cap of the wrong-answer lockout; `wrong_delay` grows by `wrong_delay_growth` for each wrong answer in a row, a right answer resets it
- `retry_gap`: draws between a missed question and its one retry (a pool smaller than this brings it back after one other question)
- `retry_max`: most times one missed question comes back in a match
- Math ranges per level (facil, medio, dificil): medio keeps the ranges the game had before levels; a custom CSV ignores the level
- `math_arith_a_min_<level>`, `math_arith_a_max_<level>`: first operand of sums and differences (inclusive)
- `math_arith_b_min_<level>`, `math_arith_b_max_<level>`: second operand of sums and differences (inclusive)
- `math_mult_min_<level>`, `math_mult_max_<level>`: both factors of a multiplication or a division
- `math_frac_den_min_<level>`, `math_frac_den_max_<level>`: denominators (min 3); difícil adds fractions with different denominators
- `math_frac_mult_max_<level>`: "n/d of N" uses N = d x (2 to this)
- `math_pct_p_min_<level>`, `math_pct_p_max_<level>`: the percentage, in steps of 5
- `math_pct_base_min_<level>`, `math_pct_base_max_<level>`: the number it is taken of, in steps of 20 so the answer is whole
- `math_eq_x_max_<level>`: the answer x is 1 to this
- `math_eq_a_max_<level>`: the multiplier a is 2 to this
- `math_eq_b_max_<level>`: the added number b is 1 to this; difícil adds a(x + b) = c and ax + b = cx + d

- `sfx_limit_db`: the limiter's threshold in dB on everything heard; lower squeezes overlapping fire harder (no clipping either way)
- `sfx_<gun>_level`: each gun's shot loudness (pistol, smg, rifle, sniper), before the volume and a bot's distance
- `sfx_<gun>_tail`: seconds of each gun's room tail; the number of echoes is tail / sfx_echo_delay, at most 4 (sniper longest)
- `sfx_click_mix`, `sfx_thump_mix`: the sharp crack and the low thump in every shot, against the noise body (1 = as designed)
- `sfx_echo_delay`, `sfx_echo_gain`: seconds between echoes, and how much quieter each echo is than the one before
- `sfx_pan_strength`: how far left or right a bot's shot sits from its direction to the camera (0 = centred, 1 = full)
- `sfx_near_cutoff`, `sfx_far_cutoff`, `sfx_far_dist`: a bot's shot is low-passed from near_cutoff Hz (beside you) to far_cutoff Hz at far_dist metres and beyond; your own gun is never dulled
- `sfx_reload_level`, `sfx_empty_level`: the reload (mag out, mag in, slide or bolt, spread over reload_time) and the dry trigger click
