const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { transformFileSync } = require('@babel/core');
const trackers = require('../src/utils/trackers');

const code = transformFileSync(require.resolve('../src/components/DatePicker.js'), {
	babelrc: false,
	configFile: false,
	plugins: [
		['@babel/plugin-transform-react-jsx', { pragma: 'element' }],
		'@babel/plugin-transform-modules-commonjs',
	],
}).code;

// Like trackerUi.test.js, exercise handlers with stateful React and plain native elements.
function picker(value = '2026-11-18', options = {}) {
	const states = [];
	let stateIndex;
	const calls = [];
	const props = { value, onChange: (date) => calls.push(date), ...options.props };
	const exports = {};
	vm.runInNewContext(code, {
		exports,
		Date: options.Date || Date,
		element: (type, props, ...children) => ({ type, props: { ...props, children } }),
		require: (name) => {
			if (name === 'react')
				return {
					useState(initial) {
						const index = stateIndex++;
						if (!(index in states)) states[index] = initial;
						return [
							states[index],
							(value) => {
								states[index] =
									typeof value === 'function' ? value(states[index]) : value;
							},
						];
					},
				};
			if (name === 'react-native')
				return {
					Pressable: 'Pressable',
					Text: 'Text',
					View: 'View',
					StyleSheet: { create: (value) => value },
				};
			if (name === '../theme') return { colors: { green: 'green', paper: 'paper' } };
			if (name === '../utils/trackers')
				return { ...trackers, todayDate: () => options.today || '2026-11-18' };
			throw new Error(`Unexpected import: ${name}`);
		},
	});
	return {
		props,
		calls,
		render() {
			stateIndex = 0;
			return exports.DatePicker(props);
		},
	};
}

function nodes(tree) {
	if (Array.isArray(tree)) return tree.flatMap(nodes);
	if (!tree || typeof tree !== 'object') return [];
	return [tree, ...nodes(tree.props?.children)];
}

function text(tree) {
	if (Array.isArray(tree)) return tree.map(text).join(' ');
	if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
	return tree ? text(tree.props?.children) : '';
}

function button(ui, label) {
	const node = nodes(ui.render()).find((node) => node.props.accessibilityLabel === label);
	assert.ok(node, `Missing button: ${label}`);
	assert.equal(node.props.accessibilityRole, 'button');
	return node;
}

function control(ui) {
	return button(ui, `${ui.props.label || 'Date'}: ${ui.props.value}`);
}

function open(ui) {
	control(ui).props.onPress();
}

function days(ui) {
	return nodes(ui.render()).filter((node) =>
		node.props.accessibilityLabel?.startsWith('Select '),
	);
}

function heading(ui) {
	return text(nodes(ui.render()).find((node) => node.props.accessibilityRole === 'header'));
}

test('date picker opens inline, browses without changing value, selects and closes', () => {
	const ui = picker('2026-11-18', { props: { label: 'Due date' } });
	assert.match(text(ui.render()), /18 November 2026/);
	assert.match(text(ui.render()), /2026-11-18/);
	assert.equal(control(ui).props.accessibilityState.expanded, false);
	assert.equal(days(ui).length, 0);
	open(ui);
	assert.equal(control(ui).props.accessibilityState.expanded, true);
	assert.equal(heading(ui), 'November 2026');
	const selected = button(ui, 'Select 2026-11-18');
	assert.equal(selected.props.accessibilityState.selected, true);
	assert.ok(selected.props.style.some((style) => style?.backgroundColor === 'green'));
	assert.equal(button(ui, 'Select 2026-11-19').props.accessibilityState.selected, false);
	button(ui, 'Next month').props.onPress();
	assert.equal(heading(ui), 'Desember 2026');
	button(ui, 'Next month').props.onPress();
	assert.equal(heading(ui), 'Januari 2027');
	button(ui, 'Previous month').props.onPress();
	assert.equal(heading(ui), 'Desember 2026');
	assert.equal(ui.props.value, '2026-11-18');
	assert.deepEqual(ui.calls, []);
	button(ui, 'Select 2026-12-31').props.onPress();
	assert.deepEqual(ui.calls, ['2026-12-31']);
	assert.ok(trackers.isValidDate(ui.calls[0]));
	assert.equal(days(ui).length, 0);
	assert.equal(control(ui).props.accessibilityState.expanded, false);
	ui.props.value = ui.calls[0];
	assert.match(text(ui.render()), /31 Desember 2026/);
});

test('reopening resets the browsed month to the current controlled selection', () => {
	const ui = picker();
	open(ui);
	button(ui, 'Previous month').props.onPress();
	assert.equal(heading(ui), 'Oktober 2026');
	control(ui).props.onPress();
	open(ui);
	assert.equal(heading(ui), 'November 2026');
	button(ui, 'Next month').props.onPress();
	button(ui, 'Select 2026-12-05').props.onPress();
	// The parent is the source of truth, even if it has not accepted a selection.
	open(ui);
	assert.equal(heading(ui), 'November 2026');
	control(ui).props.onPress();
	ui.props.value = '2032-02-29';
	open(ui);
	assert.equal(heading(ui), 'Februari 2032');
	assert.equal(button(ui, 'Select 2032-02-29').props.accessibilityState.selected, true);
});

