(() => {
  'use strict';
  const products = [];
  const $ = (selector) => document.querySelector(selector);
  let sequence = 0;
  let toastTimer;
  let pendingBackup = null;
  let layout = { columns: 3, rows: 4 };
  const capacity = () => layout.columns * layout.rows;
  const available = typeof window.JsBarcode === 'function';
  function notify(message) {
    $('#status').textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#status').textContent = ''; }, 6500);
  }
  function newCode() {
    let code;
    do {
      const random = new Uint32Array(2);
      crypto.getRandomValues(random);
      code = '20' + String(random[0] % 100000).padStart(5, '0') + String(random[1] % 100000).padStart(5, '0');
    } while (products.some(product => product.code === code));
    return code;
  }
  function validate(product) {
    if (!product.name.trim()) return 'Escribe el nombre del producto.';
    if (!/^[A-Za-z0-9-]{1,14}$/.test(product.code)) return 'Usa de 1 a 14 letras, números o guiones.';
    if (products.some(other => other !== product && other.code === product.code)) return 'Este código ya está en la hoja.';
    if (!available) return 'No se cargó la biblioteca de códigos. Revisa tu conexión e intenta recargar.';
    if (product.barcodeError) return 'No se pudo generar este código.';
    return '';
  }
  function updateStatus() {
    $('#count').textContent = products.length;
    $('#page-count').textContent = Math.max(1, Math.ceil(products.length / capacity()));
    $('#distribution').textContent = $('#print-distribution').textContent = `${layout.columns} × ${layout.rows}`;
    $('#grid-capacity').textContent = `${capacity()} productos por hoja`;
    $('#print').disabled = !products.length || products.some(product => validate(product));
    $('#clear').disabled = !products.length;
    $('#backup-save').disabled = !products.length;
    products.forEach(product => {
      const card = document.getElementById(`product-${product.id}`);
      const error = validate(product);
      card.querySelector('.error').textContent = error;
      card.classList.toggle('invalid', Boolean(error));
      card.querySelector('.name').setAttribute('aria-invalid', String(!product.name.trim()));
      card.querySelector('.code').setAttribute('aria-invalid', String(Boolean(error && product.name.trim())));
    });
  }
  function barcode(product, svg) {
    svg.replaceChildren();
    product.barcodeError = false;
    if (!available || !/^[A-Za-z0-9-]{1,14}$/.test(product.code)) return;
    try {
      JsBarcode(svg, product.code, { format: 'CODE128', width: 2, height: 48, displayValue: false, margin: 0, marginLeft: 20, marginRight: 20, marginTop: 0, marginBottom: 0, background: '#fff', lineColor: '#000' });
      // JsBarcode already creates a valid viewBox. Its width/height attributes
      // include "px"; converting them with Number() produces NaN and clips bars.
      // Keep the library's coordinate system, including both quiet zones.
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('aria-label', `Código de barras ${product.code}`);
    } catch { product.barcodeError = true; }
  }
  function makeProduct(product) {
    const card = document.createElement('article');
    card.className = 'product';
    card.id = `product-${product.id}`;
    card.innerHTML = `<button class="delete no-print" title="Eliminar producto" aria-label="Eliminar producto">×</button><button class="photo-button" title="Agregar o cambiar foto" aria-label="Agregar o cambiar foto"><span class="photo-icon" aria-hidden="true">＋</span><span>Agregar foto</span></button><input class="photo-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><textarea class="name" rows="2" maxlength="60" placeholder="Nombre del producto" aria-label="Nombre del producto"></textarea><p class="print-name"></p><svg class="barcode" role="img"></svg><div class="code-row"><input class="code" maxlength="14" spellcheck="false" autocomplete="off" aria-label="Código de barras"><button class="regenerate" title="Generar otro código" aria-label="Generar otro código">↻</button></div><p class="print-code"></p><p class="error no-print" id="error-${product.id}"></p>`;
    const name = card.querySelector('.name');
    const code = card.querySelector('.code');
    const svg = card.querySelector('.barcode');
    const photo = card.querySelector('.photo-button');
    const file = card.querySelector('.photo-input');
    name.value = product.name;
    code.value = product.code;
    name.setAttribute('aria-describedby', `error-${product.id}`);
    code.setAttribute('aria-describedby', `error-${product.id}`);
    card.querySelector('.print-name').textContent = product.name;
    card.querySelector('.print-code').textContent = product.code;
    function showPhoto() {
      const img = new Image();
      img.alt = product.name || 'Foto del producto';
      img.src = product.photo;
      photo.replaceChildren(img);
    }
    if (product.photo) showPhoto();
    name.addEventListener('input', () => {
      product.name = name.value.replace(/\n/g, ' ');
      name.value = product.name;
      card.querySelector('.print-name').textContent = product.name;
      if (photo.querySelector('img')) photo.querySelector('img').alt = product.name;
      updateStatus();
    });
    code.addEventListener('input', () => {
      product.code = code.value;
      card.querySelector('.print-code').textContent = product.code;
      barcode(product, svg);
      updateStatus();
    });
    card.querySelector('.regenerate').addEventListener('click', () => {
      product.code = newCode();
      code.value = product.code;
      card.querySelector('.print-code').textContent = product.code;
      barcode(product, svg);
      updateStatus();
      notify('Se generó un nuevo código.');
    });
    card.querySelector('.delete').addEventListener('click', () => {
      const index = products.indexOf(product);
      if (product.photo) URL.revokeObjectURL(product.photo);
      products.splice(index, 1);
      render();
      (document.querySelectorAll('.name')[Math.min(index, products.length - 1)] || $('#add')).focus();
      notify('Producto eliminado.');
    });
    photo.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const selected = file.files[0];
      file.value = '';
      if (!selected) return;
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(selected.type) || selected.size > 15 * 1024 * 1024) {
        notify('Elige una imagen JPG, PNG, WebP o GIF de hasta 15 MB.');
        return;
      }
      const url = URL.createObjectURL(selected);
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
        if (!products.includes(product)) { URL.revokeObjectURL(url); return; }
        if (product.photo) URL.revokeObjectURL(product.photo);
        product.photo = url;
        showPhoto();
      } catch { URL.revokeObjectURL(url); notify('No se pudo abrir la imagen. Prueba con otra foto.'); }
    });
    barcode(product, svg);
    return card;
  }
  function render() {
    const sheets = $('#sheets');
    sheets.replaceChildren();
    const perPage = capacity();
    const pages = Math.max(1, Math.ceil(products.length / perPage));
    for (let page = 0; page < pages; page++) {
      const paper = document.createElement('section');
      paper.className = 'paper';
      paper.style.setProperty('--print-columns', layout.columns);
      paper.style.setProperty('--print-rows', layout.rows);
      paper.style.setProperty('--print-scale', Math.min(3 / layout.columns, 4 / layout.rows));
      paper.setAttribute('aria-label', `Hoja ${page + 1}`);
      paper.innerHTML = `<div class="paper-head"><strong>PRODUCTOS · CÓDIGOS DE BARRAS</strong><span>MI TIENDA</span></div><div class="product-grid"></div><div class="paper-foot"><span>en hoja</span><span>Hoja ${page + 1} de ${pages}</span></div>`;
      const grid = paper.querySelector('.product-grid');
      const slice = products.slice(page * perPage, (page + 1) * perPage);
      slice.forEach(product => grid.append(makeProduct(product)));
      for (let slot = slice.length; slot < perPage; slot++) {
        const empty = document.createElement(slot === slice.length ? 'button' : 'div');
        empty.className = slot === slice.length ? 'add-tile no-print' : 'empty-slot';
        if (slot === slice.length) {
          empty.innerHTML = `<span class="plus-circle" aria-hidden="true">＋</span><span>Agregar producto</span><small>Foto, nombre y código</small>`;
          empty.addEventListener('click', addProduct);
        } else empty.setAttribute('aria-hidden', 'true');
        grid.append(empty);
      }
      sheets.append(paper);
    }
    updateStatus();
  }
  function addProduct() {
    const product = { id: ++sequence, name: '', code: newCode(), photo: null };
    products.push(product);
    render();
    document.querySelector(`#product-${product.id} .name`).focus();
  }
  function setBusy(busy) {
    document.querySelector('.workspace').inert = busy;
    document.querySelector('.heading').inert = busy;
  }
  function restoreBackup({ products: records, layout: restoredLayout }) {
    products.forEach(product => { if (product.photo) URL.revokeObjectURL(product.photo); });
    products.length = 0;
    records.forEach(record => products.push({ ...record, id: ++sequence }));
    layout = restoredLayout;
    $('#grid-columns').value = layout.columns;
    $('#grid-rows').value = layout.rows;
    render();
    notify(`Respaldo cargado: ${products.length} productos.`);
  }
  $('#backup-save').addEventListener('click', async () => {
    setBusy(true);
    try {
      const blob = await SheetBackup.serialize(products, layout);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `en-hoja-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify('Respaldo preparado. Revisa las descargas de tu navegador.');
    } catch (error) { notify(error.message || 'No se pudo crear el respaldo.'); }
    finally { setBusy(false); }
  });
  $('#backup-load').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const records = await SheetBackup.parse(file);
      if (products.length) {
        pendingBackup = records;
        $('#restore-dialog').returnValue = '';
        $('#restore-dialog').showModal();
      } else restoreBackup(records);
    } catch (error) { notify(error.message || 'No se pudo cargar el respaldo.'); }
    finally { setBusy(false); }
  });
  $('#restore-dialog').addEventListener('close', () => {
    if ($('#restore-dialog').returnValue === 'restore' && pendingBackup) restoreBackup(pendingBackup);
    pendingBackup = null;
  });
  $('#add').addEventListener('click', addProduct);
  function changeLayout() {
    const columns = Number($('#grid-columns').value);
    const rows = Number($('#grid-rows').value);
    if (!Number.isInteger(columns) || columns < 3 || columns > 6 ||
        !Number.isInteger(rows) || rows < 4 || rows > 8) return;
    layout = { columns, rows };
    render();
  }
  $('#grid-columns').addEventListener('change', changeLayout);
  $('#grid-rows').addEventListener('change', changeLayout);
  $('#print').addEventListener('click', async () => {
    if (!products.length || products.some(product => validate(product))) return;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    window.print();
  });
  $('#clear').addEventListener('click', () => {
    $('#clear-dialog').returnValue = '';
    $('#clear-dialog').showModal();
  });
  $('#clear-dialog').addEventListener('close', () => {
    if ($('#clear-dialog').returnValue !== 'clear') return;
    products.forEach(product => { if (product.photo) URL.revokeObjectURL(product.photo); });
    products.length = 0;
    render();
    $('#add').focus();
    notify('La hoja está lista para empezar de nuevo.');
  });
  window.addEventListener('beforeunload', event => {
    if (products.length) { event.preventDefault(); event.returnValue = ''; }
  });
  render();
  if (!available) notify('No se cargó la biblioteca de códigos. Revisa tu conexión e intenta recargar.');
})();
