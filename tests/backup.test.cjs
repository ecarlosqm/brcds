const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const context = vm.createContext({ window: {}, Blob });
vm.runInContext(readFileSync(require.resolve('../backup.js'), 'utf8'), context);
const backup = context.window.SheetBackup;
const products = [{ name: 'Jamón', code: 'CM-JAMON-FUD', photo: null }];
const plain = value => JSON.parse(JSON.stringify(value));
const file = data => new Blob([JSON.stringify(data)]);

test('round-trips every allowed grid without changing products or codes', async () => {
  for (let columns = 3; columns <= 6; columns++) {
    for (let rows = 4; rows <= 8; rows++) {
      const layout = { columns, rows };
      const restored = await backup.parse(await backup.serialize(products, layout));
      assert.deepEqual(plain(restored), { products, layout });
    }
  }
});

test('old backups default to 3 × 4', async () => {
  const restored = await backup.parse(file({ format: 'en-hoja', version: 1, products }));
  assert.deepEqual(plain(restored), { products, layout: { columns: 3, rows: 4 } });
});

test('invalid grid settings reject the backup before restoration', async () => {
  for (const layout of [null, {}, { columns: 2, rows: 4 }, { columns: 7, rows: 4 },
    { columns: 3, rows: 3 }, { columns: 3, rows: 9 }, { columns: 3.5, rows: 4 },
    { columns: '3', rows: 4 }]) {
    await assert.rejects(backup.parse(file({ format: 'en-hoja', version: 1, products, layout })), /cuadrícula/);
  }
});
