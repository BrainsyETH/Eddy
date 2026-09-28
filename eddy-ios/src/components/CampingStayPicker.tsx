import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/typography';
import { calendarDays } from '@/lib/campingCalendar';
import { dateLabel } from '@/lib/campingHeatmap';
import { nextCampingDate, type CampingStay } from '@/lib/campingStay';

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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(stay);
  const [choosing, setChoosing] = useState<'arrival' | 'departure'>('arrival');
  const [month, setMonth] = useState(stay.arrival.slice(0, 7));
  const last = nights.length
    ? nextCampingDate(nights[nights.length - 1])
    : stay.departure;
  const months = [...new Set([...nights, last].map((d) => d.slice(0, 7)))];
  const index = months.indexOf(month);
  const button = {
    minHeight: 48,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
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
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Text style={[textStyles.sectionTitle, { color: colors.text }]}>
              Stay dates
            </Text>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              {(['arrival', 'departure'] as const).map((field) => (
                <Pressable
                  key={field}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choosing === field }}
                  style={button}
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
              <Text style={{ color: colors.text }}>
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
            <View style={{ flexDirection: 'row' }}>
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
                  (choosing === 'arrival'
                    ? nights.includes(date)
                    : date > draft.arrival && date <= last);
                const selected =
                  date !== null &&
                  date >= draft.arrival &&
                  date <= draft.departure;
                return (
                  <Pressable
                    key={date ?? `blank-${i}`}
                    disabled={!enabled}
                    accessibilityRole="button"
                    accessibilityLabel={date ? dateLabel(date) : undefined}
                    accessibilityState={{ disabled: !enabled, selected }}
                    style={{
                      width: '14.2857%',
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      backgroundColor: selected
                        ? colors.selectionBg
                        : colors.bg,
                    }}
                    onPress={() => {
                      if (!date) return;
                      if (choosing === 'arrival') {
                        setDraft({
                          arrival: date,
                          departure: nextCampingDate(date),
                        });
                        setChoosing('departure');
                      } else setDraft({ ...draft, departure: date });
                    }}
                  >
                    <Text
                      style={{
                        color: enabled ? colors.text : colors.textSubtle,
                      }}
                    >
                      {date ? Number(date.slice(8)) : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              style={{
                ...button,
                backgroundColor: colors.interactive,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              <Text style={{ color: colors.onInteractive }}>Apply dates</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={button}
              onPress={() => setOpen(false)}
            >
              <Text style={{ color: colors.interactive, textAlign: 'center' }}>
                Cancel
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
