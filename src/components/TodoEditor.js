import { useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { TrackerField, TrackerForm } from './TrackerForm';
import { DatePicker } from './DatePicker';
import { validateTodo } from '../utils/todos';
import { todayDate } from '../utils/trackers';

export function TodoEditor({ todo, initialDate, saving, onClose, onSave }) {
	const [id] = useState(() => todo?.id ?? randomUUID());
	const [title, setTitle] = useState(todo?.title ?? '');
	const [date, setDate] = useState(todo?.date ?? initialDate ?? todayDate());

	return (
		<TrackerForm
			title={todo ? 'Edit task' : 'Add task'}
			saving={saving}
			onClose={onClose}
			onSave={async () => {
				const value = validateTodo({
					id,
					title,
					date,
					completedAt: todo?.completedAt ?? null,
				});
				if (!(await onSave(value)))
					throw new Error(
						'Could not save this task. Your previous data is kept. Try again.',
					);
				return true;
			}}
		>
			<TrackerField
				label="Task"
				placeholder="e.g. Pay the electricity bill"
				value={title}
				onChangeText={setTitle}
				maxLength={160}
				editable={!saving}
			/>
			<DatePicker label="Task date" value={date} onChange={setDate} disabled={saving} />
		</TrackerForm>
	);
}
