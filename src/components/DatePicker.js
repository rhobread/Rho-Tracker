import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { formatDate, isValidDate, todayDate } from '../utils/trackers';

const FIRST_MONTH = 1900 * 12;
const LAST_MONTH = 9999 * 12 + 11;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DatePicker({ value, onChange, disabled = false, label = 'Date' }) {
	const selectedMonth = Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
	const [open, setOpen] = useState(false);
	const [month, setMonth] = useState(selectedMonth);
	const year = Math.floor(month / 12);
	const monthIndex = month % 12;
	const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
	// UTC is calendar arithmetic only; a date-only value is never a local instant.
	const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
	const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
	const weeks = Array.from({ length: Math.ceil((offset + days) / 7) }, (_, week) =>
		Array.from({ length: 7 }, (_, weekday) => {
			const day = week * 7 + weekday - offset + 1;
			return day > 0 && day <= days ? day : null;
		}),
	);
	const today = todayDate();
	const previousDisabled = disabled || month === FIRST_MONTH;
	const nextDisabled = disabled || month === LAST_MONTH;

	function navigate(direction) {
		if (disabled) return;
		setMonth((current) => Math.max(FIRST_MONTH, Math.min(LAST_MONTH, current + direction)));
	}

	function select(date) {
		if (disabled || !isValidDate(date)) return;
		setOpen(false);
		onChange(date);
	}

	return (
		<View style={styles.field}>
			<Text style={styles.label}>{label}</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${value}`}
				accessibilityState={{ expanded: open, disabled }}
				disabled={disabled}
				onPress={() => {
					if (disabled) return;
					if (!open) setMonth(selectedMonth);
					setOpen(!open);
				}}
				style={[styles.control, disabled && styles.disabled]}
			>
				<View style={styles.selectedDate}>
					<Text style={styles.value}>{formatDate(value)}</Text>
					<Text style={styles.hint}>{value}</Text>
				</View>
				<Text style={styles.link}>{open ? 'Close' : 'Change'}</Text>
			</Pressable>
			{open && (
				<View style={[styles.calendar, disabled && styles.disabled]}>
					<View style={styles.header}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Previous month"
							accessibilityState={{ disabled: previousDisabled }}
							disabled={previousDisabled}
							onPress={() => navigate(-1)}
							style={[styles.navigation, previousDisabled && styles.disabled]}
						>
							<Text style={styles.link}>{'<'}</Text>
						</Pressable>
						<Text
							accessibilityRole="header"
							accessibilityLiveRegion="polite"
							style={styles.month}
						>
							{formatDate(`${prefix}-01`).replace(/^1 /, '')}
						</Text>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Next month"
							accessibilityState={{ disabled: nextDisabled }}
							disabled={nextDisabled}
							onPress={() => navigate(1)}
							style={[styles.navigation, nextDisabled && styles.disabled]}
						>
							<Text style={styles.link}>{'>'}</Text>
						</Pressable>
					</View>
					<View style={styles.row}>
						{WEEKDAYS.map((day) => (
							<Text key={day} style={styles.weekday}>
								{day}
							</Text>
						))}
					</View>
					{weeks.map((week, index) => (
						<View key={index} style={styles.row}>
							{week.map((day, weekday) => {
								if (day === null) return <View key={weekday} style={styles.day} />;
								const date = `${prefix}-${String(day).padStart(2, '0')}`;
								const selected = date === value;
								return (
									<Pressable
										key={weekday}
										accessibilityRole="button"
										accessibilityLabel={`Select ${date}`}
										accessibilityState={{ selected, disabled }}
										disabled={disabled}
										onPress={() => select(date)}
										style={[styles.day, selected && styles.selected]}
									>
										<Text
											style={[
												styles.dayText,
												selected && styles.selectedText,
											]}
										>
											{day}
										</Text>
									</Pressable>
								);
							})}
						</View>
					))}
					{isValidDate(today) && (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Today: ${today}`}
							accessibilityState={{ disabled }}
							disabled={disabled}
							onPress={() => select(today)}
							style={styles.today}
						>
							<Text style={styles.link}>Today</Text>
						</Pressable>
					)}
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	field: { marginBottom: 24 },
	label: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 12 },
	control: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		minHeight: 64,
		padding: 16,
		backgroundColor: colors.paper,
		borderWidth: 1,
		borderColor: colors.line,
		borderRadius: 14,
	},
	selectedDate: { flex: 1 },
	value: { color: colors.ink, fontSize: 18, fontWeight: '600' },
	hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
	link: { color: colors.green, fontSize: 14, fontWeight: '600' },
	calendar: {
		marginTop: 8,
		padding: 8,
		backgroundColor: colors.paper,
		borderWidth: 1,
		borderColor: colors.line,
		borderRadius: 14,
	},
	header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
	navigation: {
		minWidth: 48,
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.background,
		borderRadius: 12,
	},
	month: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
	row: { flexDirection: 'row' },
	weekday: {
		flex: 1,
		color: colors.muted,
		fontSize: 12,
		textAlign: 'center',
		paddingVertical: 8,
	},
	day: {
		flex: 1,
		minWidth: 0,
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
	},
	dayText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
	selected: { backgroundColor: colors.green },
	selectedText: { color: colors.paper },
	today: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
	disabled: { opacity: 0.5 },
});
