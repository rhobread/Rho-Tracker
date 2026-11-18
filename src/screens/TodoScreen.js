import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	AppState,
	BackHandler,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DatePicker } from '../components/DatePicker';
import { TodoEditor } from '../components/TodoEditor';
import { todayDate } from '../utils/trackers';
import { colors } from '../theme';

export function TodoScreen({ session, onBack, onAccount, onEditingChange }) {
	const [date, setDate] = useState(todayDate());
	const [today, setToday] = useState(todayDate());
	const [mode, setMode] = useState('day');
	const [editor, setEditor] = useState(null);
	const [error, setError] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const confirmingRef = useRef(false);
	const busy = session.saving || session.loading || !!session.loadError || !!session.conflict;
	const navigationBlocked = session.saving || confirming || !!editor;
	const items = session.data?.todos?.items ?? [];
	const visible = items
		.filter((task) => mode === 'all' || task.date === date)
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				Number(!!a.completedAt) - Number(!!b.completedAt) ||
				a.title.localeCompare(b.title) ||
				a.id.localeCompare(b.id),
		);
	const completed = visible.filter((task) => task.completedAt !== null).length;

	useLayoutEffect(() => {
		onEditingChange?.(!!editor || confirming);
		return () => onEditingChange?.(false);
	}, [editor, confirming, onEditingChange]);

	useEffect(() => {
		const back = BackHandler.addEventListener('hardwareBackPress', () => {
			if (!session.saving && !editor && !confirmingRef.current) onBack();
			return true;
		});
		const foreground = AppState.addEventListener('change', (state) => {
			if (state === 'active') setToday(todayDate());
		});
		const timer = setInterval(() => setToday(todayDate()), 60000);
		return () => {
			back.remove();
			foreground.remove();
			clearInterval(timer);
		};
	}, [session.saving, editor, onBack]);

	async function run(action, ...args) {
		setError(null);
		try {
			if (await action(...args)) return true;
		} catch {
			// No state is committed on failure; keep storage details out of the UI.
		}
		setError(
			'Could not save the task. Your previous data is kept. Check sync status and try again.',
		);
		return false;
	}

	function confirmDelete(task) {
		if (busy || confirmingRef.current) return;
		confirmingRef.current = true;
		setConfirming(true);
		function dismiss() {
			confirmingRef.current = false;
			setConfirming(false);
		}
		Alert.alert(
			'Delete task?',
			`Remove "${task.title}" from ${task.date}?`,
			[
				{ text: 'Cancel', style: 'cancel', onPress: dismiss },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						dismiss();
						return run(session.deleteTodo, task.id);
					},
				},
			],
			{ cancelable: false },
		);
	}

	return (
		<SafeAreaView style={styles.safe}>
			<ScrollView contentContainerStyle={styles.content}>
				<Pressable
					accessibilityRole="button"
					disabled={navigationBlocked}
					onPress={onBack}
					style={styles.linkButton}
				>
					<Text style={styles.link}>{'< Rho Tracker'}</Text>
				</Pressable>
				<Text style={styles.eyebrow}>03 / A LITTLE LESS TO REMEMBER</Text>
				<Text style={styles.title}>To-Do List</Text>
				<Text style={styles.intro}>Give it a day. Take it one task at a time.</Text>
				<Text style={styles.storage}>
					{!session.account
						? 'Device only. Connect Google Drive and copy your data to back it up.'
						: session.syncError
							? 'Saved locally. Google Drive sync needs attention.'
							: session.dirty
								? 'Saved locally. Waiting to sync tasks with Google Drive.'
								: "Tasks are included in this account's Google Drive sync."}
				</Text>
				<Pressable
					accessibilityRole="button"
					disabled={navigationBlocked}
					onPress={onAccount}
					style={styles.linkButton}
				>
					<Text style={styles.link}>Google Drive / account status</Text>
				</Pressable>
				{session.loading ? (
					<ActivityIndicator color={colors.green} size="large" />
				) : session.loadError || !session.data || session.conflict ? (
					<View style={styles.card}>
						<Text accessibilityRole="alert" style={styles.error}>
							{session.loadError ||
								(session.conflict
									? 'Resolve the Google Drive conflict before editing tasks.'
									: 'Could not load your tasks. Stored data has not been changed.')}
						</Text>
						{!session.conflict && (
							<Pressable
								accessibilityRole="button"
								disabled={session.saving}
								onPress={session.reload}
								style={styles.primary}
							>
								<Text style={styles.primaryText}>Try again</Text>
							</Pressable>
						)}
					</View>
				) : (
					<>
						<View style={styles.tabs}>
							{[
								['day', 'Selected day'],
								['all', 'All tasks'],
							].map(([value, label]) => (
								<Pressable
									key={value}
									accessibilityRole="tab"
									accessibilityState={{ selected: mode === value }}
									onPress={() => setMode(value)}
									style={[styles.tab, mode === value && styles.selectedTab]}
								>
									<Text
										style={[
											styles.tabText,
											mode === value && styles.selectedTabText,
										]}
									>
										{label}
									</Text>
								</Pressable>
							))}
						</View>
						{mode === 'day' && (
							<View style={styles.dateCard}>
								<DatePicker
									label="Viewing date"
									value={date}
									onChange={setDate}
									disabled={busy}
								/>
								{date !== today && (
									<Pressable
										accessibilityRole="button"
										onPress={() => setDate(today)}
										style={styles.linkButton}
									>
										<Text style={styles.link}>Back to today</Text>
									</Pressable>
								)}
							</View>
						)}
						<View style={styles.listHeading}>
							<Text style={styles.count}>
								{completed} of {visible.length} completed
							</Text>
							<Pressable
								accessibilityRole="button"
								disabled={busy}
								onPress={() => {
									setError(null);
									setEditor({});
								}}
								style={[styles.primary, busy && styles.disabled]}
							>
								<Text style={styles.primaryText}>Add task</Text>
							</Pressable>
						</View>
						{error && (
							<Text accessibilityRole="alert" style={styles.error}>
								{error}
							</Text>
						)}
						{visible.length === 0 && (
							<View style={styles.card}>
								<Text style={styles.emptyTitle}>
									{mode === 'day'
										? 'A little room in your day.'
										: 'Start with one small task.'}
								</Text>
								<Text style={styles.body}>
									{mode === 'day'
										? 'No tasks for this date. Add one here, or choose another day.'
										: 'Add a task and choose the day you want to do it.'}
								</Text>
							</View>
						)}
						{visible.map((task) => (
							<View key={task.id} style={styles.card}>
								<Pressable
									accessibilityRole="checkbox"
									accessibilityLabel={`Complete ${task.title}`}
									accessibilityState={{
										checked: task.completedAt !== null,
										disabled: busy,
									}}
									disabled={busy}
									onPress={() => run(session.toggleTodo, task.id)}
									style={styles.taskRow}
								>
									<View
										style={[
											styles.checkbox,
											task.completedAt && styles.checked,
										]}
									>
										{task.completedAt && <View style={styles.checkmark} />}
									</View>
									<Text
										style={[
											styles.taskTitle,
											task.completedAt && styles.doneTitle,
										]}
									>
										{task.title}
									</Text>
								</Pressable>
								<Text
									style={[
										styles.taskDate,
										!task.completedAt && task.date < today && styles.overdue,
									]}
								>
									{task.date}
									{!task.completedAt && task.date < today ? ' / Overdue' : ''}
								</Text>
								{task.completedAt && (
									<Text style={styles.body}>
										Completed {new Date(task.completedAt).toLocaleString()}
									</Text>
								)}
								<View style={styles.actions}>
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={`Edit ${task.title}`}
										disabled={busy}
										onPress={() => {
											setError(null);
											setEditor(task);
										}}
										style={styles.linkButton}
									>
										<Text style={styles.link}>Edit</Text>
									</Pressable>
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={`Delete ${task.title}`}
										disabled={busy}
										onPress={() => confirmDelete(task)}
										style={styles.linkButton}
									>
										<Text style={styles.delete}>Delete</Text>
									</Pressable>
								</View>
							</View>
						))}
						<Text style={styles.note}>
							Tasks are one-off checklists. Dates do not create reminders,
							notifications, or payments.
						</Text>
					</>
				)}
			</ScrollView>
			{editor && (
				<TodoEditor
					todo={editor.id ? editor : null}
					initialDate={mode === 'day' ? date : today}
					saving={busy}
					onClose={() => setEditor(null)}
					onSave={(value) => run(session.saveTodo, value)}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: colors.background },
	content: { padding: 24, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
	linkButton: { minHeight: 44, justifyContent: 'center' },
	link: { color: colors.green, fontWeight: '600', fontSize: 14 },
	eyebrow: {
		color: '#47657B',
		fontSize: 10,
		fontWeight: '700',
		letterSpacing: 1.5,
		marginTop: 20,
	},
	title: { color: colors.ink, fontSize: 34, fontWeight: '700', letterSpacing: -1, marginTop: 10 },
	intro: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 },
	storage: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 16 },
	tabs: {
		flexDirection: 'row',
		backgroundColor: colors.paper,
		borderRadius: 16,
		padding: 5,
		marginVertical: 20,
	},
	tab: {
		flex: 1,
		minHeight: 44,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
	},
	selectedTab: { backgroundColor: colors.green },
	tabText: { color: colors.muted, fontWeight: '600' },
	selectedTabText: { color: colors.paper },
	dateCard: { marginBottom: 20 },
	listHeading: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 18,
	},
	count: { color: colors.muted, fontSize: 13 },
	primary: {
		backgroundColor: colors.green,
		borderRadius: 14,
		paddingHorizontal: 20,
		minHeight: 48,
		justifyContent: 'center',
		alignItems: 'center',
	},
	primaryText: { color: colors.paper, fontWeight: '700', fontSize: 14 },
	disabled: { opacity: 0.5 },
	card: {
		backgroundColor: colors.paper,
		borderColor: colors.line,
		borderWidth: 1,
		borderRadius: 22,
		padding: 20,
		marginBottom: 14,
	},
	taskRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 },
	taskTitle: { flex: 1, color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '600' },
	doneTitle: { color: colors.muted, textDecorationLine: 'line-through' },
	checkbox: {
		width: 26,
		height: 26,
		borderRadius: 7,
		borderWidth: 2,
		borderColor: colors.green,
		justifyContent: 'center',
		alignItems: 'center',
	},
	checked: { backgroundColor: colors.green },
	checkmark: {
		width: 7,
		height: 12,
		borderBottomWidth: 2,
		borderRightWidth: 2,
		borderColor: colors.paper,
		transform: [{ rotate: '45deg' }],
		marginBottom: 3,
	},
	taskDate: { color: colors.muted, fontSize: 12, marginTop: 8, marginBottom: 6 },
	overdue: { color: colors.danger },
	actions: { flexDirection: 'row', gap: 24, marginTop: 8 },
	delete: { color: colors.danger, fontWeight: '600', fontSize: 14 },
	emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '600', marginBottom: 10 },
	body: { color: colors.muted, fontSize: 13, lineHeight: 21 },
	error: { color: colors.danger, fontSize: 14, lineHeight: 22, marginBottom: 16 },
	note: { color: colors.muted, fontSize: 12, lineHeight: 20, marginVertical: 16 },
});
