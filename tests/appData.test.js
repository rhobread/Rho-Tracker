const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { transformFileSync } = require('@babel/core');
const appData = require('../src/utils/appData');
const finance = require('../src/utils/finance');
const habits = require('../src/utils/habits');
const todos = require('../src/utils/todos');
const model = require('../src/services/cloudModel');

const KEY = '@rho-tracker/data';
const legacy = () => ({
	version: 1,
	wallet: {
		version: 3,
		currency: 'IDR',
		updatedAt: null,
		sources: [{ id: 'bank', name: 'Bank', amountMinor: 1000 }],
	},
	trackers: { version: 2, items: [] },
});
const habitData = () => ({
	version: 1,
	habits: [
		{
			id: 'workout',
			name: 'Workout',
			kind: 'good',
			days: [1, 2, 4, 5],
			startDate: '2024-01-01',
			completions: { '2024-03-12': '2024-03-12T12:34:56.789Z' },
		},
	],
});
const combined = () => appData.validateAppData({ ...legacy(), version: 2, habits: habitData() });
const plain = (value) => JSON.parse(JSON.stringify(value));

function storageHarness(stored = null) {
	const values = new Map(stored === null ? [] : [[KEY, stored]]);
	const reads = [];
	const writes = [];
	const native = {
		async getItem(key) {
			reads.push(key);
			return values.get(key) ?? null;
		},
		async setItem(key, value) {
			writes.push([key, value]);
			values.set(key, value);
		},
	};
	let money = legacy();
	let habit = habitData();
	const modules = {
		'@react-native-async-storage/async-storage': native,
		'../utils/appData': appData,
		'./moneyStorage': {
			async loadMoneyData() {
				reads.push('legacy-money');
				return money;
			},
		},
		'./habitStorage': {
			async loadHabitData() {
				reads.push('legacy-habits');
				return habit;
			},
		},
	};
	const exports = {};
	const { code } = transformFileSync(require.resolve('../src/storage/appStorage'), {
		babelrc: false,
		configFile: false,
		plugins: ['@babel/plugin-transform-modules-commonjs'],
	});
	vm.runInNewContext(code, {
		exports,
		require: (name) => {
			assert.ok(name in modules, `Unexpected dependency: ${name}`);
			return modules[name];
		},
	});
	return {
		api: exports,
		values,
		reads,
		writes,
		native,
		setLegacy(nextMoney, nextHabits) {
			money = nextMoney;
			habit = nextHabits;
		},
	};
}

test('legacy finance migrates to complete v3 data without replaying money or assigning device habits or tasks', () => {
	const old = legacy();
	const result = appData.validateAppData(old);
	assert.equal(result.version, 3);
	assert.deepEqual(result.wallet, old.wallet);
	assert.deepEqual(result.habits, habits.createEmptyHabitData());
	assert.deepEqual(result.todos, todos.createEmptyTodoData());
	assert.deepEqual(old, legacy());
	const snapshot = model.snapshot(
		{
			version: 1,
			accountId: 'A',
			revision: 'r1',
			parents: [],
			updatedAt: '2026-11-12T00:00:00.000Z',
			data: old,
		},
		'A',
	);
	assert.deepEqual(snapshot.data, result);
	assert.throws(() => finance.validateFinanceData(combined()), /version 1/);
});

test('new and unsupported versions fail closed instead of silently discarding habits', () => {
	for (const value of [
		{ ...legacy(), habits: habitData() },
		{ ...legacy(), version: 2 },
		{ ...combined(), habits: null },
		{ ...combined(), version: 4 },
		{ ...combined(), habits: { version: 99, habits: [] } },
	])
		assert.throws(() => appData.validateAppData(value));
	const normalized = appData.validateAppData(combined());
	normalized.habits.habits[0].name = 'Changed';
	assert.equal(combined().habits.habits[0].name, 'Workout');
});

test('domain transformations preserve the other domain and never mutate their input', () => {
	const original = combined();
	original.todos.items.push({ id: 'task', title: 'Task', date: '2026-11-18', completedAt: null });
	const before = structuredClone(original);
	let next = appData.changeFinance(original, finance.updateMoneySources, [
		{ id: 'bank', name: 'Renamed bank', amountMinor: 1200 },
	]);
	assert.deepEqual(next.habits, original.habits);
	assert.deepEqual(next.todos, original.todos);
	next = appData.changeHabits(
		next,
		habits.toggleHabitDate,
		'workout',
		'2024-03-12',
		new Date('2024-03-12T12:35:00.000Z'),
	);
	assert.deepEqual(next.habits.habits[0].completions, {});
	assert.equal(next.wallet.sources[0].amountMinor, 1200);
	assert.deepEqual(next.todos, original.todos);
	const previous = structuredClone(next);
	next = appData.changeTodos(
		next,
		todos.toggleTodo,
		'task',
		new Date('2026-11-18T12:00:00.000Z'),
	);
	assert.deepEqual(next.wallet, previous.wallet);
	assert.deepEqual(next.trackers, previous.trackers);
	assert.deepEqual(next.habits, previous.habits);
	assert.equal(next.todos.items[0].completedAt, '2026-11-18T12:00:00.000Z');
	next.habits.habits[0].completions.changed = 'not shared';
	assert.deepEqual(original, before);
});

