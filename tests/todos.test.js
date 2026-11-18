const { test } = require('node:test');
const assert = require('node:assert/strict');
const todos = require('../src/utils/todos');

const TIME = '2026-11-18T03:04:05.678Z';
const todo = (overrides = {}) => ({
	id: 'task-1',
	title: 'Buy groceries',
	date: '2026-11-18',
	completedAt: null,
	...overrides,
});
const data = (items = [todo()]) => ({ version: 1, items });

test('empty datasets and normalized task records are detached from every input', () => {
	const empty = todos.createEmptyTodoData();
	empty.items.push(todo());
	assert.deepEqual(todos.createEmptyTodoData(), data([]));
	const input = data([todo({ id: ' task-1 ', title: '  Buy groceries  ', completedAt: TIME })]);
	const original = structuredClone(input);
	const normalized = todos.validateTodoData(input);
	assert.deepEqual(normalized, data([todo({ completedAt: TIME })]));
	normalized.items[0].title = 'Changed';
	normalized.items.push(todo({ id: 'task-2' }));
	assert.deepEqual(input, original);
	assert.notEqual(todos.validateTodo(input.items[0]), input.items[0]);
});

test('task validation rejects malformed records, titles, IDs and completion timestamps', () => {
	for (const value of [null, [], {}, true, new Date(), 'task'])
		assert.throws(() => todos.validateTodo(value));
	for (const id of [undefined, null, '', ' \t ', 1, {}])
		assert.throws(() => todos.validateTodo(todo({ id })), /ID/);
	for (const title of [undefined, null, '', ' \n ', 1, 'x'.repeat(161)])
		assert.throws(() => todos.validateTodo(todo({ title })), /Title/);
	assert.equal(todos.validateTodo(todo({ title: ` ${'x'.repeat(160)} ` })).title.length, 160);
	for (const completedAt of [
		undefined,
		true,
		0,
		new Date(TIME),
		'invalid',
		'2026-11-18',
		'2026-11-18T03:04:05Z',
		'2026-11-18T03:04:05.67Z',
		'2026-11-18T03:04:05.678+00:00',
		'2026-02-29T03:04:05.678Z',
		'2026-04-31T03:04:05.678Z',
		'2026-11-18T24:00:00.000Z',
		'2026-11-18T03:60:05.678Z',
	])
		assert.throws(() => todos.validateTodo(todo({ completedAt })), /timestamp/);
	assert.equal(todos.validateTodo(todo({ completedAt: TIME })).completedAt, TIME);
});

test('calendar dates use the supported 1900-9999 bounds and Gregorian leap rules', () => {
	for (const date of ['1900-01-01', '2000-02-29', '2024-02-29', '9999-12-31'])
		assert.equal(todos.validateTodo(todo({ date })).date, date);
	for (const date of [
		'1899-12-31',
		'10000-01-01',
		'1900-02-29',
		'2100-02-29',
		'2026-02-29',
		'2026-04-31',
		'2026-00-01',
		'2026-13-01',
		'2026-11-00',
		'2026-1-01',
		'2026-11-18T00:00:00.000Z',
		null,
		undefined,
	])
		assert.throws(() => todos.validateTodo(todo({ date })), /Date/);
});

test('dataset validation rejects malformed versions, sparse lists and normalized duplicate IDs', () => {
	for (const value of [
		null,
		[],
		{},
		{ version: 2, items: [] },
		{ version: 1, items: {} },
		data([null]),
		data(new Array(1)),
		data([todo(), todo({ id: ' task-1 ' })]),
	])
		assert.throws(() => todos.validateTodoData(value));
	assert.deepEqual(todos.validateTodoData(data([])), data([]));
});

test('upsert requires editor IDs, creates incomplete tasks and preserves completion during settings edits', () => {
	const empty = todos.createEmptyTodoData();
	for (const id of [undefined, null, '', ' '])
		assert.throws(() => todos.upsertTodo(empty, todo({ id })), /ID/);
	assert.throws(() => todos.upsertTodo(empty, null));
	const editor = todo({ id: ' task-1 ', completedAt: 'ignored even when malformed' });
	const inserted = todos.upsertTodo(empty, editor);
	assert.deepEqual(inserted, data());
	assert.deepEqual(empty, data([]));
	assert.equal(editor.completedAt, 'ignored even when malformed');
	const complete = todos.toggleTodo(inserted, 'task-1', new Date(TIME));
	const edited = todos.upsertTodo(complete, {
		id: ' task-1 ',
		title: '  Buy fruit  ',
		date: '9999-12-31',
		completedAt: null,
	});
	assert.deepEqual(
		edited,
		data([todo({ title: 'Buy fruit', date: '9999-12-31', completedAt: TIME })]),
	);
	assert.deepEqual(complete, data([todo({ completedAt: TIME })]));
	const added = todos.upsertTodo(edited, todo({ id: 'task-2', date: '1900-01-01' }));
	assert.equal(added.items.length, 2);
	added.items[0].title = 'Detached';
	assert.equal(edited.items[0].title, 'Buy fruit');
});

test('completion toggles record the actual instant without restricting task dates or completion dates', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: new Date(TIME) });
	for (const date of ['1900-01-01', '9999-12-31']) {
		const initial = data([todo({ date })]);
		const complete = todos.toggleTodo(initial, ' task-1 ');
		assert.equal(complete.items[0].completedAt, TIME);
		assert.deepEqual(initial, data([todo({ date })]));
		const undone = todos.toggleTodo(complete, 'task-1', new Date('1900-01-01T00:00:00.000Z'));
		assert.deepEqual(undone, initial);
		assert.equal(complete.items[0].completedAt, TIME);
		assert.equal(
			todos.toggleTodo(undone, 'task-1', new Date('9999-12-31T23:59:59.999Z')).items[0]
				.completedAt,
			'9999-12-31T23:59:59.999Z',
		);
	}
	for (const now of [null, TIME, 0, new Date(NaN), new Date('+010000-01-01T00:00:00.000Z')])
		assert.throws(() => todos.toggleTodo(data(), 'task-1', now));
});

test('delete and toggle reject missing IDs and preserve detached surviving tasks', () => {
	const initial = data([todo(), todo({ id: 'task-2', completedAt: TIME })]);
	const original = structuredClone(initial);
	for (const id of [undefined, null, '', ' ', 'missing']) {
		assert.throws(() => todos.deleteTodo(initial, id));
		assert.throws(() => todos.toggleTodo(initial, id));
	}
	const deleted = todos.deleteTodo(initial, ' task-1 ');
	assert.deepEqual(deleted, data([todo({ id: 'task-2', completedAt: TIME })]));
	deleted.items[0].title = 'Changed';
	assert.deepEqual(initial, original);
	const toggled = todos.toggleTodo(initial, 'task-1', new Date(TIME));
	toggled.items[1].title = 'Changed';
	assert.deepEqual(initial, original);
	for (const action of [todos.upsertTodo, todos.deleteTodo, todos.toggleTodo])
		assert.throws(() => action({ ...initial, version: 2 }, todo()));
});
