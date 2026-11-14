# Mobile HUD layout from HUD.tiff (2026-11-14)

The person's drawing (HUD-reference.png, from HUD.tiff in the project root), Free Fire style: 1 movement, 2 fire, 3 aim,
4 prone, 5 crouch, 6 stand, 7 buy, 8 medkit, and 9 a weapon selector placed by us. Layout option A chosen by the person for
the buttons the drawing does not show.

- h1-h3 (emulated phone 844x390, touch, real Chrome): the stick low left with Comprar and Botiquín in the left edge column;
  Fuego big low right with Apuntar above it; Tumbarse, Agacharse and De pie in the right edge column, the current stance lit
  (De pie at the start, Tumbarse in h3); the weapon selector above Apuntar showing the gun in hand ("Rifle ⇄") with Recargar
  beside it; Saltar left of Fuego; Plantar left of Apuntar, shown only while it can be used; Tabla and Pausa unchanged.
  The right-thumb buttons and the stick sit a little higher than in the drawing so Fuego clears the canvas's bomb and ammo
  boxes and the stick clears the stance box.
- buttons-run.txt: each button checked: Tumbarse -> prone, Agacharse -> crouch (from prone too), De pie -> stand (from prone
  or crouch), the lit button follows; the weapon selector swaps Pistola -> Rifle; the bomb button shows while carrying the
  bomb and hides when there is nothing to do with it; no page errors.
- New settings: touch_fire_scale 1.9 and touch_aim_scale 1.3 (data/config.json). Desktop and the protocol are unchanged
  (same-seed replay match yes).
- Not checked on a real phone.