test('v2 money and habits migrate to v3 with empty tasks while mislabeled task payloads fail closed', () => {
	const old = { ...legacy(), version: 2, habits: habitData() };
	const original = structuredClone(old);
	assert.deepEqual(appData.validateAppData(old), combined());
	assert.deepEqual(old, original);
	for (const version of [1, 2]) {
		const value = version === 1 ? legacy() : old;
		for (const taskData of [
			null,
			todos.createEmptyTodoData(),
			{ version: 1, items: [{ bad: true }] },
		])
			assert.throws(
				() => appData.validateAppData({ ...value, todos: taskData }),
				/version 3/,
			);
	}
	for (const taskData of [
		undefined,
		null,
		{ version: 2, items: [] },
		{ version: 1, items: [null] },
	])
		assert.throws(() => appData.validateAppData({ ...combined(), todos: taskData }));
});

test('stored v1 and v2 aggregates load as v3 without writes, then persist only v3 on the same key', async () => {
	for (const old of [legacy(), { ...legacy(), version: 2, habits: habitData() }]) {
		const raw = JSON.stringify(old);
		const h = storageHarness(raw);
		const loaded = await h.api.loadAppData();
		assert.deepEqual(plain(loaded), appData.validateAppData(old));
		assert.equal(loaded.version, 3);
		assert.deepEqual(plain(loaded.todos), todos.createEmptyTodoData());
		assert.deepEqual(h.reads, [KEY]);
		assert.equal(h.writes.length, 0);
		assert.equal(h.values.get(KEY), raw);
		await h.api.saveAppData(old);
		assert.equal(h.writes.length, 1);
		assert.equal(h.writes[0][0], KEY);
		assert.deepEqual(JSON.parse(h.values.get(KEY)), appData.validateAppData(old));
	}
});

test('device migration combines legacy money and habits in memory, then saves one authoritative record', async () => {
	const h = storageHarness();
	const next = await h.api.loadAppData();
	assert.deepEqual(plain(next), combined());
	assert.deepEqual(h.reads, [KEY, 'legacy-money', 'legacy-habits']);
	assert.equal(h.writes.length, 0);
	await h.api.saveAppData(next);
	assert.equal(h.writes.length, 1);
	assert.equal(h.writes[0][0], KEY);
	h.setLegacy(null, null);
	h.reads.length = 0;
	assert.deepEqual(plain(await h.api.loadAppData()), combined());
	assert.deepEqual(h.reads, [KEY]);
});

test('malformed aggregate never falls back to legacy data or overwrites it', async () => {
	for (const raw of [
		'{broken',
		'null',
		'{}',
		JSON.stringify({ ...combined(), habits: null }),
		JSON.stringify({ ...combined(), todos: null }),
		JSON.stringify({ ...combined(), version: 2 }),
	]) {
		const h = storageHarness(raw);
		await assert.rejects(h.api.loadAppData());
		assert.deepEqual(h.reads, [KEY]);
		assert.equal(h.writes.length, 0);
		assert.equal(h.values.get(KEY), raw);
	}
	const h = storageHarness();
	h.setLegacy(legacy(), { version: 1, habits: [{ bad: true }] });
	await assert.rejects(h.api.loadAppData());
	assert.equal(h.writes.length, 0);
});

test('validation and storage failures cannot partially save the complete dataset', async () => {
	const raw = JSON.stringify(combined());
	const h = storageHarness(raw);
	await assert.rejects(h.api.saveAppData({ ...combined(), habits: null }));
	await assert.rejects(h.api.saveAppData({ ...combined(), todos: null }));
	assert.equal(h.writes.length, 0);
	h.native.setItem = async (key, value) => {
		assert.equal(key, KEY);
		assert.deepEqual(JSON.parse(value), combined());
		throw new Error('Storage full');
	};
	await assert.rejects(h.api.saveAppData(combined()), /Storage full/);
	assert.equal(h.values.get(KEY), raw);
});
