import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, deferred } from './app-harness.js';

async function imageApp(overrides) {
  const app = await createApp(overrides);
  app.fire('imageModeBtn', 'click');
  app.upload();
  return app;
}

test('older image completion cannot overwrite a newer analysis', async () => {
  const app = await imageApp();
  await app.submit();
  const oldImage = app.images.at(-1);
  app.element('heightInput').value = '300';
  await app.submit();
  app.images.at(-1).onload();
  oldImage.onload();
  assert.equal(app.plans.at(-1).meta.bookHeightMm, 300);
});

test('editing input invalidates analysis before its debounce expires', async () => {
  const app = await imageApp();
  await app.submit();
  const image = app.images.at(-1);
  app.element('heightInput').value = '300';
  app.fire('heightInput', 'input');
  image.onload();
  assert.equal(app.plans.length, 0);
});

test('analysis metadata belongs to the captured input snapshot', async () => {
  const app = await imageApp();
  app.element('textInput').value = 'original';
  await app.submit();
  app.element('textInput').value = 'edited without event';
  app.images.at(-1).onload();
  assert.equal(app.plans.at(-1).meta.text, '');
  assert.equal(app.plans.at(-1).meta.imageFileName, 'picture.png');
});

for (const action of ['clear', 'upload', 'mode', 'edit']) {
  test(`pending text render cannot undo ${action}`, async () => {
    const pending = deferred();
    const app = await createApp({ './js/textRenderer.js': {
      createTextArtworkUrl: () => pending.promise, clampNumber: n => n,
    } });
    app.element('textInput').value = 'old text';
    app.fire('textInput', 'input');
    await app.flushTimers();
    if (action === 'upload') app.upload();
    else if (action === 'mode') app.fire('imageModeBtn', 'click');
    else {
      app.element('textInput').value = action === 'clear' ? '' : 'new text';
      app.fire('textInput', 'input');
    }
    pending.resolve('blob:outdated-text');
    await app.settle();
    assert(app.revoked.includes('blob:outdated-text'));
    assert.notEqual(app.element('artworkPreview').src, 'blob:outdated-text');
    if (action === 'upload') assert.equal(app.element('svgInput').files[0].name, 'picture.png');
  });
}

test('image mode never falls back to text and both modes retain their source', async () => {
  const app = await createApp();
  app.element('textInput').value = 'Hello';
  app.fire('textInput', 'input');
  await app.flushTimers();
  await app.settle();
  const textUrl = app.element('artworkPreview').src;
  app.fire('imageModeBtn', 'click');
  await app.submit();
  assert.equal(app.images.length, 0);
  app.upload('selected.png');
  const imageUrl = app.element('artworkPreview').src;
  await app.submit();
  app.images.at(-1).onload();
  assert.equal(app.plans.at(-1).meta.imageFileName, 'selected.png');
  app.fire('textModeBtn', 'click');
  await app.flushTimers();
  await app.settle();
  await app.submit();
  app.images.at(-1).onload();
  assert.equal(app.plans.at(-1).meta.text, 'Hello');
  assert.equal(app.plans.at(-1).meta.imageFileName, null);
  app.fire('imageModeBtn', 'click');
  assert.equal(app.element('artworkPreview').src, imageUrl);
  assert(!app.revoked.includes(imageUrl));
  assert(app.revoked.includes(textUrl)); // replaced by the new text render, not the mode switch
});

test('input edits immediately revoke a previous PDF before the next analysis', async () => {
  const app = await imageApp();
  await app.submit();
  app.images.at(-1).onload();
  const href = app.element('pdfDownloadLink').href;
  assert.equal(app.element('plannerForm').dataset.status, 'ready');
  app.fire('heightInput', 'input');
  assert.equal(app.element('pdfDownloadLink').href, '#');
  assert(app.revoked.includes(href));
  assert(app.element('pdfDownloadLink').classList.contains('disabled-link'));
});

test('image failure and missing source cannot leave old instructions downloadable', async () => {
  const app = await imageApp();
  await app.submit();
  app.images.at(-1).onload();
  await app.submit();
  app.images.at(-1).onerror();
  assert.equal(app.element('pdfDownloadLink').href, '#');
  assert.equal(app.element('plannerForm').dataset.status, 'error');
  app.element('svgInput').files = [];
  app.fire('svgInput', 'change');
  await app.submit();
  assert.equal(app.element('pdfDownloadLink').href, '#');
});

test('serialization failure leaves export disabled', async () => {
  const app = await imageApp({ './js/pdf.js': {
    createPdfDocument: () => ({ output() { throw new Error('cannot serialize'); } }),
    buildPdfFileName: () => 'test.pdf',
  } });
  await app.submit();
  app.images.at(-1).onload();
  assert.equal(app.element('pdfDownloadLink').href, '#');
  assert.equal(app.element('plannerForm').dataset.status, 'error');
});

test('automatic submit cannot bypass physical input validation', async () => {
  const app = await imageApp();
  app.element('columnInput').value = '2.5';
  app.fire('columnInput', 'input');
  await app.flushTimers();
  assert.equal(app.images.length, 0);
  assert.equal(app.element('plannerForm').dataset.status, 'error');
});

test('one accepted result constructs exactly one PDF', async () => {
  const app = await imageApp();
  await app.submit();
  app.images.at(-1).onload();
  assert.equal(app.plans.length, 1);
  app.fire('pdfDownloadLink', 'click');
  assert.equal(app.plans.length, 1);
});
