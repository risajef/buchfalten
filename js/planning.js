/** A leaf has one selected fold interval; detection remains available as provenance. */
export function planFolds(columns, policy = 'alternate') {
  if (!['alternate', 'reject'].includes(policy)) throw new Error('Unbekannte Farbstreifen-Regel.');
  let cursor = 0;
  let omittedSegmentCount = 0;
  const planned = columns.map(column => {
    const detectedSegments = Object.freeze(column.segments.map(segment => Object.freeze({ ...segment })));
    if (policy === 'reject' && detectedSegments.length > 1) {
      throw new Error('Mehrere Farbstreifen pro Blatt erkannt. Anderes Motiv oder abwechselnde Verteilung wählen.');
    }
    const selected = detectedSegments.length ? detectedSegments[cursor++ % detectedSegments.length] : null;
    omittedSegmentCount += Math.max(0, detectedSegments.length - 1);
    return Object.freeze({ ...column, detectedSegments, segments: Object.freeze(selected ? [selected] : []) });
  });
  return Object.freeze({ columns: Object.freeze(planned), omittedSegmentCount, policy });
}
