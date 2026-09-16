/* Portable backups: plain data only, with embedded raster photos. */
(() => {
  'use strict';
  const MAX_BYTES = 100 * 1024 * 1024;
  function validate(data) {
    if (!data || data.format !== 'en-hoja' || data.version !== 1 || !Array.isArray(data.products)) {
      throw new Error('Este archivo no es un respaldo compatible de En hoja.');
    }
    if (data.products.length > 1000) throw new Error('El respaldo supera el límite de 1000 productos.');
    return data.products.map(item => {
      if (!item || typeof item.name !== 'string' || item.name.length > 60 ||
          typeof item.code !== 'string' || item.code.length > 14 ||
          !(item.photo === null || (typeof item.photo === 'string' &&
            item.photo.length <= 21 * 1024 * 1024 &&
            /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.photo)))) {
        throw new Error('El respaldo contiene un producto o una foto no válidos.');
      }
      // Reconstruct records; never use imported IDs, URLs or HTML.
      return { name: item.name, code: item.code, photo: item.photo };
    });
  }
  function readPhoto(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo incluir una foto en el respaldo.'));
      reader.readAsDataURL(blob);
    });
  }
  async function serialize(products) {
    const records = await Promise.all(products.map(async ({ name, code, photo }) => ({
      name, code, photo: photo ? (photo.startsWith('data:') ? photo : await readPhoto(await (await fetch(photo)).blob())) : null
    })));
    const data = { format: 'en-hoja', version: 1, products: records };
    validate(data);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (blob.size > MAX_BYTES) throw new Error('El respaldo supera 100 MB. Usa fotos más pequeñas.');
    return blob;
  }
  async function parse(file) {
    if (file.size > MAX_BYTES) throw new Error('El archivo supera 100 MB.');
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('No se pudo leer el respaldo. Selecciona un archivo .json de En hoja.'); }
    const records = validate(data);
    // Decode before replacing the current sheet; one damaged photo rejects the import.
    for (const item of records) {
      if (!item.photo) continue;
      const image = new Image();
      image.src = item.photo;
      try { await image.decode(); }
      catch { throw new Error('El respaldo contiene una foto dañada. La hoja actual no se modificó.'); }
    }
    return records;
  }
  window.SheetBackup = { serialize, parse };
})();
