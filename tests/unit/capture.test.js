const MealsCapture = require('../../core/capture');

describe('MealsCapture.makeCapture', () => {
    test('builds a raw capture, trimming text and defaulting fields', () => {
        const c = MealsCapture.makeCapture({ text: '  smoothie and a banana  ' });
        expect(c).toEqual({
            kind: 'capture',
            text: 'smoothie and a banana',
            at: null,
            source: 'unknown',
            processed_at: null
        });
    });

    test('keeps a provided timestamp and source verbatim', () => {
        const c = MealsCapture.makeCapture({
            text: 'upset stomach right now',
            at: '2026-06-27T14:03:00Z',
            source: 'shortcut'
        });
        expect(c.at).toBe('2026-06-27T14:03:00Z');
        expect(c.source).toBe('shortcut');
        expect(c.processed_at).toBeNull();
    });

    test('coerces a blank / non-string timestamp to null', () => {
        expect(MealsCapture.makeCapture({ text: 'x', at: '' }).at).toBeNull();
        expect(MealsCapture.makeCapture({ text: 'x', at: 123 }).at).toBeNull();
    });

    test('throws on blank or missing text', () => {
        expect(() => MealsCapture.makeCapture({ text: '   ' })).toThrow();
        expect(() => MealsCapture.makeCapture({})).toThrow();
        expect(() => MealsCapture.makeCapture(null)).toThrow();
    });
});

describe('MealsCapture.parseCaptures', () => {
    const rows = [
        { id: 'a', content: JSON.stringify({ kind: 'capture', text: 'first', at: '2026-06-25T10:00:00Z', source: 'web', processed_at: null }) },
        { id: 'b', content: JSON.stringify({ kind: 'capture', text: 'second', at: '2026-06-27T08:00:00Z', source: 'shortcut', processed_at: '2026-06-27T09:00:00Z' }) },
        { id: 'c', content: JSON.stringify({ kind: 'slot', date: '2026-06-27' }) },
        { id: 'd', content: 'not json' },
        { id: 'e', content: JSON.stringify({ kind: 'capture', text: 'no-time', source: 'cli' }) }
    ];

    test('keeps only capture rows, attaches the row id, newest-first by at (nulls last)', () => {
        const out = MealsCapture.parseCaptures(rows);
        expect(out.map((c) => c.id)).toEqual(['b', 'a', 'e']);
        expect(out[0].text).toBe('second');
        expect(out[2].at == null).toBe(true);
    });

    test('null / empty input → []', () => {
        expect(MealsCapture.parseCaptures(null)).toEqual([]);
        expect(MealsCapture.parseCaptures([])).toEqual([]);
    });
});

describe('MealsCapture.isProcessed', () => {
    test('reflects processed_at', () => {
        expect(MealsCapture.isProcessed({ processed_at: '2026-06-27T09:00:00Z' })).toBe(true);
        expect(MealsCapture.isProcessed({ processed_at: null })).toBe(false);
        expect(MealsCapture.isProcessed({})).toBe(false);
    });
});

describe('MealsCapture.markProcessed', () => {
    test('stamps processed_at + optional note without mutating the input or dropping fields', () => {
        const cap = { kind: 'capture', text: 'oatmeal', at: '2026-06-27T08:00:00Z', source: 'shortcut', processed_at: null };
        const out = MealsCapture.markProcessed(cap, { at: '2026-06-27T09:30:00Z', note: 'placed Oatmeal breakfast' });
        expect(out.processed_at).toBe('2026-06-27T09:30:00Z');
        expect(out.note).toBe('placed Oatmeal breakfast');
        expect(out.text).toBe('oatmeal');
        expect(out.kind).toBe('capture');
        // input untouched
        expect(cap.processed_at).toBeNull();
        expect(cap.note).toBeUndefined();
    });

    test('omits note when not provided', () => {
        const out = MealsCapture.markProcessed({ kind: 'capture', text: 'x', processed_at: null }, { at: '2026-06-27T09:30:00Z' });
        expect(out.processed_at).toBe('2026-06-27T09:30:00Z');
        expect('note' in out).toBe(false);
    });
});

describe('MealsCapture.makeSymptom', () => {
    test('builds a dated symptom row, coercing severity and defaulting optionals', () => {
        const s = MealsCapture.makeSymptom({ text: 'upset stomach', date: '2026-06-27', at: '2026-06-27T14:03:00Z', category: 'gi', severity: '3' });
        expect(s).toEqual({
            kind: 'symptom',
            text: 'upset stomach',
            date: '2026-06-27',
            at: '2026-06-27T14:03:00Z',
            category: 'gi',
            severity: 3
        });
    });

    test('severity non-number → null; category absent → null; at absent → null', () => {
        const s = MealsCapture.makeSymptom({ text: 'headache', date: '2026-06-27', severity: 'bad' });
        expect(s.severity).toBeNull();
        expect(s.category).toBeNull();
        expect(s.at).toBeNull();
    });

    test('throws on blank text or invalid date', () => {
        expect(() => MealsCapture.makeSymptom({ text: '', date: '2026-06-27' })).toThrow();
        expect(() => MealsCapture.makeSymptom({ text: 'x', date: 'nope' })).toThrow();
    });
});
