// PROTOTYPE - NOT FOR PRODUCTION
// Question: Do quiz questions under pressure (buy timer, ticking bomb) make you want to answer fast and right, instead of feeling like homework bolted onto a shooter?
// Date: 2026-11-11
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },

  // ---- Player -------------------------------------------------------------------------
  mouse_sens: { value: 1.0, min: 0.2, max: 3, step: 0.1 },      // multiplier; [ and ] on the pause screen
  key_turn_speed: { value: 2.4, min: 0.5, max: 5, step: 0.1 },  // radians/s when turning with the arrow keys
  run_speed: { value: 5.4, min: 2, max: 9, step: 0.1 },         // m/s
  walk_speed: { value: 2.6, min: 1, max: 5, step: 0.1 },        // m/s with Shift
  sniper_speed_mult: { value: 0.85, min: 0.5, max: 1, step: 0.05 },
  max_hp: { value: 100, min: 25, max: 200, step: 5 },
  armor_absorb: { value: 0.5, min: 0, max: 0.9, step: 0.05 },   // share of damage armour takes
  headshot_mult: { value: 2.5, min: 1, max: 4, step: 0.1 },     // the player's shots only

  // ---- Rounds -------------------------------------------------------------------------
  buy_time: { value: 25, min: 8, max: 60, step: 1 },            // s; gates closed, buying open
  round_time: { value: 105, min: 40, max: 240, step: 5 },       // s until defenders win by time
  bomb_time: { value: 40, min: 15, max: 90, step: 1 },          // s from plant to boom
  plant_time: { value: 3, min: 1, max: 8, step: 0.5 },          // s holding E on a site
  defuse_answers: { value: 1, min: 1, max: 4, step: 1 },        // right answers to cut the bomb
  wrong_delay: { value: 0.6, min: 0.2, max: 2, step: 0.1 },     // s the card shakes before the new question
  rounds_to_win: { value: 4, min: 2, max: 9, step: 1 },
  halftime_after: { value: 3, min: 1, max: 8, step: 1 },        // rounds before the sides swap
  round_end_delay: { value: 5, min: 2, max: 10, step: 0.5 },    // s the round banner stays

  // ---- Economy ($) --------------------------------------------------------------------
  start_money: { value: 1250, min: 0, max: 5000, step: 50 },
  win_money: { value: 3000, min: 500, max: 6000, step: 100 },
  loss_money: { value: 1400, min: 0, max: 4000, step: 100 },
  loss_bonus: { value: 500, min: 0, max: 1500, step: 50 },      // extra per loss in a row
  kill_money: { value: 300, min: 0, max: 1500, step: 50 },
  plant_money: { value: 300, min: 0, max: 1500, step: 50 },
  max_money: { value: 9000, min: 2000, max: 20000, step: 500 },
  price_smg: { value: 1200, min: 0, max: 5000, step: 50 },
  price_rifle: { value: 2700, min: 0, max: 6000, step: 50 },
  price_sniper: { value: 3800, min: 0, max: 7000, step: 50 },
  price_armor: { value: 650, min: 0, max: 3000, step: 50 },
  price_ammo: { value: 200, min: 0, max: 1500, step: 50 },

  // ---- Weapons: damage per hit, seconds between shots, magazine, reserve, spread (radians)
  pistol_dmg: { value: 26, min: 5, max: 100, step: 1 },
  pistol_rate: { value: 0.28, min: 0.05, max: 1, step: 0.01 },
  pistol_mag: { value: 12, min: 1, max: 40, step: 1 },
  pistol_reserve: { value: 36, min: 0, max: 120, step: 1 },
  pistol_spread: { value: 0.012, min: 0, max: 0.1, step: 0.001 },
  smg_dmg: { value: 20, min: 5, max: 100, step: 1 },
  smg_rate: { value: 0.085, min: 0.03, max: 0.5, step: 0.005 },
  smg_mag: { value: 25, min: 1, max: 60, step: 1 },
  smg_reserve: { value: 75, min: 0, max: 200, step: 1 },
  smg_spread: { value: 0.02, min: 0, max: 0.1, step: 0.001 },
  rifle_dmg: { value: 34, min: 5, max: 120, step: 1 },
  rifle_rate: { value: 0.11, min: 0.03, max: 0.5, step: 0.005 },
  rifle_mag: { value: 30, min: 1, max: 60, step: 1 },
  rifle_reserve: { value: 90, min: 0, max: 200, step: 1 },
  rifle_spread: { value: 0.01, min: 0, max: 0.1, step: 0.001 },
  sniper_dmg: { value: 110, min: 20, max: 200, step: 5 },
  sniper_rate: { value: 1.3, min: 0.3, max: 3, step: 0.05 },
  sniper_mag: { value: 5, min: 1, max: 20, step: 1 },
  sniper_reserve: { value: 15, min: 0, max: 60, step: 1 },
  sniper_spread: { value: 0.07, min: 0, max: 0.2, step: 0.005 },  // unscoped; scoped is near zero
  move_spread: { value: 0.035, min: 0, max: 0.15, step: 0.005 },  // added while running
  reload_time: { value: 2.2, min: 0.5, max: 5, step: 0.1 },

  // ---- Bots: the challenge ramps from round 1 to round 1 + ramp_rounds ------------------
  ramp_rounds: { value: 2, min: 0, max: 6, step: 1 },
  bot_react_start: { value: 0.95, min: 0.1, max: 2, step: 0.05 }, // s before a bot fires at a new target
  bot_react_end: { value: 0.38, min: 0.1, max: 2, step: 0.05 },
  bot_acc_start: { value: 0.2, min: 0.02, max: 1, step: 0.01 },   // base hit chance per shot
  bot_acc_end: { value: 0.5, min: 0.02, max: 1, step: 0.01 },
  bot_fire_slow: { value: 1.6, min: 1, max: 4, step: 0.1 },       // bots fire this much slower than the gun allows
  bot_speed_rusher: { value: 5.0, min: 1, max: 8, step: 0.1 },    // m/s
  bot_speed_rifleman: { value: 4.4, min: 1, max: 8, step: 0.1 },
  bot_speed_sniper: { value: 3.8, min: 1, max: 8, step: 0.1 },
  bot_view_range: { value: 75, min: 10, max: 150, step: 5 },      // m
  bot_fov_deg: { value: 130, min: 40, max: 360, step: 5 },
  bot_answer_right: { value: 0.75, min: 0, max: 1, step: 0.05 },  // chance a bot answers a buy question
  bot_defuse_right: { value: 0.5, min: 0, max: 1, step: 0.05 },   // chance a bot's defuse answer is right
  bot_think_min: { value: 2.5, min: 0.5, max: 8, step: 0.1 },     // s a bot thinks per defuse question
  bot_think_max: { value: 4.5, min: 0.5, max: 10, step: 0.1 },
  sniper_hold_time: { value: 20, min: 0, max: 60, step: 1 },      // s an attacking sniper watches mid first
};
