const finance = require('./finance');
const habits = require('./habits');
const todos = require('./todos');

function validateAppData(value) {
	if (!value || ![1, 2, 3].includes(value.version))
		throw new Error('Unsupported tracker data version. Update the app before loading it.');
	if (value.version === 1 && value.habits !== undefined)
		throw new Error('Habit data requires tracker data version 2.');
	if (value.version < 3 && value.todos !== undefined)
		throw new Error('To-do data requires tracker data version 3.');
	const money = finance.validateFinanceData({ ...value, version: 1 });
	return {
		...money,
		version: 3,
		habits:
			value.version === 1
				? habits.createEmptyHabitData()
				: habits.validateHabitData(value.habits),
		todos:
			value.version < 3 ? todos.createEmptyTodoData() : todos.validateTodoData(value.todos),
	};
}

function changeFinance(data, action, ...args) {
	const current = validateAppData(data);
	const money = action({ ...current, version: 1 }, ...args);
	return validateAppData({ ...money, version: 3, habits: current.habits, todos: current.todos });
}

function changeHabits(data, action, ...args) {
	const current = validateAppData(data);
	return validateAppData({ ...current, habits: action(current.habits, ...args) });
}

function changeTodos(data, action, ...args) {
	const current = validateAppData(data);
	return validateAppData({ ...current, todos: action(current.todos, ...args) });
}

module.exports = { validateAppData, changeFinance, changeHabits, changeTodos };
