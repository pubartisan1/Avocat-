import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJSON } from '../src/llm.js';

test('extractJSON lit un JSON entouré de texte ou de balises', () => {
  assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJSON('Voici : {"b":[1,2]} merci'), { b: [1, 2] });
  assert.deepEqual(extractJSON('[{"c":true}]'), [{ c: true }]);
  assert.throws(() => extractJSON('rien ici'));
});
