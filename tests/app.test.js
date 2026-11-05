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
  assert.equal(app.plans.at(-1).meta.text, 'original');
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
