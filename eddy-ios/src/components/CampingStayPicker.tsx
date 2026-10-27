import { useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import { sheetControl } from '@/theme/palette';
import { calendarDayColors } from '@/theme/calendar';
import { calendarDays } from '@/lib/campingCalendar';
import { dateLabel } from '@/lib/campingHeatmap';
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  stayNights,
  nextCampingDate,
  campingPickerDates,
  type CampingStay,
} from '@/lib/campingStay';

export function CampingStayPicker({
  stay,
  nights,
  onChange,
}: {
  stay: CampingStay;
  nights: string[];
  onChange: (stay: CampingStay) => void;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const screenReader = useScreenReaderEnabled();
  const reducedMotion = useReducedMotion();
  const [contentWidth, setContentWidth] = useState(width - 40);
  // Seven 44 pt columns must fit inside the sheet's 20 pt side insets.
  const listDates = screenReader || fontScale >= 1.3 || contentWidth / 7 < 44;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(stay);
  const [choosing, setChoosing] = useState<'arrival' | 'departure'>('arrival');
  const [month, setMonth] = useState(stay.arrival.slice(0, 7));
  const last = nights.length
    ? nextCampingDate(nights[nights.length - 1])
    : stay.departure;
  const months = [...new Set([...nights, last].map((d) => d.slice(0, 7)))];
  const index = months.indexOf(month);
  const choices = campingPickerDates(nights, choosing, draft.arrival);
  const validDraft = nights.includes(draft.arrival) && campingPickerDates(nights, 'departure', draft.arrival).includes(draft.departure);
  function chooseDate(date: string) {
    if (!choices.includes(date)) return;
    if (choosing === 'arrival') {
      setDraft({ arrival: date, departure: nextCampingDate(date) });
      setMonth(nextCampingDate(date).slice(0, 7));
      setChoosing('departure');
      if (screenReader) AccessibilityInfo.announceForAccessibility(`Arrival ${dateLabel(date)}. Choose departure.`);
    } else setDraft({ ...draft, departure: date });
  }
  const button = {
    minHeight: 48,
    minWidth: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change stay dates. Arrive ${dateLabel(stay.arrival)}, depart ${dateLabel(stay.departure)}`}
        onPress={() => {
          setDraft(stay);
          setMonth(stay.arrival.slice(0, 7));
          setChoosing('arrival');
          setOpen(true);
        }}
        style={{
          ...button,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.card,
        }}
      >
        <Text style={[textStyles.body, { color: colors.text }]}>
          {dateLabel(stay.arrival)} – {dateLabel(stay.departure)}{' '}
          <Text style={{ color: colors.interactive }}>⌄</Text>
        </Text>
      </Pressable>
      {stayNights(stay).length > 14 ? (
        <Text style={{ color: colors.textMuted }}>
          Check campground stay limits.
        </Text>
      ) : null}
      <Modal
        visible={open}
        animationType={reducedMotion ? 'none' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.sheetGrouped }} onAccessibilityEscape={() => setOpen(false)}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} onLayout={(event) => setContentWidth(event.nativeEvent.layout.width - 40)}>
            <Text style={[textStyles.sectionTitle, { color: colors.text }]}>
              Stay dates
            </Text>
            <View
              style={{ flexDirection: listDates ? 'column' : 'row', flexWrap: 'wrap', gap: 8 }}
            >
              {(['arrival', 'departure'] as const).map((field) => (
                <Pressable
                  key={field}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choosing === field }}
                  style={[button, { borderBottomWidth: 2, borderBottomColor: choosing === field ? colors.interactive : 'transparent' }]}
                  accessibilityLabel={`${field === 'arrival' ? 'Arrival' : 'Departure'}, ${dateLabel(draft[field])}`}
                  onPress={() => {
                    setChoosing(field);
                    setMonth(draft[field].slice(0, 7));
                  }}
                >
                  <Text
                    style={{
                      color:
                        choosing === field ? colors.interactive : colors.text,
                    }}
                  >
                    {field === 'arrival' ? 'Arrive' : 'Depart'} ·{' '}
                    {dateLabel(draft[field])}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Pressable
                style={button}
                disabled={index <= 0}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                accessibilityState={{ disabled: index <= 0 }}
                onPress={() => setMonth(months[index - 1])}
              >
                <Text
                  style={{
                    color: index <= 0 ? colors.textSubtle : colors.interactive,
                  }}
                >
                  ‹
                </Text>
              </Pressable>
              <Text accessibilityRole="header" style={[textStyles.body, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                {new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </Text>
              <Pressable
                style={button}
                disabled={index >= months.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                accessibilityState={{ disabled: index >= months.length - 1 }}
                onPress={() => setMonth(months[index + 1])}
              >
                <Text
                  style={{
                    color:
                      index >= months.length - 1
                        ? colors.textSubtle
                        : colors.interactive,
                  }}
                >
                  ›
                </Text>
              </Pressable>
            </View>
            {listDates ? <View>
              <Text style={[textStyles.body, { color: colors.text, paddingBottom: 8 }]} accessibilityRole="header">
                {choosing === 'arrival' ? 'Choose arrival' : 'Choose departure'}
              </Text>
              {choices.filter((date) => date.startsWith(month)).map((date) => <Pressable key={date}
                accessibilityRole="button" accessibilityState={{ selected: draft[choosing] === date }}
                style={[button, { borderBottomWidth: 1, borderColor: colors.border }]}
                onPress={() => chooseDate(date)}>
                <Text style={[textStyles.body, { color: draft[choosing] === date ? colors.interactive : colors.text }]}>
                  {dateLabel(date)}{draft[choosing] === date ? ' ✓' : ''}
                </Text>
              </Pressable>)}
              {!choices.some((date) => date.startsWith(month)) ? <Text style={[textStyles.body, { color: colors.textMuted }]}>No {choosing} dates in this month. Choose another month.</Text> : null}
            </View> : <>
            <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text
                  key={i}
                  style={{
                    width: '14.2857%',
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  {d}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {calendarDays(month).map((date, i) => {
                const enabled =
                  date !== null &&
                  choices.includes(date);
                const selected =
                  date !== null &&
                  date >= draft.arrival &&
                  date <= draft.departure;
                const endpoint = date === draft.arrival || date === draft.departure;
                const dayColors = calendarDayColors(colors, endpoint ? 'endpoint'
                  : selected ? 'range' : enabled ? 'available' : 'unavailable');
                return (
                  <Pressable
                    key={date ?? `blank-${i}`}
                    disabled={!enabled}
                    accessible={date !== null}
                    accessibilityRole="button"
                    accessibilityLabel={date ? `${dateLabel(date)}${date === draft.arrival ? '. Arrival' : date === draft.departure ? '. Departure' : ''}` : undefined}
                    accessibilityState={{ disabled: !enabled, selected }}
                    style={{
                      width: '14.2857%',
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: endpoint ? 24 : 8,
                      borderWidth: 1,
                      borderColor: dayColors.borderColor,
                      backgroundColor: dayColors.backgroundColor,
                    }}
                    onPress={() => {
                      if (!date) return;
                      chooseDate(date);
                    }}
                  >
                    <Text
                      style={{
                        color: dayColors.color,
                        fontFamily: selected ? fonts.semibold : fonts.body,
                      }}
                    >
                      {date ? Number(date.slice(8)) : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            </>}
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!validDraft}
              accessibilityState={{ disabled: !validDraft }}
              style={{
                ...button,
                ...sheetControl(colors),
                backgroundColor: validDraft ? colors.interactive : colors.cardRaised,
                borderColor: validDraft ? colors.interactive : colors.borderStrong,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              <Text style={[textStyles.body, { color: validDraft ? colors.onInteractive : colors.textSubtle, textAlign: 'center' }]}>Apply dates</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={button}
              onPress={() => setOpen(false)}
            >
              <Text style={[textStyles.body, { color: colors.interactive, textAlign: 'center' }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}
