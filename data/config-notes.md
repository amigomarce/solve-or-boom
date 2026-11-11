# The values' notes

What `prototypes/solve-or-boom/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)

---- Player -------------------------------------------------------------------------
- `mouse_sens`: multiplier; [ and ] on the pause screen
- `key_turn_speed`: radians/s when turning with the arrow keys
- `run_speed`: m/s
- `walk_speed`: m/s with Shift
- `armor_absorb`: share of damage armour takes
- `headshot_mult`: the player's shots only

---- Rounds -------------------------------------------------------------------------
- `buy_time`: s; gates closed, buying open
- `round_time`: s until defenders win by time
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
