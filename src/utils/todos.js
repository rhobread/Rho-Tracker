const { isValidDate } = require('./trackers');

function isRecord(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.prototype.toString.call(value) === '[object Object]'
	);
}

function todoId(value) {
	if (typeof value !== 'string' || !value.trim()) throw new Error('To-do ID is required.');
	return value.trim();
}

function validateTodo(value) {
	if (!isRecord(value)) throw new Error('To-do must be an object.');
	const id = todoId(value.id);
	if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 160)
		throw new Error('Title must contain between 1 and 160 characters.');
	if (!isValidDate(value.date))
		throw new Error('Date must be a valid date in YYYY-MM-DD format (1900-9999).');
	if (
		value.completedAt !== null &&
		(typeof value.completedAt !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.completedAt) ||
			!Number.isFinite(Date.parse(value.completedAt)) ||
			new Date(value.completedAt).toISOString() !== value.completedAt)
	)
		throw new Error('Completion timestamp must be a valid UTC ISO timestamp.');
	return { id, title: value.title.trim(), date: value.date, completedAt: value.completedAt };
}

function createEmptyTodoData() {
	return { version: 1, items: [] };
}

function validateTodoData(value) {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.items))
		throw new Error('To-do data must contain version 1 and an items list.');
	const ids = new Set();
	const items = [];
	for (const item of value.items) {
		const todo = validateTodo(item);
		if (ids.has(todo.id)) throw new Error('To-do IDs must be unique.');
		ids.add(todo.id);
		items.push(todo);
	}
	return { version: 1, items };
}

function upsertTodo(data, value) {
	const next = validateTodoData(data);
	if (!isRecord(value)) throw new Error('To-do must be an object.');
	const id = todoId(value.id);
	const index = next.items.findIndex((item) => item.id === id);
	const todo = validateTodo({
		...value,
		id,
		// Only toggling changes completion; settings cannot import or erase history.
		completedAt: next.items[index]?.completedAt ?? null,
	});
	if (index === -1) next.items.push(todo);
	else next.items[index] = todo;
	return next;
}

function deleteTodo(data, id) {
	const next = validateTodoData(data);
	const normalizedId = todoId(id);
	if (!next.items.some((item) => item.id === normalizedId)) throw new Error('To-do not found.');
	next.items = next.items.filter((item) => item.id !== normalizedId);
	return next;
}

function toggleTodo(data, id, now = new Date()) {
	const next = validateTodoData(data);
	const normalizedId = todoId(id);
	const todo = next.items.find((item) => item.id === normalizedId);
	if (!todo) throw new Error('To-do not found.');
	if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
		throw new Error('Current time must be a valid Date.');
	const completedAt = now.toISOString();
	validateTodo({ ...todo, completedAt });
	todo.completedAt = todo.completedAt === null ? completedAt : null;
	return next;
}

module.exports = {
	createEmptyTodoData,
	validateTodo,
	validateTodoData,
	upsertTodo,
	deleteTodo,
	toggleTodo,
};