test('calendar uses Monday-Sunday columns, padding, complete months and leap-year rules', () => {
	for (const [value, count, offset] of [
		['1900-02-01', 28, 3],
		['2000-02-29', 29, 1],
		['2024-02-01', 29, 3],
		['2100-02-01', 28, 0],
		['2026-03-01', 31, 6],
	]) {
		const ui = picker(value);
		open(ui);
		const tree = ui.render();
		const weekdayRow = nodes(tree).find(
			(node) => node.type === 'View' && text(node) === 'Mon Tue Wed Thu Fri Sat Sun',
		);
		assert.ok(weekdayRow);
		const dayRows = nodes(tree).filter(
			(node) =>
				node.type === 'View' &&
				node.props.children[0]?.some?.((child) =>
					child.props.accessibilityLabel?.startsWith('Select '),
				),
		);
		assert.equal(dayRows.length, Math.ceil((count + offset) / 7));
		for (const row of dayRows) assert.equal(row.props.children[0].length, 7);
		const firstWeek = dayRows[0].props.children[0];
		assert.equal(
			firstWeek.findIndex((node) => node.type === 'Pressable'),
			offset,
		);
		assert.equal(days(ui).length, count);
		assert.deepEqual(
			days(ui).map((node) => node.props.accessibilityLabel),
			Array.from(
				{ length: count },
				(_, day) => `Select ${value.slice(0, 7)}-${String(day + 1).padStart(2, '0')}`,
			),
		);
		assert.ok(
			days(ui).every((node) => trackers.isValidDate(node.props.accessibilityLabel.slice(7))),
		);
	}
	const leap = picker('2000-02-01');
	open(leap);
	button(leap, 'Select 2000-02-29').props.onPress();
	assert.deepEqual(leap.calls, ['2000-02-29']);
});

test('month navigation stops at January 1900 and December 9999, including repeated presses', () => {
	for (const [value, blocked, allowed, expected] of [
		['1900-01-01', 'Previous month', 'Next month', 'Februari 1900'],
		['9999-12-31', 'Next month', 'Previous month', 'November 9999'],
	]) {
		const ui = picker(value);
		open(ui);
		const original = heading(ui);
		const edge = button(ui, blocked);
		assert.equal(edge.props.disabled, true);
		assert.equal(edge.props.accessibilityState.disabled, true);
		edge.props.onPress();
		edge.props.onPress();
		assert.equal(heading(ui), original);
		assert.equal(button(ui, allowed).props.disabled, false);
		button(ui, allowed).props.onPress();
		assert.equal(heading(ui), expected);
		const back = button(ui, blocked);
		back.props.onPress();
		back.props.onPress();
		assert.equal(heading(ui), original);
		assert.ok(
			days(ui).every((node) => trackers.isValidDate(node.props.accessibilityLabel.slice(7))),
		);
		assert.deepEqual(ui.calls, []);
		button(ui, `Select ${value}`).props.onPress();
		assert.deepEqual(ui.calls, [value]);
	}
});

test('disabled picker cannot open and disabling an open calendar blocks every action', () => {
	const ui = picker('2026-11-18', { props: { disabled: true } });
	assert.equal(control(ui).props.disabled, true);
	assert.equal(control(ui).props.accessibilityState.disabled, true);
	open(ui);
	assert.equal(days(ui).length, 0);
	ui.props.disabled = false;
	open(ui);
	ui.props.disabled = true;
	const original = heading(ui);
	for (const node of nodes(ui.render()).filter((node) => node.type === 'Pressable')) {
		assert.equal(node.props.disabled, true);
		assert.equal(node.props.accessibilityState.disabled, true);
		node.props.onPress();
	}
	assert.equal(heading(ui), original);
	assert.equal(control(ui).props.accessibilityState.expanded, true);
	assert.deepEqual(ui.calls, []);
	ui.props.disabled = false;
	button(ui, 'Next month').props.onPress();
	assert.equal(heading(ui), 'Desember 2026');
});

test('Today selects the local date from tracker utilities, including past and future values', () => {
	for (const value of ['1900-01-01', '9999-12-31']) {
		const ui = picker(value, { today: '2026-11-18' });
		open(ui);
		button(ui, 'Today: 2026-11-18').props.onPress();
		assert.deepEqual(ui.calls, ['2026-11-18']);
		assert.equal(control(ui).props.accessibilityState.expanded, false);
	}
});

test('calendar arithmetic and labels never read local date fields, even across DST', () => {
	class CalendarDate extends Date {
		getDay() {
			throw new Error('Local weekday is not date-only arithmetic');
		}
		getDate() {
			throw new Error('Local day is not date-only arithmetic');
		}
		getMonth() {
			throw new Error('Local month is not date-only arithmetic');
		}
		getFullYear() {
			throw new Error('Local year is not date-only arithmetic');
		}
	}
	for (const value of ['2024-03-10', '2024-11-03', '2024-01-01', '2024-12-31']) {
		const ui = picker(value, { Date: CalendarDate });
		assert.match(text(ui.render()), new RegExp(trackers.formatDate(value)));
		open(ui);
		const labels = days(ui).map((node) => node.props.accessibilityLabel);
		assert.equal(labels[0], `Select ${value.slice(0, 7)}-01`);
		assert.equal(button(ui, `Select ${value}`).props.accessibilityState.selected, true);
		button(ui, `Select ${value}`).props.onPress();
		assert.deepEqual(ui.calls, [value]);
	}
});
