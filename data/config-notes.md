# The values' notes

What `prototypes/solve-or-boom/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
- `default_map`: the map the session screen starts on (pequeno, grande, patio, pasillos: data/maps/<id>.json); C or a click changes it there

---- Player -------------------------------------------------------------------------
- `mouse_sens`: multiplier; [ and ] on the pause screen
- `key_turn_speed`: radians/s when turning with the arrow keys
- `run_speed`: m/s
- `walk_speed`: m/s with Shift
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
