# Lesson format v1

Source of truth: `packages/shared-types/src/schema.ts`. Reducer: `packages/lesson-format/src/replay.ts`.

```ts
import { createLesson, parseLesson, replay } from '@edushare/lesson-format';

const lesson = createLesson({ id: crypto.randomUUID(), title: 'Fractions' });
const parsed = parseLesson(JSON.parse(json)); // { ok: true, lesson } | { ok: false, errors: string[] }
const boardAtTenSeconds = replay(lesson, 10_000);
```

Coordinates: PDF points (origin bottom-left, 1-based pages) for selections; 1920×1080 logical units
(origin top-left) for the board. Action types: `page.add`, `page.show`, `content.place`,
`stroke.write`, `board.clear`, `pace.set`.
