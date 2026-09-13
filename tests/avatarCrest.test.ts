import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AvatarCrest} from '../src/client/ArenaAtmosphere';

test('avatar crest renders a metal rim and central arena emblem without a portrait',()=>{
  const markup=renderToStaticMarkup(createElement(AvatarCrest));
  assert.match(markup,/class="crest-metal-rim"/);
  assert.match(markup,/class="crest-emblem"/);
  assert.doesNotMatch(markup,/<image|<img/);
});
