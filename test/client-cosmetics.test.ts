import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETICS, cosmeticsIn, DEFAULTS } from '../src/shared/cosmetics.ts';
import { CAMOS, CAMO_IDS } from '../src/client/camo.ts';
import { HELMETS, HELMET_IDS, helmetReach } from '../src/client/hats.ts';
import { SKIN_IDS, skinInk } from '../src/client/gunart.ts';
import { KILL_FX_IDS } from '../src/client/killfx.ts';
import { cosLook, lookOfEquipped, RARITY_INK, rarityRank, unlockLabel, unlockTier } from '../src/client/cosmeticlook.ts';
import { headHalf } from '../src/client/bodies.ts';

test('every helmet, camo, gun skin and kill effect in the catalog has a drawing', () => {
  const missing: string[] = [];
  const need = (ids: readonly string[], have: readonly string[]) => { for (const id of ids) if (!have.includes(id)) missing.push(id); };
  need(cosmeticsIn('helmet').map((c) => c.id), HELMET_IDS);
  need(cosmeticsIn('camo').map((c) => c.id), CAMO_IDS);
  need(cosmeticsIn('gunSkin').map((c) => c.id), SKIN_IDS);
  need(cosmeticsIn('killFx').map((c) => c.id), KILL_FX_IDS);
  assert.deepEqual(missing, [], `catalog ids without a draw implementation: ${missing.join(', ')}`);
});

test('nothing is drawn that the catalog does not list, so a removed id cannot linger', () => {
  const ids = new Set(COSMETICS.map((c) => c.id));
  for (const id of [...HELMET_IDS, ...CAMO_IDS, ...SKIN_IDS, ...KILL_FX_IDS]) assert.ok(ids.has(id), `${id} is drawn but not in the catalog`);
});

test('name colours and titles need no drawing code: every colour has a swatch, every animated one has stops to slide', () => {
  for (const c of cosmeticsIn('nameColor')) { assert.ok(c.swatch.length >= 1, c.id); if (c.animated) assert.ok(c.swatch.length >= 2, c.id); }
  for (const c of cosmeticsIn('title')) assert.ok(c.name.length > 0 && c.name.length <= 24, `${c.id} title fits a tag`);
});

test('cosLook maps the wire form to draw parameters, defaulting every slot that is absent or unknown', () => {
  const none = cosLook(undefined);
  assert.deepEqual(none, { helmet: DEFAULTS.helmet, camo: DEFAULTS.camo, skin: DEFAULTS.gunSkin, nameColor: DEFAULTS.nameColor, title: DEFAULTS.title, killFx: DEFAULTS.killFx, level: 0, prestige: 0 });
  const worn = cosLook({ h: 'h_viking', c: 'c_galaxy', g: 'g_molten', n: 'n_aurora', t: 't_legend', k: 'k_coins', l: 64, p: 2 });
  assert.equal(worn.helmet, 'h_viking');
  assert.equal(worn.camo, 'c_galaxy');
  assert.equal(worn.skin, 'g_molten');
  assert.equal(worn.nameColor, 'n_aurora');
  assert.equal(worn.title, 't_legend');
  assert.equal(worn.killFx, 'k_coins');
  assert.equal(worn.level, 64);
  assert.equal(worn.prestige, 2);
  // An id from a newer catalog, or one filed under the wrong slot, wears the default rather than breaking the draw.
  const odd = cosLook({ h: 'h_from_the_future', c: 'g_gold', k: 'n_gold', l: -3, p: 1.9 });
  assert.equal(odd.helmet, DEFAULTS.helmet);
  assert.equal(odd.camo, DEFAULTS.camo);
  assert.equal(odd.killFx, DEFAULTS.killFx);
  assert.equal(odd.level, 0);
  assert.equal(odd.prestige, 1);
});

test('an equipped set maps the same way as the wire form', () => {
  const l = lookOfEquipped({ helmet: 'h_crown', camo: 'c_plain', gunSkin: 'g_gold' });
  assert.equal(l.helmet, 'h_crown');
  assert.equal(l.camo, DEFAULTS.camo);
  assert.equal(l.skin, 'g_gold');
  assert.equal(lookOfEquipped(undefined).helmet, DEFAULTS.helmet);
});

test('the locked card says what unlocks an item', () => {
  const by = (id: string) => COSMETICS.find((c) => c.id === id)!;
  assert.equal(unlockLabel(by('h_cone')), 'Level 34');
  assert.equal(unlockLabel(by('h_centurion')), 'Centurion II');
  assert.equal(unlockLabel(by('h_party')), 'Weekly challenge');
  assert.equal(unlockLabel(by('h_standard')), 'Default');
  assert.equal(unlockTier(by('h_centurion')), 'silver');
  assert.equal(unlockTier(by('h_cone')), null);
});

test('rarity ink follows the rarity order, and gold stays for legendary', () => {
  assert.ok(rarityRank('common') < rarityRank('rare') && rarityRank('rare') < rarityRank('epic') && rarityRank('epic') < rarityRank('legendary'));
  assert.equal(new Set(Object.values(RARITY_INK)).size, 4);
  assert.equal(RARITY_INK.legendary, '#ffd34d');
});

test('a head sprite is big enough for the tallest hat, and the stock helmet keeps its old size', () => {
  const R = 24;
  assert.equal(headHalf(R, 'h_standard'), (0.2 + 0.14) * R + 0.41 * R + 2);
  for (const id of HELMET_IDS) { assert.ok(helmetReach(id) >= 1, id); assert.ok(headHalf(R, id) >= headHalf(R), id); }
  assert.ok(headHalf(R, 'h_cone') > headHalf(R, 'h_beret'), 'a cone stands taller than a beret');
  assert.equal(Object.keys(HELMETS).length, cosmeticsIn('helmet').length);
  assert.equal(Object.keys(CAMOS).length, cosmeticsIn('camo').length);
});

test('a gun skin colours the kill feed glyph, the stock gun does not', () => {
  assert.equal(skinInk('g_factory'), null);
  assert.equal(skinInk(undefined), null);
  assert.equal(skinInk('g_gold'), '#ffd34d');
});
